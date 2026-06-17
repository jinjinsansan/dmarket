-- ============================================================
-- 0004 取引RPC（SPEC-02 §3）
-- buy_shares / sell_shares。対象 market を FOR UPDATE 行ロックしてから
-- 価格計算・更新（レース防止）。端数はシステム有利（買い=ceil / 売り=floor）。
-- 単一トランザクション → 例外で全ロールバック。
-- ============================================================

-- outcome k を Δ株 買う。コスト = ceil((C(q+Δe_k) - C(q)) × 100)
create or replace function buy_shares(p_outcome_id uuid, p_shares numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_market      markets%rowtype;
  v_b           float8;
  v_ids         uuid[];
  v_q           float8[];
  v_q2          float8[];
  v_k           int;
  v_cost_u      float8;
  v_cost_points bigint;
  v_balance     bigint;
  v_new_balance bigint;
  v_prices      jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_shares is null or p_shares <= 0 then raise exception 'invalid_shares'; end if;

  -- 対象市場を行ロック
  select m.* into v_market
    from markets m
    join outcomes o on o.market_id = m.id
    where o.id = p_outcome_id
    for update of m;
  if not found then raise exception 'outcome_not_found'; end if;
  if v_market.status <> 'open' or now() >= v_market.close_time then
    raise exception 'market_closed';
  end if;
  v_b := v_market.b_param::float8;

  -- q ベクトル（display_order 順）と対象 index
  select array_agg(o.id order by o.display_order),
         array_agg(o.q::float8 order by o.display_order)
    into v_ids, v_q
    from outcomes o where o.market_id = v_market.id;
  select i into v_k from generate_subscripts(v_ids, 1) as i where v_ids[i] = p_outcome_id;

  -- コスト（買い切り上げ）
  v_q2 := v_q;
  v_q2[v_k] := v_q2[v_k] + p_shares::float8;
  v_cost_u := lmsr_cost(v_q2, v_b) - lmsr_cost(v_q, v_b);
  v_cost_points := ceil(v_cost_u * 100)::bigint;
  if v_cost_points < 1 then raise exception 'trade_too_small'; end if;

  -- 残高チェック（wallet も行ロック）
  select balance into v_balance from wallets where user_id = v_uid for update;
  if not found then raise exception 'no_wallet'; end if;
  if v_balance < v_cost_points then raise exception 'insufficient_balance'; end if;
  v_new_balance := v_balance - v_cost_points;

  -- 適用
  update wallets set balance = v_new_balance where user_id = v_uid;
  insert into positions(user_id, outcome_id, shares, cost_basis)
    values (v_uid, p_outcome_id, p_shares, v_cost_points)
    on conflict (user_id, outcome_id)
    do update set shares     = positions.shares + p_shares,
                  cost_basis = positions.cost_basis + v_cost_points;
  update outcomes set q = q + p_shares where id = p_outcome_id;
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
    values (v_uid, -v_cost_points, 'buy', v_market.id, p_outcome_id, p_shares, v_new_balance);

  -- 価格履歴を記録し、更新後の全価格を返す
  perform record_market_prices(v_market.id);
  select jsonb_agg(jsonb_build_object('outcome_id', mp.outcome_id, 'price', mp.price))
    into v_prices from lmsr_market_prices(v_market.id) as mp;

  return jsonb_build_object(
    'ok', true, 'cost_points', v_cost_points, 'shares', p_shares,
    'new_prices', v_prices, 'balance', v_new_balance);
end;
$$;

-- outcome k を Δ株 売る。受取 = floor((C(q) - C(q-Δe_k)) × 100)
create or replace function sell_shares(p_outcome_id uuid, p_shares numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_market       markets%rowtype;
  v_b            float8;
  v_ids          uuid[];
  v_q            float8[];
  v_q2           float8[];
  v_k            int;
  v_recv_u       float8;
  v_recv_points  bigint;
  v_balance      bigint;
  v_new_balance  bigint;
  v_shares_before numeric;
  v_cost_before  bigint;
  v_cost_reduce  bigint;
  v_prices       jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_shares is null or p_shares <= 0 then raise exception 'invalid_shares'; end if;

  select m.* into v_market
    from markets m
    join outcomes o on o.market_id = m.id
    where o.id = p_outcome_id
    for update of m;
  if not found then raise exception 'outcome_not_found'; end if;
  if v_market.status <> 'open' or now() >= v_market.close_time then
    raise exception 'market_closed';
  end if;
  v_b := v_market.b_param::float8;

  -- 保有チェック
  select shares, cost_basis into v_shares_before, v_cost_before
    from positions where user_id = v_uid and outcome_id = p_outcome_id for update;
  if not found or v_shares_before < p_shares then
    raise exception 'insufficient_shares';
  end if;

  select array_agg(o.id order by o.display_order),
         array_agg(o.q::float8 order by o.display_order)
    into v_ids, v_q
    from outcomes o where o.market_id = v_market.id;
  select i into v_k from generate_subscripts(v_ids, 1) as i where v_ids[i] = p_outcome_id;

  -- 受取（売り切り捨て）
  v_q2 := v_q;
  v_q2[v_k] := v_q2[v_k] - p_shares::float8;
  v_recv_u := lmsr_cost(v_q, v_b) - lmsr_cost(v_q2, v_b);
  v_recv_points := floor(v_recv_u * 100)::bigint;
  if v_recv_points < 1 then raise exception 'trade_too_small'; end if;

  -- cost_basis は按分減算（売却分に対応する取得原価を取り崩す）
  v_cost_reduce := round(v_cost_before * (p_shares / v_shares_before))::bigint;

  select balance into v_balance from wallets where user_id = v_uid for update;
  v_new_balance := v_balance + v_recv_points;

  update wallets set balance = v_new_balance where user_id = v_uid;
  update positions
    set shares     = shares - p_shares,
        cost_basis = cost_basis - v_cost_reduce
    where user_id = v_uid and outcome_id = p_outcome_id;
  update outcomes set q = q - p_shares where id = p_outcome_id;
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
    values (v_uid, v_recv_points, 'sell', v_market.id, p_outcome_id, -p_shares, v_new_balance);

  perform record_market_prices(v_market.id);
  select jsonb_agg(jsonb_build_object('outcome_id', mp.outcome_id, 'price', mp.price))
    into v_prices from lmsr_market_prices(v_market.id) as mp;

  return jsonb_build_object(
    'ok', true, 'recv_points', v_recv_points, 'shares', p_shares,
    'new_prices', v_prices, 'balance', v_new_balance);
end;
$$;

grant execute on function buy_shares(uuid, numeric)  to authenticated;
grant execute on function sell_shares(uuid, numeric) to authenticated;
