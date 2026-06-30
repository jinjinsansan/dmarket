-- ============================================================
-- 0033 ユーザー作成市場（審査制＋作成者テラ銭10%）
-- ・任意ユーザーが市場を申請（status=draft, source=user）→ 管理者が承認/却下
-- ・解決時、ユーザー作成市場は出来高(買い総額)の creator_vig(既定0.10) を作成者へ
--   参加pt・換金不可・新規発行（誰からも引かない＝ride/winと同思想）。reason='creator'
-- ============================================================

-- reason 拡張（creator 追加）
alter table point_ledger drop constraint if exists point_ledger_reason_check;
alter table point_ledger add constraint point_ledger_reason_check
  check (reason in ('signup','daily','buy','sell','redeem','refund','admin_grant','admin_burn','affiliate','share','referral','ride','creator'));

-- markets.source に 'user' を許可
alter table markets drop constraint if exists markets_source_check;
alter table markets add constraint markets_source_check check (source in ('admin','template','mirror','user'));

-- creator_vig 既定 0.10 を seed＋設定許可
insert into platform_settings(key, value) values ('creator_vig', 0.10) on conflict (key) do nothing;
create or replace function admin_set_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_key not in ('signup_grant','daily_grant','b_default','prize_win_rate',
                   'share_bonus','referral_referrer','referral_referee','ride_rate','creator_vig') then
    raise exception 'unknown_key';
  end if;
  if p_value < 0 then raise exception 'negative'; end if;
  insert into platform_settings(key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform _audit('setting', jsonb_build_object('key', p_key), jsonb_build_object('value', p_value));
end; $$;

-- ── ユーザーによる市場申請（二択・審査待ち draft） ──
create or replace function submit_user_market(p_question text, p_category_id uuid, p_close_time timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_b numeric; v_mid uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_question,''))) < 8 then raise exception 'question_too_short'; end if;
  if p_close_time is null or p_close_time <= now() then raise exception 'invalid_close'; end if;
  if (select count(*) from markets where created_by = v_uid and status = 'draft' and source = 'user') >= 5 then
    raise exception 'too_many_pending';
  end if;
  v_b := coalesce((select value from platform_settings where key = 'b_default'), 200);
  insert into markets(category_id, question, description, image_url, market_kind, b_param, source,
                      resolution_kind, status, close_time, resolve_time, created_by)
    values (p_category_id, left(trim(p_question), 200), null, null, 'binary', v_b, 'user',
            'manual', 'draft', p_close_time, p_close_time, v_uid)
    returning id into v_mid;
  insert into outcomes(market_id, label, display_order, q) values
    (v_mid, 'YES', 0, 0), (v_mid, 'NO', 1, 0);
  return v_mid;
end; $$;
grant execute on function submit_user_market(text, uuid, timestamptz) to authenticated;

