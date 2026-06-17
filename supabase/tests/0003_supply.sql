-- ============================================================
-- 供給レイヤー（SPEC-04 §10）受け入れ条件テスト（gap計算・初期qシード）
-- 外部API（Gamma）依存部分は Edge Functions 側のため、ここでは純DBロジックを検証。
-- ============================================================
begin;

create or replace function _mk_market(p_cat uuid, p_source text, p_status text, p_close interval)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into markets(category_id, question, b_param, source, resolution_kind, status, close_time, resolve_time)
    values (p_cat, 'q', 200, p_source,
            case when p_source='admin' then 'manual' else 'auto' end,
            p_status, now() + p_close, now() + p_close + interval '1 day')
    returning id into v_id;
  return v_id;
end $$;

do $$
declare
  c_news uuid; c_keiba uuid;
  v_gen int;
  p float8;
begin
  -- ニュース: template無効, target=10, poly_min=3, poly_max=15, cap=20
  insert into categories(slug, name) values ('news','News') returning id into c_news;
  insert into category_feed_settings(category_id, target_active, poly_min, poly_max, daily_gen_cap, template_enabled)
    values (c_news, 10, 3, 15, 20, false);

  -- 何も無い日: desired=clamp(10-0-0,3,15)=10, poly_active=0 → 生成10
  v_gen := compute_poly_to_generate(c_news);
  assert v_gen = 10, format('empty day should generate 10, got %s', v_gen);

  -- 管理者が4本出すと: desired=clamp(10-4-0,3,15)=6 → 生成6（自動でPolyが縮む）
  perform _mk_market(c_news, 'admin', 'open', interval '1 day');
  perform _mk_market(c_news, 'admin', 'open', interval '1 day');
  perform _mk_market(c_news, 'admin', 'open', interval '1 day');
  perform _mk_market(c_news, 'admin', 'open', interval '1 day');
  v_gen := compute_poly_to_generate(c_news);
  assert v_gen = 6, format('with 4 admin markets, should generate 6, got %s', v_gen);

  -- 既に Poly が2本走っている: desired=6, poly_active=2 → 追加4（走行中は消さない）
  perform _mk_market(c_news, 'mirror', 'open', interval '1 day');
  perform _mk_market(c_news, 'mirror', 'open', interval '1 day');
  v_gen := compute_poly_to_generate(c_news);
  assert v_gen = 4, format('with 2 poly running, should add 4 more, got %s', v_gen);

  -- 管理者が大量(20本)出して target を超過: desired=clamp(10-20,3,15)=3, poly_active=2 → 追加1（poly_min下限が効く）
  for i in 1..16 loop perform _mk_market(c_news, 'admin', 'open', interval '1 day'); end loop;
  v_gen := compute_poly_to_generate(c_news);
  assert v_gen = 1, format('over-target should fall to poly_min(3)-2running=1, got %s', v_gen);

  -- 競馬: poly_max=0（自分の城）→ 常に0
  insert into categories(slug, name) values ('keiba','競馬') returning id into c_keiba;
  insert into category_feed_settings(category_id, target_active, poly_min, poly_max, daily_gen_cap, template_enabled)
    values (c_keiba, 10, 0, 0, 20, true);
  v_gen := compute_poly_to_generate(c_keiba);
  assert v_gen = 0, format('poly_max=0 category must never generate poly, got %s', v_gen);

  -- 期限切れ(closed/過去)はアクティブに数えない: news に過去の admin を足しても gap は変わらない
  -- （active_market_count は status='open' かつ close_time>now() のみ）
  perform _mk_market(c_news, 'admin', 'closed', interval '1 day');
  -- closed は admin_active に数えないので結果は変わらず 1
  v_gen := compute_poly_to_generate(c_news);
  assert v_gen = 1, format('closed market must not count as active, got %s', v_gen);

  -- 初期qシード: p=0.7 を入れたら lmsr_price が 0.7 に戻る（二択 q_NO=0）
  p := lmsr_price(array[ lmsr_seed_q_binary(200, 0.7), 0.0 ], 200, 1);
  assert abs(p - 0.7) < 1e-9, format('seed q should reproduce price 0.7, got %s', p);
  p := lmsr_price(array[ lmsr_seed_q_binary(50, 0.25), 0.0 ], 50, 1);
  assert abs(p - 0.25) < 1e-9, format('seed q should reproduce price 0.25, got %s', p);

  raise notice 'ALL SUPPLY ACCEPTANCE CHECKS PASSED';
end;
$$;

-- create_market_internal: Polyミラー相当（YES価格0.64でシード）を生成し、初期価格と履歴点を確認
do $$
declare
  c uuid; m uuid; v_b numeric := 50;
  p_yes float8; v_hist int;
begin
  insert into categories(slug, name) values ('cmtest','CM') returning id into c;
  m := create_market_internal(
    c, 'BTC > 70k?', null, null, 'binary', v_b, 'mirror', 'auto',
    '{"kind":"poly","poly_id":"abc"}'::jsonb, 'abc',
    now() + interval '1 day', now() + interval '2 day',
    jsonb_build_array(
      jsonb_build_object('label','YES','display_order',0,'q', lmsr_seed_q_binary(v_b::float8, 0.64)),
      jsonb_build_object('label','NO','display_order',1,'q', 0)
    ));
  select price into p_yes from lmsr_market_prices(m) where outcome_id =
    (select id from outcomes where market_id = m and display_order = 0);
  assert abs(p_yes - 0.64) < 1e-9, format('mirror market YES should seed to 0.64, got %s', p_yes);
  select count(*) into v_hist from market_price_history where market_id = m;
  assert v_hist = 2, format('initial price history should have 2 points (one per outcome), got %s', v_hist);
  raise notice 'CREATE_MARKET_INTERNAL CHECK PASSED';
end;
$$;

rollback;
