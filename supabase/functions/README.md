# Edge Functions（供給・解決ジョブ）

Deno ランタイム。Supabase 上で動き、pg_cron（`migrations/0009_cron.sql`）から定期起動される。

| 関数 | 周期 | 役割 | 対応SPEC |
|------|------|------|----------|
| `generate-markets` | 15分 | カテゴリ別 gap を計算し、不足分だけ Polyミラー生成（走行中は消さない・冪等） | SPEC-04 §4 |
| `resolve-markets`  | 5分  | auto市場を機械判定 → resolve_market / pending再試行 / error→解決キュー | SPEC-03 §4 |

共通モジュール `_shared/`:
- `client.ts` — service_role クライアント＋`seedQBinary`（DB の `lmsr_seed_q_binary` と同一式）
- `gamma.ts`  — Polymarket Gamma API（候補取得・確定突合。認証不要・429バックオフ）
- `adapters.ts` — `resolveBinding()`：poly / price_threshold / race_result(Dlogic) を判定（未確定は必ず pending）

## 環境変数（Supabase の Function Secrets）
```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY      # 必須（自動注入される場合あり）
DLOGIC_BASE_URL                              # 競馬解決（VPSのHTTPエンドポイント）
FEED_CRYPTO_URL / FEED_FX_URL / ...          # 価格しきい値解決（データ源確定後に設定）
```
※ 価格feed・Dlogicのエンドポイントは未確定（計画書 §7 #3）。未設定の feed は `pending` を返し再試行されるため、本番投入を阻害しない。

## デプロイ
```bash
npx supabase functions deploy generate-markets resolve-markets
# シークレット設定
npx supabase secrets set DLOGIC_BASE_URL=... FEED_CRYPTO_URL=...
# スケジュール（pg_cron）は migrations/0009_cron.sql を db push で適用
```

## ローカル実行（要 Docker）
```bash
npx supabase functions serve generate-markets --no-verify-jwt
```
本リポジトリの検証は Docker 不要の `tests/run_local.sh`（DBロジック）でカバー。
Edge Functions 自体の実行検証は Supabase 環境（または Docker）が必要。
