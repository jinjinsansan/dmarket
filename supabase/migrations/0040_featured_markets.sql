-- ============================================================
-- 0040 注目市場（管理者が選択 → カードを色反転で強調）
-- ============================================================

alter table markets add column if not exists is_featured boolean not null default false;
create index if not exists markets_featured_idx on markets(is_featured) where is_featured;

-- 管理：注目フラグの切替
create or replace function admin_set_featured(p_market_id uuid, p_featured boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update markets set is_featured = p_featured where id = p_market_id;
  if not found then raise exception 'market_not_found'; end if;
  perform _audit('set_featured', jsonb_build_object('market_id', p_market_id), jsonb_build_object('featured', p_featured));
end; $$;
grant execute on function admin_set_featured(uuid, boolean) to authenticated;

-- 市場マネージャ一覧に is_featured を追加（戻り値型変更のため drop して再作成）
drop function if exists admin_list_markets(text);
create function admin_list_markets(p_status text default null)
returns table(id uuid, question text, category text, source text, status text, b_param numeric,
              close_time timestamptz, resolve_time timestamptz, outcome_count int, volume numeric, holders int,
              is_featured boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select m.id, m.question, c.name, m.source, m.status, m.b_param, m.close_time, m.resolve_time,
           (select count(*)::int from outcomes o where o.market_id = m.id),
           (select coalesce(sum(ord.size),0) from orders ord where ord.market_id = m.id),
           (select count(distinct pos.user_id)::int from positions pos
              join outcomes o2 on o2.id = pos.outcome_id where o2.market_id = m.id and pos.shares > 0),
           m.is_featured,
           m.created_at
    from markets m
    left join categories c on c.id = m.category_id
    where (p_status is null or m.status = p_status)
    order by m.is_featured desc, m.created_at desc
    limit 300;
end;
$$;
grant execute on function admin_list_markets(text) to authenticated;
