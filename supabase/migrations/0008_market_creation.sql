-- ============================================================
-- 0008 市場生成RPC（供給ジョブ・管理コンソール共用）
-- create_market_internal: market + outcomes(seeded q) + 初期価格履歴点 を原子的に作る。
-- 認証チェックはしない（service_role の供給ジョブ / 管理RPC ラッパーから呼ぶ前提）。
-- 初期 q は呼び出し側が lmsr_seed_q_binary 等で算出して渡す（SPEC-04 §5.4）。
-- ============================================================
create or replace function create_market_internal(
  p_category_id        uuid,
  p_question           text,
  p_description        text,
  p_image_url          text,
  p_market_kind        text,
  p_b                  numeric,
  p_source             text,
  p_resolution_kind    text,
  p_resolution_binding jsonb,
  p_external_ref       text,
  p_close_time         timestamptz,
  p_resolve_time       timestamptz,
  p_outcomes           jsonb        -- [{label, display_order, q?}] q 既定0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market_id uuid;
  v_elem      jsonb;
  v_count     int;
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

  for v_elem in select * from jsonb_array_elements(p_outcomes) loop
    insert into outcomes(market_id, label, display_order, q)
      values (v_market_id,
              v_elem->>'label',
              (v_elem->>'display_order')::int,
              coalesce((v_elem->>'q')::numeric, 0));
  end loop;

  -- 初期価格点（チャートの起点）
  perform record_market_prices(v_market_id);

  return v_market_id;
end;
$$;

revoke execute on function create_market_internal(uuid,text,text,text,text,numeric,text,text,jsonb,text,timestamptz,timestamptz,jsonb)
  from authenticated, anon;
