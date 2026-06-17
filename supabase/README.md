# Supabase（DB・RPC・RLS・Edge Functions）

dmarket のバックエンド。スキーマ・RPC・RLS はすべて **マイグレーションで管理**する。
ダッシュボードでの手動スキーマ変更は禁止（再現性が崩れるため）。

## ディレクトリ
- `migrations/` — DDL・RPC・RLS。連番ファイルで前進のみ（破壊的変更は新マイグレーションで）。
- `functions/`  — Edge Functions（供給15分 / 解決5分 / 集計10分のジョブ、決済Webhook）。
- `tests/`      — pgTAP 等で各SPECの受け入れ条件・不変条件を自動テスト。

## マイグレーション運用ルール
1. **前進のみ**: 既存マイグレーションは編集しない。修正は新しい連番ファイルを足す。
2. **連番命名**: `NNNN_説明.sql`（例 `0002_lmsr_functions.sql`）。
3. **1ファイル1責務**: テーブル群・関数群・RLS をSPEC単位で分ける（計画書 §2 参照）。
4. **RLSは必ず有効化**: 全テーブルで `enable row level security`。書き込みは `security definer` RPC経由のみ。
5. **本番/ステージング分離**: ステージングで適用→検証→本番へ。

## ローカル/適用コマンド（CLIは npx 経由）
```bash
# 初期化（config.toml は既に用意済み）
npx supabase login                 # アクセストークンでログイン
npx supabase link --project-ref lxkvzofgzkksujoipnso

# ローカル開発（Docker必要）
npx supabase start
npx supabase db reset              # ローカルDBにmigrationsを全適用

# リモートへ反映
npx supabase db push               # migrations をリンク先プロジェクトへ適用

# 新規マイグレーション作成
npx supabase migration new <name>
```

## 実装順（計画書 §3）
0001 中核テーブル → 0002 LMSR関数 → 0003 発行RPC → 0004 取引RPC →
0005 解決RPC → 0006 供給 → 0007 リーダーボード → 0008 管理 → 0009 マネタイズ/不正
