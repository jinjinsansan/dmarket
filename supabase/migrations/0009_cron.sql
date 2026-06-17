-- ============================================================
-- 0009 pg_cron スケジュール（リモート専用 / SPEC-00 §9, SPEC-04 §4, SPEC-03 §4）
-- ※ローカルの素PGには pg_cron/pg_net が無いため run_local.sh では適用しない。
--   Supabase リモートに `npx supabase db push` で適用する。
--
-- 事前準備（Supabase ダッシュボード or SQL で1回だけ）:
--   - Database > Extensions で pg_cron / pg_net を有効化
--   - Edge Function を deploy: npx supabase functions deploy generate-markets resolve-markets
--   - 関数URLとservice_role_keyをDB設定に登録（Vault推奨。簡易版は下記GUC）:
--       alter database postgres set app.functions_base_url = 'https://<ref>.functions.supabase.co';
--       alter database postgres set app.service_role_key   = '<service_role_key>';
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 既存の同名ジョブがあれば貼り替え
select cron.unschedule('generate-markets') where exists (select 1 from cron.job where jobname='generate-markets');
select cron.unschedule('resolve-markets')  where exists (select 1 from cron.job where jobname='resolve-markets');

-- 供給: 15分ごと
select cron.schedule('generate-markets', '*/15 * * * *', $job$
  select net.http_post(
    url     := current_setting('app.functions_base_url') || '/generate-markets',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
                 'Content-Type',  'application/json'),
    body    := '{}'::jsonb
  );
$job$);

-- 自動解決: 5分ごと
select cron.schedule('resolve-markets', '*/5 * * * *', $job$
  select net.http_post(
    url     := current_setting('app.functions_base_url') || '/resolve-markets',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
                 'Content-Type',  'application/json'),
    body    := '{}'::jsonb
  );
$job$);

-- リーダーボード集計: 10分ごと（純SQL関数を直接実行。Edge Function不要）
select cron.unschedule('refresh-stats') where exists (select 1 from cron.job where jobname='refresh-stats');
select cron.schedule('refresh-stats', '*/10 * * * *', $job$ select refresh_user_stats(); $job$);
