-- ============================================================
-- 0026 参加ポイント獲得（アフィリエイト成果型）Phase 1：手動消し込み
--
-- 設計: 参加ポイント獲得_アフィリエイト設計案.md
--   ・案件マスタ(affiliate_offers) / クリック計測(affiliate_clicks) / 成果(affiliate_conversions)
--   ・成果確定は「管理者がASPレポートと突き合わせて token を承認」→ 参加pt無償付与
--   ・参加ptは既存 wallets/point_ledger を使用（reason='affiliate' を追加）
--   ・postback自動化(Phase 2)は本MIGには含めない
--
-- 不変条件は維持: wallets.balance == Σ point_ledger.delta。
-- AdSense等のインセンティブクリックは不採用（アフィリエイト成果型のみ）。
-- ============================================================

-- point_ledger の reason に 'affiliate' を許可（0018 と同方式で貼り替え）
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'point_ledger'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%reason%';
  if c is not null then execute 'alter table point_ledger drop constraint ' || quote_ident(c); end if;
end $$;
alter table point_ledger add constraint point_ledger_reason_check
  check (reason in ('signup','daily','buy','sell','redeem','refund','admin_grant','admin_burn','affiliate'));

-- 提携案件マスタ
create table if not exists affiliate_offers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  image_url     text,
  reward_points bigint not null check (reward_points > 0), -- 成果時に付与する参加pt
  asp           text,                     -- a8 / afb / accesstrade 等
  click_url     text not null,            -- 計測リンク雛形（{TOKEN} を sub-id に差込）
  incentive_ok  boolean not null default false, -- 広告主がインセンティブ付き成果を許可しているか
  is_active     boolean not null default true,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

-- クリック（sub-id トークンの発行記録）
create table if not exists affiliate_clicks (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  offer_id   uuid not null references affiliate_offers(id),
  clicked_at timestamptz not null default now()
);
create index if not exists affiliate_clicks_user_idx  on affiliate_clicks(user_id, clicked_at desc);
create index if not exists affiliate_clicks_offer_idx on affiliate_clicks(offer_id, clicked_at desc);

-- 成果（手動承認 or 将来のpostbackで作成）。1クリック1成果。
create table if not exists affiliate_conversions (
  id            uuid primary key default gen_random_uuid(),
  token         uuid references affiliate_clicks(token),
  user_id       uuid not null references auth.users(id),
  offer_id      uuid not null references affiliate_offers(id),
  reward_points bigint not null,
  status        text not null default 'approved' check (status in ('pending','approved','rejected')),
  external_id   text,                     -- ASP側の成果ID（Phase 2用）
  created_at    timestamptz not null default now(),
  unique (token)                          -- 二重付与防止（手動・自動とも）
);
create index if not exists affiliate_conversions_user_idx on affiliate_conversions(user_id, created_at desc);

-- ============================================================
-- RLS：案件は公開（有効分）。クリック/成果は本人のみ。書込は definer RPC。
-- ============================================================
alter table affiliate_offers      enable row level security;
alter table affiliate_clicks      enable row level security;
alter table affiliate_conversions enable row level security;

create policy "public offers"      on affiliate_offers      for select using (is_active = true);
create policy "own clicks"         on affiliate_clicks      for select using (user_id = auth.uid());
create policy "own conversions"    on affiliate_conversions for select using (user_id = auth.uid());

-- ============================================================
-- RPC
-- ============================================================

