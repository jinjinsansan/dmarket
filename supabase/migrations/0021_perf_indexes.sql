-- ============================================================
-- 0021 パフォーマンス索引（高負荷・大量アクセス対策）
-- 既存クエリの全表スキャンを潰す。すべて冪等（if not exists）。
-- ============================================================

-- 市場一覧／関連市場の主要フィルタ:
--   WHERE status='open' AND close_time > now() ORDER BY close_time
-- これまで markets を全表スキャンしていた箇所を索引で解消。
create index if not exists markets_status_close_idx
  on markets (status, close_time);

-- カテゴリ絞り込み付き一覧／関連市場用。
create index if not exists markets_cat_status_close_idx
  on markets (category_id, status, close_time);

-- 保有者表示（market_holders）は positions を outcome_id で検索するが、
-- PK は (user_id, outcome_id) のため outcome_id 単独検索は索引が効かなかった。
create index if not exists positions_outcome_idx
  on positions (outcome_id);

-- 新設索引を即座にプランナへ反映。
analyze markets;
analyze positions;
