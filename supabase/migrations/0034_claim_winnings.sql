-- ============================================================
-- 0034 完全Poly式の的中受け取り（保留→Claim）
-- 解決時に勝者へ即付与せず pending_winnings に記録。ユーザーが claim_winnings() で
-- 受け取って初めてウォレットに反映（reason='redeem'）。
-- ※ net_worth は all_open_prices()（open市場のみ）で算出＝解決済ポジションは評価対象外。
--   よって保留中はnet_worthに含まれず、claim後にウォレット反映＝二重計上なし。
-- 賞品pt/乗っかり/作成者テラ銭は従来どおり解決時に自動付与（プレイヤー本人の的中分のみClaim制）。
-- ============================================================

create table if not exists pending_winnings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id),
  market_id  uuid not null references markets(id) on delete cascade,
  outcome_id uuid not null references outcomes(id),
  amount     bigint not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  unique (user_id, market_id)
);
alter table pending_winnings enable row level security;
drop policy if exists "own pending_winnings" on pending_winnings;
create policy "own pending_winnings" on pending_winnings for select using (user_id = auth.uid());

-- 受け取り（未受取の的中をまとめてウォレットへ）
create or replace function claim_winnings()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_total bigint; v_bal bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select coalesce(sum(amount), 0) into v_total from pending_winnings where user_id = v_uid and claimed_at is null;
  if v_total <= 0 then return jsonb_build_object('ok', false, 'reason', 'nothing'); end if;
  update wallets set balance = balance + v_total where user_id = v_uid returning balance into v_bal;
  if v_bal is null then raise exception 'no_wallet'; end if;
  insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, v_total, 'redeem', v_bal);
  update pending_winnings set claimed_at = now() where user_id = v_uid and claimed_at is null;
  return jsonb_build_object('ok', true, 'claimed', v_total, 'balance', v_bal);
end; $$;
grant execute on function claim_winnings() to authenticated;

-- resolve_market 再定義（0033 ＋ 勝者払戻しを pending_winnings に記録する方式へ）
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

  -- 勝者の払戻しは「保留」に記録（claim_winnings で受け取る＝完全Poly式）
  insert into pending_winnings(user_id, market_id, outcome_id, amount)
    select user_id, p_market_id, p_winning_outcome_id, (shares * 100)::bigint
    from positions where outcome_id = p_winning_outcome_id and shares > 0
    on conflict (user_id, market_id) do nothing;

  -- 的中報酬（賞品ポイント）※自動
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

  -- 乗っかりボーナス ※自動
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
