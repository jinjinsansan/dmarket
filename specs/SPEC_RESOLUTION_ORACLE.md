# SPEC-03: 解決とオラクル・フィードアダプタ

市場の勝敗を**どう確定するか**の詳細。自動解決のフィードアダプタ群、Polyミラーの解決突合、
手動確定の経路、誤確定の訂正・中止（void）を定義する。

> 依存: 中核(SPEC-02) `resolve_market()` / `void_market()` を呼ぶ。供給(SPEC-04)の自動解決ジョブから駆動。

---

## 1. 解決の3経路

1. **auto（フィード）** — `resolution_binding.kind` に応じたアダプタが外部データから機械判定。
2. **auto（Polyミラー）** — Polymarket側の確定を突合して複製。
3. **manual** — フィードが無い/失敗した市場を、管理者が解決キュー(SPEC-07)で確定。

いずれも最終的に中核の `resolve_market(market_id, winning_outcome_id, source_url)` を呼ぶ点は共通。

---

## 2. `resolution_binding`（解決定義スキーマ）

market/outcome が「どう確定するか」を表す jsonb。`kind` でアダプタを切り替える。

```jsonc
// 価格しきい値（FX・暗号・指数）
{ "kind": "price_threshold",
  "feed": "crypto|fx|index",
  "symbol": "BTCUSD",
  "at": "2026-06-20T00:00:00Z",   // 判定時刻（その時刻の終値/参照値）
  "operator": ">=", "threshold": 70000,
  "yes_outcome_id": "<uuid>", "no_outcome_id": "<uuid>" }

// 競馬（自前 Dlogic / 結果データ）
{ "kind": "race_result",
  "feed": "keiba",
  "race_id": "202606200511",
  "outcome_map": { "win_horse_7": "<outcome_uuid>", ... } }

// スポーツ結果
{ "kind": "sports_result",
  "feed": "sports",
  "event_id": "...", "rule": "home_win|away_win|over_under",
  "outcome_map": { ... } }

// Polymarketミラー
{ "kind": "poly", "poly_id": "<gamma_market_id>",
  "outcome_map": { "Yes": "<uuid>", "No": "<uuid>" } }

// 数値しきい値の汎用（天気・統計など）
{ "kind": "numeric_feed", "feed": "weather", "metric": "...", "at": "...",
  "operator": "...", "threshold": ..., "outcome_map": {...} }
```

---

## 3. フィードアダプタ仕様

各アダプタは共通インターフェース `resolve(binding) -> {status, winning_outcome_id?, source_url?}` を実装。
`status` は `resolved`（確定）/ `pending`（まだ確定不可、次回再試行）/ `error`（要人手）。

| feed | データ源 | 判定ロジック | source_url |
|------|---------|------------|-----------|
| `crypto` | 取引所API（価格） | `at` 時刻の参照価格 vs threshold | 価格APIの該当URL |
| `fx` | レートAPI | 同上（終値等） | レートソースURL |
| `keiba` | 自前 Dlogic/結果DB | `race_id` の確定着順を `outcome_map` で写像 | レース結果ページ |
| `sports` | スポーツ結果API | `rule` に従い勝敗/合計を判定 | 試合結果URL |
| `poly` | Polymarket Gamma/Data | poly側の確定結果を `outcome_map` で写像 | poly市場URL |
| `numeric_feed` | 各種API | 指標値 vs threshold | 指標ソースURL |

**共通規約**
- 確定値が未取得・未確定なら `pending` を返す（**絶対に推測で確定しない**）。
- 取得値が定義と矛盾/欠損なら `error` を返し、解決キュー(SPEC-07)へ。
- 取得した生値（価格・着順等）は監査のため `resolution_audit` に保存。

```sql
create table resolution_audit (
  id          bigint generated always as identity primary key,
  market_id   uuid not null references markets(id),
  feed        text not null,
  raw_value   jsonb,                 -- 取得した生データ
  decided     text,                  -- 'resolved'|'pending'|'error'
  source_url  text,
  created_at  timestamptz not null default now()
);
```

---

## 4. 自動解決ジョブ（SPEC-04 §7 の詳細版）

```
cron: 5分ごと
for each market where resolution_kind='auto'
                 and status in ('open','closed','resolving')
                 and resolve_time <= now():
    set status='resolving' (lock)
    adapter = pick_adapter(binding.kind)
    r = adapter.resolve(binding)
    insert resolution_audit(market, feed, r.raw, r.status, r.source_url)
    switch r.status:
      'resolved': call resolve_market(market, r.winning_outcome_id, r.source_url); status='resolved'
      'pending' : set status back to 'closed'        -- 次回再試行（無理に確定しない）
      'error'   : push admin_resolution_queue(market, error); keep 'resolving' は外す
```

**リトライ上限**: `pending` が一定回数（例: 12回=1時間）続いたら `error` 扱いで人手へ。

---

## 5. Polyミラーの解決突合

- `poly` アダプタは Gamma/Data API で `poly_id` の確定状態を確認。
- Polymarketは事象確定後にオラクルで解決される（短期市場は自動、その他は確定まで時間差あり）。
  **未解決の間は `pending`**。解決後に YES/NO を `outcome_map` で自サイトへ写像。
- poly側が中止/無効なら `void`（§6）に倒す。

---

## 6. 訂正と中止（void）

- **誤確定の訂正**: 解決後に誤りが判明した場合、v1は自動巻き戻しを行わず**管理者の明示操作**でのみ対応。
  訂正RPC `correct_resolution(market_id, correct_outcome_id, reason)`（管理者専用）:
  - 旧償還を打ち消す逆仕訳を台帳に記録（'redeem' の取り消し）、正しいoutcomeで再償還。
  - `resolutions` を更新し、訂正履歴を `resolution_audit` に残す。
  - 影響範囲が大きいので**監査ログ必須・要二段確認**（SPEC-07）。
- **中止 (void)**: 事象が観測不能・市場設定ミス等。`void_market()`（SPEC-02 §5.2）で
  各保有者へ `cost_basis` を返金。理由を `resolutions.source_url`/監査に記録。

---

## 7. 受け入れ条件

- [ ] 価格しきい値市場が、判定時刻の参照値で正しくYES/NOに確定する。
- [ ] 競馬市場が Dlogic/結果データの着順から `outcome_map` どおりに確定する。
- [ ] フィードが未確定の間は `pending` で、市場は確定されず再試行される。
- [ ] 取得失敗・矛盾は解決キューに `error` として現れる。
- [ ] 解決ごとに `resolution_audit` に生値と判定が残る。
- [ ] Polyミラーがpoly側確定後に正しく写像確定する。
- [ ] `correct_resolution` が逆仕訳＋再償還で台帳整合を保ったまま訂正する。
- [ ] void で各保有者に `cost_basis` が返金される。

---

## 8. 実装順序

1. `resolution_binding` パーサと共通アダプタIF、`resolution_audit`。
2. `keiba`（Dlogic）と `crypto/fx`（価格しきい値）アダプタ — 自前解決の主力。
3. 自動解決ジョブ（§4）＋リトライ上限。
4. `poly` アダプタ（突合）。
5. `sports`/`numeric_feed` アダプタ。
6. `correct_resolution`（管理者・二段確認）。
7. 受け入れ条件の検証。
