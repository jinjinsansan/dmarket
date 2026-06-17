-- ============================================================
-- 0005 解決・償還RPC（SPEC-02 §5）
-- resolve_market（勝者一括償還・冪等）/ void_market（cost_basis 返金）。
-- 終端状態（resolved/void）は不可逆。FOR UPDATE で二重解決を防ぐ。
-- 償還は set-based（大量ポジションでも往復1回）。balance_after は更新後値を返す。
-- ============================================================

-- 勝ち outcome を確定し、勝ち株×100pt を一括償還
create or replace function resolve_market(
  p_market_id uuid,
  p_winning_outcome_id uuid,
  p_source_url text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market   markets%rowtype;
  v_count    int;
  v_total    bigint;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found'; end if;
  if v_market.status not in ('open','closed','resolving') then
    raise exception 'already_resolved';
  end if;
  if not exists (
    select 1 from outcomes where id = p_winning_outcome_id and market_id = p_market_id
  ) then
    raise exception 'invalid_outcome';
  end if;

  update markets set status = 'resolved' where id = p_market_id;
  update outcomes set is_winner = (id = p_winning_outcome_id) where market_id = p_market_id;

  -- 集計（戻り値用）
  select count(*), coalesce(sum((shares * 100)::bigint), 0)
    into v_count, v_total
    from positions where outcome_id = p_winning_outcome_id and shares > 0;

  -- 勝者一括償還 ＋ 台帳記録（balance_after は更新後の残高）
  with winners as (
    select user_id, (shares * 100)::bigint as payout
    from positions
    where outcome_id = p_winning_outcome_id and shares > 0
  ),
  upd as (
    update wallets w
      set balance = w.balance + winners.payout
      from winners
      where w.user_id = winners.user_id
      returning w.user_id, w.balance as balance_after, winners.payout as payout
  )
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
  select user_id, payout, 'redeem', p_market_id, p_winning_outcome_id, null, balance_after
  from upd;

  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, p_winning_outcome_id, v_market.resolution_kind, p_source_url, auth.uid());

  return jsonb_build_object('ok', true, 'winners_count', v_count, 'total_paid', v_total);
end;
$$;

-- 中止。各保有者へ cost_basis（買値ベース）を返金
create or replace function void_market(p_market_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_count  int;
  v_total  bigint;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found'; end if;
  if v_market.status not in ('open','closed','resolving') then
    raise exception 'already_resolved';
  end if;

  select count(distinct p.user_id), coalesce(sum(p.cost_basis), 0)
    into v_count, v_total
    from positions p join outcomes o on o.id = p.outcome_id
    where o.market_id = p_market_id and p.cost_basis > 0;

  with refunds as (
    select p.user_id, sum(p.cost_basis)::bigint as amt
    from positions p join outcomes o on o.id = p.outcome_id
    where o.market_id = p_market_id and p.cost_basis > 0
    group by p.user_id
  ),
  upd as (
    update wallets w
      set balance = w.balance + refunds.amt
      from refunds
      where w.user_id = refunds.user_id
      returning w.user_id, w.balance as balance_after, refunds.amt as amt
  )
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
  select user_id, amt, 'refund', p_market_id, null, null, balance_after
  from upd;

  update markets set status = 'void' where id = p_market_id;
  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, null, 'void', p_reason, auth.uid());

  return jsonb_build_object('ok', true, 'refunded_users', v_count, 'total_refunded', v_total);
end;
$$;

-- 解決RPCは通常サーバー側（自動解決ジョブ=service_role / 管理RPC経由）から呼ぶ。
-- 直接の authenticated 実行は許可しない（管理者検証は SPEC-07 の管理RPCで行う）。
revoke execute on function resolve_market(uuid, uuid, text) from authenticated, anon;
revoke execute on function void_market(uuid, text)         from authenticated, anon;
