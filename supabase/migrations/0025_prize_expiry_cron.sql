-- ============================================================
-- 0025 賞品ポイント失効の日次スケジュール（リモート専用 / 二層ポイント制 Phase D）
-- ※ローカルの素PGには pg_cron が無いため run_local.sh では適用しない。
--   Supabase リモートに適用する（pg_cron は 0009 で有効化済み）。
--
-- expire_prize_points()（0022）は純plpgsql関数で Edge Function も秘密鍵も不要なため、
-- refresh-stats と同様に cron から直接 SELECT する。
-- 90日（grant_prize_points の既定）超過分を FIFO で失効。判定は expires_at <= now() のため
-- 1日1回で十分。二重失効しない設計（消費合計を差し引くため冪等的）。
-- ============================================================

create extension if not exists pg_cron;

-- 既存の同名ジョブがあれば貼り替え
select cron.unschedule('expire-prize-points')
  where exists (select 1 from cron.job where jobname = 'expire-prize-points');

-- 毎日 19:00 UTC（= 04:00 JST、低トラフィック帯）に失効バッチを実行
select cron.schedule('expire-prize-points', '0 19 * * *', $job$ select expire_prize_points(); $job$);
