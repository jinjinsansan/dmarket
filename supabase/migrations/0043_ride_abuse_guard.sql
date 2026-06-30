-- ============================================================
-- 0043 乗っかりボーナスの不正・インフレ対策
-- ① フラグ付き（多重アカウント疑い is_flagged）の rider / sharer を乗っかり報酬から除外
-- ② 1市場 × シェア元あたりの上限 ride_max_per_market（管理画面で可変・0=無制限）
-- resolve_market（0034版）の乗っかりブロックのみ変更。他は同一。
-- ============================================================

-- 上限設定を seed（既定 5000pt/市場・シェア元）。0で無制限。
insert into platform_settings(key, value) values ('ride_max_per_market', 5000)
on conflict (key) do nothing;

-- 設定ホワイトリストに ride_max_per_market を追加（0033版を再定義）
create or replace function admin_set_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_key not in ('signup_grant','daily_grant','b_default','prize_win_rate',
                   'share_bonus','referral_referrer','referral_referee','ride_rate','creator_vig',
                   'ride_max_per_market') then
    raise exception 'unknown_key';
  end if;
  if p_value < 0 then raise exception 'negative'; end if;
  insert into platform_settings(key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform _audit('setting', jsonb_build_object('key', p_key), jsonb_build_object('value', p_value));
end; $$;

-- resolve_market 再定義（0034 ＋ 乗っかり対策）
create or replace function resolve_market(p_market_id uuid, p_winning_outcome_id uuid, p_source_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_market markets%rowtype;
  v_count int;
  v_total bigint;
  v_rate numeric;
  v_ride numeric;
  v_ride_cap numeric;
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

  -- 勝者の払戻しは「保留」に記録（claim_winnings で受け取る＝完全Poly式）
  insert into pending_winnings(user_id, market_id, outcome_id, amount)
    select user_id, p_market_id, p_winning_outcome_id, (shares * 100)::bigint
    from positions where outcome_id = p_winning_outcome_id and shares > 0
    on conflict (user_id, market_id) do nothing;

  -- 的中報酬（ゴリラコイン）※自動
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

  -- 乗っかりボーナス ※自動（フラグ付きrider/sharerは除外・1市場×シェア元あたり上限）
  v_ride := coalesce((select value from platform_settings where key = 'ride_rate'), 0.01);
  v_ride_cap := coalesce((select value from platform_settings where key = 'ride_max_per_market'), 0);
  if v_ride > 0 then
    with rides as (
      select rs.sharer_id, floor((p.shares * 100) * v_ride)::bigint as amt
      from ride_shares rs
      join positions p on p.user_id = rs.rider_id and p.outcome_id = p_winning_outcome_id and p.shares > 0
      left join profiles prr on prr.user_id = rs.rider_id
      left join profiles prs on prs.user_id = rs.sharer_id
      where rs.market_id = p_market_id
        and coalesce(prr.is_flagged, false) = false
        and coalesce(prs.is_flagged, false) = false
    ),
    agg0 as (select sharer_id, sum(amt) as amt from rides group by sharer_id having sum(amt) > 0),
    agg as (select sharer_id, case when v_ride_cap > 0 then least(amt, v_ride_cap::bigint) else amt end as amt from agg0),
    updr as (
      update wallets w set balance = w.balance + agg.amt from agg where w.user_id = agg.sharer_id
        returning w.user_id, w.balance as balance_after, agg.amt as amt
    )
    insert into point_ledger(user_id, delta, reason, market_id, balance_after)
    select user_id, amt, 'ride', p_market_id, balance_after from updr;
  end if;

  -- 作成者テラ銭 ※自動
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
