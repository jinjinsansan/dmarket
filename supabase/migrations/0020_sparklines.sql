-- ============================================================
-- 0020 スパークライン用: 複数市場の直近価格点を一括取得（YESアウトカム＝display_order先頭）。
-- カード一覧で1回のRPC呼び出しで全カード分の価格推移を取得する（軽量）。
-- ============================================================
create or replace function market_sparklines(p_market_ids uuid[])
returns table(market_id uuid, prices numeric[])
language sql stable security definer set search_path = public
as $$
  with yes_outcomes as (
    select distinct on (o.market_id) o.market_id, o.id as outcome_id
    from outcomes o
    where o.market_id = any(p_market_ids)
    order by o.market_id, o.display_order
  ),
  pts as (
    select yo.market_id, mph.price, mph.recorded_at,
           row_number() over (partition by yo.market_id order by mph.recorded_at desc) as rn
    from yes_outcomes yo
    join market_price_history mph on mph.outcome_id = yo.outcome_id
  )
  select market_id, array_agg(price order by recorded_at) as prices
  from pts
  where rn <= 24
  group by market_id;
$$;

grant execute on function market_sparklines(uuid[]) to anon, authenticated;
