# migrations

スキーマ・RPC・RLS のマイグレーション置き場。**前進のみ・連番命名・1ファイル1責務**。
運用ルールは [`../README.md`](../README.md) を参照。

## ファイル（計画書 §2・§3）
| 連番 | 内容 | 対応SPEC | フェーズ | 状態 |
|------|------|----------|----------|------|
| 0001 | 中核テーブル（wallets/point_ledger/categories/markets/outcomes/positions/resolutions/daily_grants/market_price_history）＋RLS | 02/05 | Phase 2 | ✅ |
| 0002 | LMSR関数（lmsr_cost / lmsr_price / safe_exp、log-sum-exp） | 02 | Phase 2 | ✅ |
| 0003 | 発行RPC（grant_signup_bonus / claim_daily_grant） | 02 | Phase 2 | ✅ |
| 0004 | 取引RPC（buy_shares / sell_shares） | 02 | Phase 2 | ✅ |
| 0005 | 解決RPC（resolve_market / void_market） | 02 | Phase 2 | ✅ |
| 0006 | Realtime publication（outcomes / market_price_history） | 02 | Phase 2 | ✅ |
| 0007 | 供給・解決基盤（category_feed_settings/market_templates/poly_mirror_cache/resolution_audit/resolution_queue）＋gap計算＋seed_q | 03/04 | Phase 3-4 | ✅ |
| 0008 | 市場生成RPC create_market_internal（供給/管理 共用） | 04/07 | Phase 3-4 | ✅ |
| 0009 | pg_cron スケジュール（供給15分/解決5分/集計10分）※リモート専用 | 03/04/06 | Phase 3-4/6 | ✅(remote) |
| 0010 | profiles（表示名・本人性メタ・is_flagged）※認証/管理/ランキングが依存 | 01 | Phase 6 | ✅ |
| 0011 | リーダーボード（user_stats/seasons/season_scores/badges/user_badges）＋refresh_user_stats | 06 | Phase 6 | ✅ |
| 0012 | 管理（admin_users/admin_audit）＋管理RPC | 07 | Phase 7 | 予定 |
| 0013 | マネタイズ・不正（entitlements/account_signals/fraud_flags） | 08 | Phase 8 | 予定 |

解決の実体（外部API呼び出し）は Edge Functions（`../functions/`）。0009 はローカル素PGに pg_cron が無いため `run_local.sh` では適用せずリモートのみ。

※ 連番・分割は実装時に調整可。`profiles`/`admin_users` はPhase 7が依存するため早めに足してもよい。

## 検証
Docker不要のローカル検証ランナーを同梱（Windows の PostgreSQL バイナリを使用）:
```bash
PG_BIN="/c/Program Files/PostgreSQL/16/bin" bash supabase/tests/run_local.sh
```
SPEC-02 §10 受け入れ条件＋RLS を素のPG16で全緑確認済み。
