-- ============================================================
-- 0042 社会的証明：市場ごとの「シェアから参加した人数」（公開集計）
-- ride_shares は RLS で本人のみ閲覧のため、件数だけ definer で公開する。
-- ============================================================
create or replace function market_ride_count(p_market_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(distinct rider_id)::int from ride_shares where market_id = p_market_id;
$$;
grant execute on function market_ride_count(uuid) to anon, authenticated;
