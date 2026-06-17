-- ============================================================
-- 0014 管理ダッシュボード（SPEC-07 §2/§4/§5/§8）
-- KPI・カテゴリ別フィード現況（gap可視化）・テンプレCRUD・カテゴリCRUD。
-- すべて is_admin() を内部検証。書き込みは admin_audit に記録。
-- ============================================================

-- ── ダッシュボード KPI（§2） ─────────────────────────────────
create or replace function admin_kpis()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v jsonb;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select jsonb_build_object(
    'active_markets', (select count(*) from markets where status='open' and close_time > now()),
    'trades_today',   (select count(*) from point_ledger
                        where reason in ('buy','sell')
                          and (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date),
    'users_count',    (select count(*) from wallets),
    'pending_manual', (select count(*) from markets
                        where resolution_kind='manual' and status in ('open','closed') and resolve_time <= now()),
    'queue_count',    (select count(*) from resolution_queue),
    'resolved_total', (select count(*) from markets where status='resolved')
  ) into v;
  return v;
end;
$$;

-- ── カテゴリ別フィード現況（§5。admin/template/mirror 内訳と gap） ──
create or replace function admin_feed_overview()
returns table(
  category_id uuid, slug text, name text, is_active boolean,
  target_active int, poly_min int, poly_max int, daily_gen_cap int,
  template_enabled boolean, mode text,
  admin_active int, template_active int, mirror_active int, to_generate int
) language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select c.id, c.slug, c.name, c.is_active,
           coalesce(s.target_active,0), coalesce(s.poly_min,0), coalesce(s.poly_max,0), coalesce(s.daily_gen_cap,0),
           coalesce(s.template_enabled,false), coalesce(s.mode,'—'),
           active_market_count(c.id,'admin'),
           active_market_count(c.id,'template'),
           active_market_count(c.id,'mirror'),
           compute_poly_to_generate(c.id)
    from categories c
    left join category_feed_settings s on s.category_id = c.id
    order by c.display_order;
end;
$$;

-- ── カテゴリ CRUD（§8） ──────────────────────────────────────
create or replace function upsert_category(
  p_id uuid, p_slug text, p_name text, p_display_order int, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_id is null then
    insert into categories(slug, name, display_order, is_active)
      values (p_slug, p_name, p_display_order, p_is_active) returning id into v_id;
  else
    update categories set slug=p_slug, name=p_name, display_order=p_display_order, is_active=p_is_active
      where id=p_id returning id into v_id;
  end if;
  perform _audit('category', jsonb_build_object('category_id', v_id), jsonb_build_object('slug', p_slug));
  return v_id;
end;
$$;

-- ── テンプレート CRUD（§4） ──────────────────────────────────
create or replace function upsert_template(
  p_id uuid, p_category_id uuid, p_name text, p_question_pattern text,
  p_params_source jsonb, p_schedule_cron text, p_resolution_binding jsonb,
  p_initial_q_rule jsonb, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_id is null then
    insert into market_templates(category_id, name, question_pattern, params_source, schedule_cron,
                                 resolution_binding, initial_q_rule, is_active)
      values (p_category_id, p_name, p_question_pattern, p_params_source, p_schedule_cron,
              p_resolution_binding, p_initial_q_rule, p_is_active)
      returning id into v_id;
  else
    update market_templates set
      category_id=p_category_id, name=p_name, question_pattern=p_question_pattern,
      params_source=p_params_source, schedule_cron=p_schedule_cron,
      resolution_binding=p_resolution_binding, initial_q_rule=p_initial_q_rule, is_active=p_is_active
      where id=p_id returning id into v_id;
  end if;
  perform _audit('template', jsonb_build_object('template_id', v_id), jsonb_build_object('name', p_name));
  return v_id;
end;
$$;

create or replace function delete_template(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  delete from market_templates where id = p_id;
  perform _audit('template_delete', jsonb_build_object('template_id', p_id), null);
end;
$$;

grant execute on function admin_kpis()                                          to authenticated;
grant execute on function admin_feed_overview()                                 to authenticated;
grant execute on function upsert_category(uuid,text,text,int,boolean)           to authenticated;
grant execute on function upsert_template(uuid,uuid,text,text,jsonb,text,jsonb,jsonb,boolean) to authenticated;
grant execute on function delete_template(uuid)                                 to authenticated;
