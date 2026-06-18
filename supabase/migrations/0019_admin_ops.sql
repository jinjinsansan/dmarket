-- ============================================================
-- 0019 管理運用 P0: 経済モニタ / 市場マネージャ / プラットフォーム設定 / 手動ジョブ
-- コールドスタートの調整（b・付与額）を可能にし、ポイント供給を監視できるようにする。
-- ============================================================

-- プラットフォーム設定（数値パラメータ）
create table if not exists platform_settings (
  key        text primary key,
  value      numeric not null,
  updated_at timestamptz not null default now()
);
insert into platform_settings(key, value) values
  ('signup_grant', 1000), ('daily_grant', 100), ('b_default', 200)
on conflict (key) do nothing;
alter table platform_settings enable row level security;
create policy "public settings" on platform_settings for select using (true);

-- 付与RPCを設定値から読むように変更（既定値フォールバック）
create or replace function grant_signup_bonus()
returns void language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_grant bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_grant := coalesce((select value from platform_settings where key = 'signup_grant'), 1000)::bigint;
  insert into wallets(user_id, balance) values (v_uid, v_grant) on conflict (user_id) do nothing;
  if found then
    insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, v_grant, 'signup', v_grant);
  end if;
end;
$$;

create or replace function claim_daily_grant()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Tokyo')::date; v_balance bigint; v_grant bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into daily_grants(user_id, grant_date) values (v_uid, v_today) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_claimed'); end if;
  v_grant := coalesce((select value from platform_settings where key = 'daily_grant'), 100)::bigint;
  update wallets set balance = balance + v_grant where user_id = v_uid returning balance into v_balance;
  if v_balance is null then raise exception 'no_wallet'; end if;
  insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, v_grant, 'daily', v_balance);
  return jsonb_build_object('ok', true, 'granted', v_grant, 'balance', v_balance);
end;
$$;

-- 設定の取得/更新（管理）
create or replace function admin_get_settings()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from platform_settings);
end;
$$;
create or replace function admin_set_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_key not in ('signup_grant','daily_grant','b_default') then raise exception 'unknown_key'; end if;
  if p_value < 0 then raise exception 'negative'; end if;
  insert into platform_settings(key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform _audit('setting', jsonb_build_object('key', p_key), jsonb_build_object('value', p_value));
end;
$$;

-- ── 経済モニタ ───────────────────────────────────────────────
create or replace function admin_economy()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_wallet bigint; v_ledger bigint;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select coalesce(sum(balance),0) into v_wallet from wallets;
  select coalesce(sum(delta),0)   into v_ledger from point_ledger;
  return jsonb_build_object(
    'total_supply', v_wallet,
    'ledger_sum',   v_ledger,
    'audit_ok',     v_wallet = v_ledger,
    'by_reason', (select coalesce(jsonb_object_agg(reason, s), '{}'::jsonb)
                  from (select reason, sum(delta) s from point_ledger group by reason) t),
    'trading_subsidy', (select coalesce(sum(delta),0) from point_ledger where reason in ('buy','sell','redeem','refund')),
    'issued_free',     (select coalesce(sum(delta),0) from point_ledger where reason in ('signup','daily','admin_grant','admin_burn')),
    'inflation_today', (select coalesce(sum(delta),0) from point_ledger
                        where (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date),
    'users',            (select count(*) from wallets),
    'markets_open',     (select count(*) from markets where status='open'),
    'markets_resolved', (select count(*) from markets where status='resolved')
  );
end;
$$;

-- ── 市場マネージャ ───────────────────────────────────────────
create or replace function admin_list_markets(p_status text default null)
returns table(id uuid, question text, category text, source text, status text, b_param numeric,
              close_time timestamptz, resolve_time timestamptz, outcome_count int, volume numeric, holders int, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select m.id, m.question, c.name, m.source, m.status, m.b_param, m.close_time, m.resolve_time,
           (select count(*)::int from outcomes o where o.market_id = m.id),
           (select coalesce(sum(ord.size),0) from orders ord where ord.market_id = m.id),
           (select count(distinct pos.user_id)::int from positions pos
              join outcomes o2 on o2.id = pos.outcome_id where o2.market_id = m.id and pos.shares > 0),
           m.created_at
    from markets m
    left join categories c on c.id = m.category_id
    where (p_status is null or m.status = p_status)
    order by m.created_at desc
    limit 300;
end;
$$;

-- 編集（b_param・締切・質問・画像）。b変更は価格に影響するため監査必須。
create or replace function admin_update_market(p_market_id uuid, p_b numeric, p_close_time timestamptz,
                                               p_resolve_time timestamptz, p_question text, p_image_url text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_b is not null and p_b <= 0 then raise exception 'invalid_b'; end if;
  update markets set
    b_param      = coalesce(p_b, b_param),
    close_time   = coalesce(p_close_time, close_time),
    resolve_time = coalesce(p_resolve_time, resolve_time),
    question     = coalesce(nullif(p_question,''), question),
    image_url    = coalesce(p_image_url, image_url)
  where id = p_market_id;
  perform _audit('update_market', jsonb_build_object('market_id', p_market_id),
                 jsonb_build_object('b', p_b, 'close', p_close_time));
end;
$$;

-- 表示/非表示（draft=非表示, open=表示）。終端状態は変更しない。
create or replace function admin_set_market_status(p_market_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('draft','open') then raise exception 'invalid_status'; end if;
  update markets set status = p_status where id = p_market_id and status in ('draft','open','closed');
  perform _audit('set_market_status', jsonb_build_object('market_id', p_market_id), jsonb_build_object('status', p_status));
end;
$$;

-- ── 手動ジョブ: 集計（生成/解決は Edge Function を直接叩く） ──
create or replace function admin_refresh_stats()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform refresh_user_stats();
end;
$$;

grant execute on function admin_get_settings()                     to authenticated;
grant execute on function admin_set_setting(text, numeric)         to authenticated;
grant execute on function admin_economy()                          to authenticated;
grant execute on function admin_list_markets(text)                 to authenticated;
grant execute on function admin_update_market(uuid,numeric,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function admin_set_market_status(uuid, text)      to authenticated;
grant execute on function admin_refresh_stats()                    to authenticated;
