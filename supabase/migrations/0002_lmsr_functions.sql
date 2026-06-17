-- ============================================================
-- 0002 LMSR 価格エンジン（SPEC-02 §2）
-- log-sum-exp トリックで exp オーバーフローを防ぐ数値安定版。
-- 単位系: 1株 = POINTS_PER_SHARE(=100) 点。cost_u は 0〜Δ の範囲。
-- ============================================================

-- exp(x) を安全に評価。double の指数アンダーフロー閾値(≈ -745)を下回る入力は 0 とみなす。
-- （log-sum-exp は正側のオーバーフローは防ぐが、負側で Postgres の exp が underflow 例外を出すため）
create or replace function safe_exp(x float8)
returns float8
language sql immutable
as $$ select case when x < -700 then 0.0::float8 else exp(x) end; $$;

-- コスト関数 C(q) = b·ln(Σ exp(q_i/b))  （最大値を引いて安定化）
create or replace function lmsr_cost(q float8[], b float8)
returns float8
language plpgsql immutable
as $$
declare m float8; s float8;
begin
  select max(x / b) into m from unnest(q) as t(x);
  select sum(safe_exp(x / b - m)) into s from unnest(q) as t(x);
  return b * (m + ln(s));   -- s >= 1（最大項=1）なので ln は常に有効
end;
$$;

-- 価格(=確率) p_k = exp(q_k/b) / Σ exp(q_i/b)  ∈ (0,1)
create or replace function lmsr_price(q float8[], b float8, k int)
returns float8
language plpgsql immutable
as $$
declare m float8; s float8;
begin
  select max(x / b) into m from unnest(q) as t(x);
  select sum(safe_exp(x / b - m)) into s from unnest(q) as t(x);
  return safe_exp(q[k] / b - m) / s;
end;
$$;

-- 市場の全アウトカムの現在価格を返す（display_order 順）
-- 取引RPC の戻り値・価格履歴記録で共用する単一の真実。
create or replace function lmsr_market_prices(p_market_id uuid)
returns table(outcome_id uuid, price float8)
language plpgsql stable
as $$
declare v_b float8; v_q float8[]; v_ids uuid[];
begin
  select b_param::float8 into v_b from markets where id = p_market_id;
  select array_agg(o.id order by o.display_order),
         array_agg(o.q::float8 order by o.display_order)
    into v_ids, v_q
    from outcomes o where o.market_id = p_market_id;
  return query
    select v_ids[i], lmsr_price(v_q, v_b, i)
    from generate_subscripts(v_ids, 1) as i;
end;
$$;

-- q 更新後に呼び、その市場の全アウトカムの現在価格を履歴へ1点ずつ記録（SPEC-05 §1）
create or replace function record_market_prices(p_market_id uuid)
returns void
language plpgsql
as $$
begin
  insert into market_price_history(market_id, outcome_id, price)
  select p_market_id, mp.outcome_id, mp.price::numeric
  from lmsr_market_prices(p_market_id) as mp;
end;
$$;
