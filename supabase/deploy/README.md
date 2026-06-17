# deploy — Supabase 適用手順（SQL Editor 用）

リモート Supabase に貼り付けて実行するための結合SQL。

## 適用順
1. **`full_schema.sql`** をSQL Editorに**まるごと貼り付け → Run**
   - migrations 0001-0014 を結合（スキーマ・RPC・RLS・Realtime）。1回で全部入る。
   - ローカル素PG16で適用検証済み（25テーブル / 33関数）。
2. （任意）**`seed_example.sql`** — カテゴリとフィード設定の雛形。編集して実行。
3. Edge Functions をデプロイした**後**に **`cron_after_functions.sql`**
   - 事前に: Database > Extensions で `pg_cron` / `pg_net` を有効化
   - `alter database postgres set app.functions_base_url = 'https://<ref>.functions.supabase.co';`
   - `alter database postgres set app.service_role_key   = '<service_role_key>';`
   - その後 `cron_after_functions.sql` を実行（供給15分/解決5分/集計10分）

## 注意
- `full_schema.sql` は Supabase 前提（`auth` スキーマ・`auth.users`・`anon/authenticated/service_role` ロールは既存）。
- ローカル検証用の `../tests/_local_stub.sql` は**本番では実行しない**（auth等を擬似再現するファイル）。
- 再生成は `supabase/migrations/` を 0001→0014（0009除く）の順に結合するだけ。
