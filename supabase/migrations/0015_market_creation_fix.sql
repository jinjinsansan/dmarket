-- ============================================================
-- 0015 create_market_internal 強化（display_order の自動補完）
-- 呼び出し側の outcomes 要素に display_order が無くても、配列位置(ordinality-1)で補う。
-- （手入力/コピペで display_order が欠落しても市場作成が失敗しないように）
-- ============================================================
create or replace function create_market_internal(
  p_category_id uuid, p_question text, p_description text, p_image_url text,
  p_market_kind text, p_b numeric, p_source text, p_resolution_kind text,
  p_resolution_binding jsonb, p_external_ref text,
  p_close_time timestamptz, p_resolve_time timestamptz, p_outcomes jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_market_id uuid; v_elem jsonb; v_ord int; v_count int;
begin
  if jsonb_typeof(p_outcomes) <> 'array' then raise exception 'outcomes_must_be_array'; end if;
  select count(*) into v_count from jsonb_array_elements(p_outcomes);
  if v_count < 2 then raise exception 'need_at_least_two_outcomes'; end if;

  insert into markets(category_id, question, description, image_url, market_kind, b_param,
                      source, resolution_kind, resolution_binding, external_ref,
                      status, close_time, resolve_time, created_by)
    values (p_category_id, p_question, p_description, p_image_url, p_market_kind, p_b,
            p_source, p_resolution_kind, p_resolution_binding, p_external_ref,
            'open', p_close_time, p_resolve_time, auth.uid())
    returning id into v_market_id;

  for v_elem, v_ord in select value, ordinality from jsonb_array_elements(p_outcomes) with ordinality loop
    insert into outcomes(market_id, label, display_order, q)
      values (v_market_id,
              v_elem->>'label',
              coalesce((v_elem->>'display_order')::int, (v_ord - 1)::int),
              coalesce((v_elem->>'q')::numeric, 0));
  end loop;

  perform record_market_prices(v_market_id);
  return v_market_id;
end;
$$;
