-- ============================================================
-- 初期データ雛形（任意・full_schema.sql 適用後に実行）
-- カテゴリとフィード設定を入れると供給ジョブが市場を自動生成し始める。
-- 値は運用に合わせて編集可。
-- ============================================================

-- カテゴリ
insert into categories(slug, name, display_order, is_active) values
  ('keiba',  '競馬',     1, true),
  ('fx',     'FX',       2, true),
  ('crypto', 'クリプト', 3, true),
  ('news',   'ニュース', 4, true)
on conflict (slug) do nothing;

-- カテゴリ別フィード設定（SPEC-04）
-- 競馬: poly_max=0（自分の城。Polyを入れずテンプレ供給）
-- ニュース/クリプト/FX: Polyミラーで埋める
insert into category_feed_settings
  (category_id, target_active, poly_min, poly_max, daily_gen_cap, poly_tag_ids, poly_sort, template_enabled, mode)
select id,
       case slug when 'keiba' then 10 else 10 end,            -- target_active
       case slug when 'keiba' then 0  else 3  end,            -- poly_min
       case slug when 'keiba' then 0  else 12 end,            -- poly_max（競馬は0）
       20,                                                    -- daily_gen_cap
       '{}'::int[],                                           -- poly_tag_ids（運用時にGammaのtag_idを設定）
       'volume_24hr',
       case slug when 'keiba' then true else false end,       -- template_enabled
       'balanced'
from categories
on conflict (category_id) do nothing;

-- 管理者の登録（ログイン実装後、自分の auth.users.id を入れて実行）
-- insert into admin_users(user_id, role) values ('<あなたのuser_id>', 'admin');
