-- ============================================================
-- 0041 乗っかりUI用：record_ride がシェア元の表示名を返す＋乗っかり実績RPC
-- ============================================================

-- 乗っかり記録（0030版＋シェア元の表示名を返す。nickname優先）
create or replace function record_ride(p_market_id uuid, p_sharer_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sharer uuid; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  select user_id, coalesce(nullif(btrim(nickname),''), display_name)
    into v_sharer, v_name
    from profiles where ref_code(user_id) = upper(trim(p_sharer_code)) limit 1;
  if v_sharer is null or v_sharer = v_uid then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if not exists(select 1 from markets where id = p_market_id and status = 'open') then
    return jsonb_build_object('ok', false, 'reason', 'not_open', 'referrer_name', v_name);
  end if;
  insert into ride_shares(market_id, rider_id, sharer_id) values (p_market_id, v_uid, v_sharer) on conflict do nothing;
  return jsonb_build_object('ok', true, 'referrer_name', v_name);
end; $$;
grant execute on function record_ride(uuid, text) to authenticated;

-- 乗っかり実績（シェアした人向け）：乗ってくれた人数・応援ボーナス累計・直近
create or replace function my_ride_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_count int; v_total bigint; v_recent jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select count(distinct rider_id) into v_count from ride_shares where sharer_id = v_uid;
  select coalesce(sum(delta), 0) into v_total from point_ledger where user_id = v_uid and reason = 'ride';
  select jsonb_build_object('marketTitle', m.question, 'bonusPt', pl.delta, 'createdAt', pl.created_at)
    into v_recent
    from point_ledger pl
    join markets m on m.id = pl.market_id
    where pl.user_id = v_uid and pl.reason = 'ride'
    order by pl.created_at desc limit 1;
  return jsonb_build_object('rider_count', coalesce(v_count, 0), 'total_bonus', coalesce(v_total, 0), 'recent', v_recent);
end; $$;
grant execute on function my_ride_stats() to authenticated;
