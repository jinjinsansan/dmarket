-- ============================================================
-- 0050 ピックアップ1本集中トップ
-- ・pickup_schedule（JSTの時スロットに市場を割当）
-- ・get_current_pickup()/get_next_pickup()（フォールバック付）
-- ・pickup_participants()（直近アクティブ人数）
-- ・管理: set_pickup_slot/clear_pickup_slot/list_pickup_slots/pickup_candidates
-- ============================================================

create table if not exists pickup_schedule (
  slot_start timestamptz primary key,          -- JSTの時スロット（UTC保存）
  market_id  uuid not null references markets(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table pickup_schedule enable row level security;
drop policy if exists "public pickup read" on pickup_schedule;
create policy "public pickup read" on pickup_schedule for select using (true);

-- 現在のピックアップ市場（無ければ is_hero → 締切が近い開催中へフォールバック）
create or replace function get_current_pickup()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select ps.market_id into v from pickup_schedule ps
    join markets m on m.id = ps.market_id
   where ps.slot_start <= now() and m.status = 'open' and m.close_time > now()
   order by ps.slot_start desc limit 1;
  if v is not null then return v; end if;
  select id into v from markets where is_hero and status = 'open' and close_time > now() limit 1;
  if v is not null then return v; end if;
  select id into v from markets where status = 'open' and close_time > now()
    order by close_time asc limit 1;
  return v;
end; $$;
grant execute on function get_current_pickup() to anon, authenticated;

-- 次のピックアップ（予告）
create or replace function get_next_pickup()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'market_id', ps.market_id,
    'slot_start', ps.slot_start,
    'time_label', to_char(ps.slot_start at time zone 'Asia/Tokyo', 'HH24:MI'),
    'question', m.question)
  from pickup_schedule ps join markets m on m.id = ps.market_id
  where ps.slot_start > now()
  order by ps.slot_start asc limit 1;
$$;
grant execute on function get_next_pickup() to anon, authenticated;

-- 直近30分のアクティブ人数（取引＋コメントのユニークユーザー）
create or replace function pickup_participants(p_market_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(distinct user_id)::int from (
    select user_id from point_ledger where market_id = p_market_id and reason = 'buy' and created_at > now() - interval '30 minutes'
    union
    select user_id from comments where market_id = p_market_id and created_at > now() - interval '30 minutes'
  ) t;
$$;
grant execute on function pickup_participants(uuid) to anon, authenticated;

-- ============================================================
-- 管理: スケジュール割当（JST日付＋時）
-- ============================================================
create or replace function set_pickup_slot(p_date date, p_hour int, p_market_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_start timestamptz;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_hour < 0 or p_hour > 23 then raise exception 'bad_hour'; end if;
  v_start := (p_date::timestamp + make_interval(hours => p_hour)) at time zone 'Asia/Tokyo';
  insert into pickup_schedule(slot_start, market_id, created_by)
    values (v_start, p_market_id, auth.uid())
    on conflict (slot_start) do update set market_id = excluded.market_id, created_by = auth.uid();
  return true;
end; $$;
grant execute on function set_pickup_slot(date, int, uuid) to authenticated;

create or replace function clear_pickup_slot(p_date date, p_hour int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_start timestamptz;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  v_start := (p_date::timestamp + make_interval(hours => p_hour)) at time zone 'Asia/Tokyo';
  delete from pickup_schedule where slot_start = v_start;
  return true;
end; $$;
grant execute on function clear_pickup_slot(date, int) to authenticated;

-- 管理: 指定日(JST)のスロット一覧
create or replace function list_pickup_slots(p_date date)
returns table(hour int, market_id uuid, question text) language sql stable security definer set search_path = public as $$
  select extract(hour from ps.slot_start at time zone 'Asia/Tokyo')::int, ps.market_id, m.question
  from pickup_schedule ps join markets m on m.id = ps.market_id
  where (ps.slot_start at time zone 'Asia/Tokyo')::date = p_date
  order by 1;
$$;
grant execute on function list_pickup_slots(date) to authenticated;

-- 管理: 候補（直近の取引高順・開催中）
create or replace function pickup_candidates()
returns table(market_id uuid, question text, category text, volume bigint) language sql stable security definer set search_path = public as $$
  select m.id, m.question, coalesce(c.name, ''),
    coalesce((select sum(-pl.delta) from point_ledger pl where pl.market_id = m.id and pl.reason = 'buy'), 0)::bigint
  from markets m left join categories c on c.id = m.category_id
  where m.status = 'open' and m.close_time > now()
  order by 4 desc, m.created_at desc limit 20;
$$;
grant execute on function pickup_candidates() to authenticated;