-- クリック発行（本人）。計測URL（token差込済み）を返す。
create or replace function create_affiliate_click(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_offer affiliate_offers%rowtype; v_token uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_offer from affiliate_offers where id = p_offer_id and is_active = true;
  if not found then raise exception 'offer_unavailable'; end if;
  insert into affiliate_clicks(user_id, offer_id) values (v_uid, p_offer_id) returning token into v_token;
  return jsonb_build_object('ok', true, 'token', v_token,
    'url', replace(v_offer.click_url, '{TOKEN}', v_token::text));
end;
$$;

-- 成果の手動承認（管理者）。token から該当ユーザー/案件を特定し参加ptを無償付与。
-- 二重承認は unique(token) と事前チェックで防止。
create or replace function admin_approve_conversion(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_click affiliate_clicks%rowtype; v_offer affiliate_offers%rowtype; v_bal bigint;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select * into v_click from affiliate_clicks where token = p_token;
  if not found then raise exception 'click_not_found'; end if;
  if exists (select 1 from affiliate_conversions where token = p_token) then
    raise exception 'already_processed';
  end if;
  select * into v_offer from affiliate_offers where id = v_click.offer_id;

  insert into wallets(user_id, balance) values (v_click.user_id, 0) on conflict (user_id) do nothing;
  update wallets set balance = balance + v_offer.reward_points
    where user_id = v_click.user_id returning balance into v_bal;
  insert into point_ledger(user_id, delta, reason, balance_after)
    values (v_click.user_id, v_offer.reward_points, 'affiliate', v_bal);

  insert into affiliate_conversions(token, user_id, offer_id, reward_points, status)
    values (p_token, v_click.user_id, v_click.offer_id, v_offer.reward_points, 'approved');

  perform _audit('affiliate_approve', jsonb_build_object('token', p_token, 'user', v_click.user_id),
                 jsonb_build_object('offer', v_offer.id, 'points', v_offer.reward_points));
  return jsonb_build_object('ok', true, 'granted', v_offer.reward_points, 'balance', v_bal);
end;
$$;

-- ── 管理: 案件マスタ ──────────────────────────────────────────
create or replace function admin_list_offers()
returns setof affiliate_offers language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query select * from affiliate_offers order by display_order, created_at desc;
end;
$$;

create or replace function admin_upsert_offer(
  p_id uuid, p_name text, p_description text, p_image_url text,
  p_reward_points bigint, p_asp text, p_click_url text,
  p_incentive_ok boolean, p_is_active boolean, p_display_order int
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'invalid_name'; end if;
  if p_reward_points is null or p_reward_points <= 0 then raise exception 'invalid_reward'; end if;
  if p_click_url is null or btrim(p_click_url) = '' then raise exception 'invalid_url'; end if;

  if p_id is null then
    insert into affiliate_offers(name, description, image_url, reward_points, asp, click_url, incentive_ok, is_active, display_order)
      values (p_name, p_description, p_image_url, p_reward_points, p_asp, p_click_url,
              coalesce(p_incentive_ok, false), coalesce(p_is_active, true), coalesce(p_display_order, 0))
      returning id into v_id;
  else
    update affiliate_offers set
      name=p_name, description=p_description, image_url=p_image_url, reward_points=p_reward_points,
      asp=p_asp, click_url=p_click_url, incentive_ok=coalesce(p_incentive_ok, incentive_ok),
      is_active=coalesce(p_is_active, is_active), display_order=coalesce(p_display_order, display_order)
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'offer_not_found'; end if;
  end if;

  perform _audit('upsert_offer', jsonb_build_object('offer_id', v_id),
                 jsonb_build_object('name', p_name, 'reward', p_reward_points));
  return v_id;
end;
$$;

create or replace function admin_set_offer_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update affiliate_offers set is_active = p_active where id = p_id;
  if not found then raise exception 'offer_not_found'; end if;
  perform _audit('set_offer_active', jsonb_build_object('offer_id', p_id), jsonb_build_object('active', p_active));
end;
$$;

-- ── 管理: 成果履歴 / 消し込み待ちクリック ────────────────────
create or replace function admin_list_conversions()
returns table(id uuid, token uuid, user_id uuid, display_name text,
              offer_id uuid, offer_name text, reward_points bigint, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select c.id, c.token, c.user_id, coalesce(pr.display_name, '—'),
           c.offer_id, o.name, c.reward_points, c.status, c.created_at
    from affiliate_conversions c
    join affiliate_offers o on o.id = c.offer_id
    left join profiles pr on pr.user_id = c.user_id
    order by c.created_at desc
    limit 500;
end;
$$;

-- まだ成果承認されていないクリック（消し込みの参照用）
create or replace function admin_recent_clicks()
returns table(token uuid, user_id uuid, display_name text,
              offer_id uuid, offer_name text, clicked_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select k.token, k.user_id, coalesce(pr.display_name, '—'),
           k.offer_id, o.name, k.clicked_at
    from affiliate_clicks k
    join affiliate_offers o on o.id = k.offer_id
    left join profiles pr on pr.user_id = k.user_id
    where not exists (select 1 from affiliate_conversions c where c.token = k.token)
    order by k.clicked_at desc
    limit 300;
end;
$$;

-- 実行権限
grant execute on function create_affiliate_click(uuid)                              to authenticated;
grant execute on function admin_approve_conversion(uuid)                            to authenticated;
grant execute on function admin_list_offers()                                       to authenticated;
grant execute on function admin_upsert_offer(uuid,text,text,text,bigint,text,text,boolean,boolean,int) to authenticated;
grant execute on function admin_set_offer_active(uuid, boolean)                     to authenticated;
grant execute on function admin_list_conversions()                                  to authenticated;
grant execute on function admin_recent_clicks()                                     to authenticated;
