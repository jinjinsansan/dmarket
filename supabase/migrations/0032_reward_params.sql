-- ============================================================
-- 0032 報酬パラメータの設定化（/admin/params で可変に）
-- share_bonus / referral_referrer / referral_referee / ride_rate を platform_settings へ。
-- 既定: share 20 / 紹介者 200 / 被紹介 100 / 乗っかり率 0.01。各RPCは設定値を coalesce で読む。
-- ============================================================

-- 既定値を seed（無ければ作成。UIで実値が見えるように）
insert into platform_settings(key, value) values
  ('prize_win_rate', 1), ('share_bonus', 20),
  ('referral_referrer', 200), ('referral_referee', 100), ('ride_rate', 0.01)
on conflict (key) do nothing;

-- admin_set_setting のホワイトリストを拡張（全設定キーを許可）
create or replace function admin_set_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_key not in ('signup_grant','daily_grant','b_default','prize_win_rate',
                   'share_bonus','referral_referrer','referral_referee','ride_rate') then
    raise exception 'unknown_key';
  end if;
  if p_value < 0 then raise exception 'negative'; end if;
  insert into platform_settings(key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform _audit('setting', jsonb_build_object('key', p_key), jsonb_build_object('value', p_value));
end; $$;

-- シェアボーナス（設定 share_bonus・既定20）
create or replace function claim_share_bonus()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Tokyo')::date; v_amt bigint; v_balance bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into share_grants(user_id, grant_date) values (v_uid, v_today) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_claimed'); end if;
  v_amt := coalesce((select value from platform_settings where key = 'share_bonus'), 20)::bigint;
  update wallets set balance = balance + v_amt where user_id = v_uid returning balance into v_balance;
  if v_balance is null then raise exception 'no_wallet'; end if;
  insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, v_amt, 'share', v_balance);
  return jsonb_build_object('ok', true, 'granted', v_amt, 'balance', v_balance);
end; $$;

-- 友達紹介（設定 referral_referrer/referee・既定200/100）
create or replace function apply_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ref uuid; v_rr bigint; v_re bigint; v_rb bigint; v_eb bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if exists(select 1 from referrals where referee_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_referred');
  end if;
  select user_id into v_ref from profiles where ref_code(user_id) = upper(trim(p_code)) limit 1;
  if v_ref is null then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;
  if v_ref = v_uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  insert into referrals(referee_id, referrer_id) values (v_uid, v_ref) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_referred'); end if;
  v_rr := coalesce((select value from platform_settings where key = 'referral_referrer'), 200)::bigint;
  v_re := coalesce((select value from platform_settings where key = 'referral_referee'), 100)::bigint;
  update wallets set balance = balance + v_rr where user_id = v_ref returning balance into v_rb;
  if v_rb is not null then
    insert into point_ledger(user_id, delta, reason, balance_after) values (v_ref, v_rr, 'referral', v_rb);
  end if;
  update wallets set balance = balance + v_re where user_id = v_uid returning balance into v_eb;
  if v_eb is null then raise exception 'no_wallet'; end if;
  insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, v_re, 'referral', v_eb);
  return jsonb_build_object('ok', true, 'granted', v_re, 'balance', v_eb);
end; $$;

-- resolve_market（乗っかり率を設定 ride_rate・既定0.01 から読む。他は0030と同一）
create or replace function resolve_market(p_market_id uuid, p_winning_outcome_id uuid, p_source_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_market markets%rowtype; v_count int; v_total bigint; v_rate numeric; v_ride numeric;
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

  -- 乗っかりボーナス（率は設定 ride_rate）
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

  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, p_winning_outcome_id, v_market.resolution_kind, p_source_url, auth.uid());

  return jsonb_build_object('ok', true, 'winners_count', v_count, 'total_paid', v_total);
end; $$;
revoke execute on function resolve_market(uuid, uuid, text) from authenticated, anon;
