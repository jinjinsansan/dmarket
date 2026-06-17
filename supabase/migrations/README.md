# migrations

スキーマ・RPC・RLS のマイグレーション置き場。**前進のみ・連番命名・1ファイル1責務**。
運用ルールは [`../README.md`](../README.md) を参照。

## 予定ファイル（計画書 §2・§3）
| 連番 | 内容 | 対応SPEC | フェーズ |
|------|------|----------|----------|
| 0001 | 中核テーブル（wallets/point_ledger/markets/outcomes/positions/resolutions/daily_grants）＋制約＋RLS | 02 | Phase 2 |
| 0002 | LMSR関数（lmsr_C / lmsr_price、log-sum-exp） | 02 | Phase 2 |
| 0003 | 発行RPC（grant_signup_bonus / claim_daily_grant） | 02 | Phase 2 |
| 0004 | 取引RPC（buy_shares / sell_shares） | 02 | Phase 2 |
| 0005 | 解決RPC（resolve_market / void_market）＋ market_price_history | 02/05 | Phase 2 |
| 0006 | 供給（categories/category_feed_settings/market_templates/poly_mirror_cache）＋ resolution_audit | 03/04 | Phase 3-4 |
| 0007 | リーダーボード（user_stats/seasons/season_scores/badges/user_badges） | 06 | Phase 6 |
| 0008 | 管理（admin_users/profiles/admin_audit）＋管理RPC | 01/07 | Phase 1/7 |
| 0009 | マネタイズ・不正（entitlements/account_signals/fraud_flags） | 08 | Phase 8 |

※ 連番・分割は実装時に調整可。`profiles`/`admin_users` はPhase 7が依存するため早めに足してもよい。
