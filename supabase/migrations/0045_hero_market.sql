-- ============================================================
-- 0045 ヒーロー市場（トップ「今日のお題」を管理者が1件指定）
-- is_featured（注目＝カード色反転）とは別概念。is_hero は常に1件だけ。
-- ============================================================

alter table markets add column if not exists is_hero boolean not null default false;
create unique index if not exists markets_hero_uniq on markets(is_hero) where is_hero;

-- 管理：今日のお題（ヒーロー）の切替。on にすると他を全て解除（単一選択）。
create or replace function admin_set_hero(p_market_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_on then
    update markets set is_hero = false where is_hero and id <> p_market_id;
    update markets set is_hero = true  where id = p_market_id;
    if not found then raise exception 'market_not_found'; end if;
  else
    update markets set is_hero = false where id = p_market_id;
  end if;
  perform _audit('set_hero', jsonb_build_object('market_id', p_market_id), jsonb_build_object('on', p_on));
end; $$;
grant execute on function admin_set_hero(uuid, boolean) to authenticated;

-- 市場マネージャ一覧に is_hero を追加（戻り値型変更のため drop して再作成・0040版＋is_hero）
drop function if exists admin_list_markets(text);
create function admin_list_markets(p_status text default null)
returns table(id uuid, question text, category text, source text, status text, b_param numeric,
              close_time timestamptz, resolve_time timestamptz, outcome_count int, volume numeric, holders int,
              is_featured boolean, is_hero boolean, created_at timestamptz)
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
           m.is_featured, m.is_hero,
           m.created_at
    from markets m
    left join categories c on c.id = m.category_id
    where (p_status is null or m.status = p_status)
    order by m.is_hero desc, m.is_featured desc, m.created_at desc
    limit 300;
end;
$$;
grant execute on function admin_list_markets(text) to authenticated;