-- 自分の申請一覧
create or replace function my_submitted_markets()
returns table(id uuid, question text, status text, close_time timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, question, status, close_time, created_at
  from markets where created_by = auth.uid() and source = 'user'
  order by created_at desc limit 50;
$$;
grant execute on function my_submitted_markets() to authenticated;

-- ── 管理：審査キュー ──
create or replace function admin_list_pending_markets()
returns table(id uuid, question text, category text, display_name text, close_time timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select m.id, m.question, c.name, coalesce(pr.display_name,'匿名'), m.close_time, m.created_at
    from markets m
    left join categories c on c.id = m.category_id
    left join profiles pr on pr.user_id = m.created_by
    where m.source = 'user' and m.status = 'draft'
    order by m.created_at asc limit 200;
end; $$;
grant execute on function admin_list_pending_markets() to authenticated;

create or replace function admin_approve_market(p_market_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update markets set status = 'open' where id = p_market_id and source = 'user' and status = 'draft';
  if not found then raise exception 'not_pending'; end if;
  perform _audit('market_approve', jsonb_build_object('market_id', p_market_id), '{}'::jsonb);
  return true;
end; $$;
grant execute on function admin_approve_market(uuid) to authenticated;

create or replace function admin_reject_market(p_market_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  -- draft（未公開＝取引なし）のユーザー市場のみ削除可
  delete from outcomes where market_id = p_market_id
    and exists(select 1 from markets m where m.id = p_market_id and m.source='user' and m.status='draft');
  delete from markets where id = p_market_id and source = 'user' and status = 'draft';
  if not found then raise exception 'not_pending'; end if;
  perform _audit('market_reject', jsonb_build_object('market_id', p_market_id), '{}'::jsonb);
  return true;
end; $$;
grant execute on function admin_reject_market(uuid) to authenticated;

-- ── resolve_market 再定義（0032 ＋ 作成者テラ銭ブロック） ──
create or replace function resolve_market(p_market_id uuid, p_winning_outcome_id uuid, p_source_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_market markets%rowtype;
  v_count int;
  v_total bigint;
  v_rate numeric;
  v_ride numeric;
  v_vig numeric;
  v_vol bigint;
  v_cb bigint;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found'; end if;
  if v_market.status not in ('open','closed','resolving') then raise exception 'already_resolved'; end if;
  if not exists (select 1 from outcomes where id = p_winning_outcome_id and market_id = p_market_id) then raise exception 'invalid_outcome'; end if;

  update markets set status = 'resolved' where id = p_market_id;
  update outcomes set is_winner = (id = p_winning_outcome_id) where market_id = p_market_id;

  select count(*), coalesce(sum((shares * 100)::bigint), 0) into v_count, v_total
    from positions where outcome_id = p_winning_outcome_id and shares > 0;

  with winners as (
    select user_id, (shares * 100)::bigint as payout from positions where outcome_id = p_winning_outcome_id and shares > 0
  ),
  upd as (
    update wallets w set balance = w.balance + winners.payout from winners where w.user_id = winners.user_id
      returning w.user_id, w.balance as balance_after, winners.payout as payout
  )
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
  select user_id, payout, 'redeem', p_market_id, p_winning_outcome_id, null, balance_after from upd;

  v_rate := coalesce((select value from platform_settings where key = 'prize_win_rate'), 1);
  if v_rate > 0 then
    insert into prize_wallets(user_id, balance)
      select distinct user_id, 0 from positions where outcome_id = p_winning_outcome_id and shares > 0
      on conflict (user_id) do nothing;
    with awards as (
      select user_id, floor(shares * v_rate)::bigint as amt from positions where outcome_id = p_winning_outcome_id and shares > 0
    ),
    pos_awards as (select user_id, amt from awards where amt > 0),
    upd2 as (
      update prize_wallets pw set balance = pw.balance + pos_awards.amt from pos_awards where pw.user_id = pos_awards.user_id
        returning pw.user_id, pw.balance as balance_after, pos_awards.amt as amt
    )
    insert into prize_ledger(user_id, delta, reason, market_id, expires_at, balance_after)
    select user_id, amt, 'win_reward', p_market_id, now() + interval '90 days', balance_after from upd2;
  end if;

  -- 乗っかりボーナス（率 ride_rate）
  v_ride := coalesce((select value from platform_settings where key = 'ride_rate'), 0.01);
  if v_ride > 0 then
    with rides as (
      select rs.sharer_id, floor((p.shares * 100) * v_ride)::bigint as amt
      from ride_shares rs
      join positions p on p.user_id = rs.rider_id and p.outcome_id = p_winning_outcome_id and p.shares > 0
      where rs.market_id = p_market_id
    ),
    agg as (select sharer_id, sum(amt) as amt from rides group by sharer_id having sum(amt) > 0),
    updr as (
      update wallets w set balance = w.balance + agg.amt from agg where w.user_id = agg.sharer_id
        returning w.user_id, w.balance as balance_after, agg.amt as amt
    )
    insert into point_ledger(user_id, delta, reason, market_id, balance_after)
    select user_id, amt, 'ride', p_market_id, balance_after from updr;
  end if;

  -- 作成者テラ銭（ユーザー作成市場のみ・買い総額 × creator_vig を作成者へ新規発行）
  if v_market.source = 'user' and v_market.created_by is not null then
    v_vig := coalesce((select value from platform_settings where key = 'creator_vig'), 0.10);
    select coalesce(sum(-delta), 0) into v_vol from point_ledger where market_id = p_market_id and reason = 'buy';
    if v_vig > 0 and v_vol > 0 then
      update wallets set balance = balance + floor(v_vol * v_vig)::bigint
        where user_id = v_market.created_by returning balance into v_cb;
      if v_cb is not null then
        insert into point_ledger(user_id, delta, reason, market_id, balance_after)
          values (v_market.created_by, floor(v_vol * v_vig)::bigint, 'creator', p_market_id, v_cb);
      end if;
    end if;
  end if;

  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, p_winning_outcome_id, v_market.resolution_kind, p_source_url, auth.uid());

  return jsonb_build_object('ok', true, 'winners_count', v_count, 'total_paid', v_total);
end; $$;
revoke execute on function resolve_market(uuid, uuid, text) from authenticated, anon;
