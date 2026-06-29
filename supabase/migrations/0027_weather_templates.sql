-- ============================================================
-- 0027 天気テンプレート（ゴリラ予想・デイリー市場の素）
-- 天気カテゴリ＋フィード設定（Polyミラー無効・自前テンプレ有効）＋
-- 気象庁 AMeDAS 観測で自動解決する weather バインディングのテンプレを用意。
-- 生成は generate-markets の §4a（テンプレ生成）が params_source.offsets の各日について
-- create_market_internal を呼ぶ（external_ref=tmpl:{template_id}:{yyyymmdd} で冪等）。
-- ============================================================
do $$
declare v_cat uuid;
begin
  -- 天気カテゴリ（slug=weather）
  insert into categories(slug, name, display_order, is_active)
    values ('weather', '天気', 50, true)
    on conflict (slug) do update set name = excluded.name, is_active = true
    returning id into v_cat;
  if v_cat is null then
    select id into v_cat from categories where slug = 'weather';
  end if;

  -- フィード設定：Polyミラー無効（poly_max=0）・自前テンプレ有効
  insert into category_feed_settings(category_id, target_active, poly_min, poly_max, daily_gen_cap, template_enabled, mode)
    values (v_cat, 8, 0, 0, 20, true, 'balanced')
    on conflict (category_id) do update set poly_max = 0, template_enabled = true;

  -- テンプレ1: デイリー「今日の東京は雨が降る？」（AMeDAS降水合計>0で自動解決）
  if not exists (select 1 from market_templates where name = '東京・今日の雨（デイリー）') then
    insert into market_templates(category_id, name, question_pattern, params_source, schedule_cron,
                                 resolution_binding, initial_q_rule, is_active)
    values (v_cat, '東京・今日の雨（デイリー）', '{date} の東京は雨が降る？',
      '{"station":"44132","area":"東京","cadence":"daily","offsets":[0,1]}'::jsonb,
      'daily',
      '{"kind":"weather","station":"44132","metric":"precip","operator":">","threshold":0,"yes_if_true":true}'::jsonb,
      '{"p":0.5}'::jsonb, true);
  end if;

  -- テンプレ2: デイリー「今日の東京は真夏日（最高30℃以上）？」
  if not exists (select 1 from market_templates where name = '東京・今日の真夏日（デイリー）') then
    insert into market_templates(category_id, name, question_pattern, params_source, schedule_cron,
                                 resolution_binding, initial_q_rule, is_active)
    values (v_cat, '東京・今日の真夏日（デイリー）', '{date} の東京は最高気温30℃以上？',
      '{"station":"44132","area":"東京","cadence":"daily","offsets":[0,1]}'::jsonb,
      'daily',
      '{"kind":"weather","station":"44132","metric":"temp_max","operator":">=","threshold":30,"yes_if_true":true}'::jsonb,
      '{"p":0.4}'::jsonb, true);
  end if;
end $$;
