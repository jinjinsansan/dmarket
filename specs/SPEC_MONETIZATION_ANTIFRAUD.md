# SPEC-08: マネタイズと不正対策・コンプライアンス

収益化を**BETの外側**に閉じ込め、賭博・景表法・資金決済法の論点を回避する。
あわせてマルチアカウント等の不正を抑止し、ランキングの信頼を守る。

> 依存: 認証(SPEC-01)、中核(SPEC-02)、リーダーボード(SPEC-06)、管理(SPEC-07)。
> 免責: 本書は設計制約の整理であり法的助言ではない。公開前に専門家レビュー必須（SPEC-00 §2）。

---

## 1. マネタイズの大原則（法的境界）

**有償で得たものが、BETの有利不利に一切影響しない。** これを越える機能は作らない。

許可される収益源:
1. **コスメ課金** — アバター・プロフィール装飾・UIテーマ。勝敗に無関係。
2. **広告** — 一覧/詳細の枠、スポンサー市場（結果は中立に解決）。
3. **有料機能（情報・利便）** — 高度なチャート、過去データ、通知、ウォッチリスト拡張、
   競馬カテゴリのDlogic由来インサイト等。**予測の補助情報**であって賭けの優位購入ではない範囲に留める。
4. **市場作成権・カスタム市場**（将来）— ユーザーが自分の市場を作る権利の販売（結果の中立性は運営が担保）。

**禁止（コードに存在させない）**:
- ポイントの有償購入・換金・ユーザー間譲渡。
- 課金でベット用ポイントが増える/手数料が下がる/オッズが有利になる類の一切。
- 上位者への金券・物品・換金可能報酬（賞品ゼロ＝SPEC-06）。

```sql
-- 課金は「BETに使えない財」だけを扱う。ポイント残高とは完全分離。
create table entitlements (        -- ユーザーが購入/付与された権利
  user_id uuid references auth.users(id),
  sku     text not null,          -- 'theme_dark'|'avatar_x'|'pro_analytics'|'ad_free' ...
  granted_at timestamptz not null default now(),
  expires_at timestamptz,          -- サブスク等
  primary key (user_id, sku)
);
-- entitlements は wallets/point_ledger と一切リンクしない（BET経済から隔離）
```

決済は外部（Stripe等）。**決済結果でポイントを増やすコードは存在してはならない** ── 付与するのは entitlements のみ。

---

## 2. 「賭博にならない」ことのテスト可能な保証

設計の安全性を、機能の**不在**として自動テストで担保する（SPEC-00 §2 の具体化）。

- [ ] ポイントを増やすRPCは `grant_signup_bonus` / `claim_daily_grant` / `resolve_market`(償還) / `void_market`(返金) のみ。これ以外に balance を増やす経路が無い。
- [ ] 決済Webhook処理が `wallets` を更新しない（entitlements のみ更新）。
- [ ] ポイントの user→user 移動RPCが存在しない。
- [ ] ポイント→現金/暗号資産/物品 の交換RPC・導線が存在しない。
- [ ] entitlements がトレードの価格・手数料・結果に影響しない。

---

## 3. マルチアカウント・不正対策

ポイントは無価値でも、**ランキング/称号**が動機になるためマルチアカウントの誘因は残る。
換金性が無いので深追いは不要だが、ランキングの信頼を守る範囲で抑止する。

### 3.1 入口の抑止（SPEC-01連携）
- 検証済み連絡先（メール/電話OTP）を必須化し、未検証に初期付与しない。
- 使い捨てメールドメインのブロックリスト判定（任意）。
- 電話OTPを併用すると重複作成のコストが上がる（本人性を強めたい場合）。

### 3.2 検知（シグナル）
```sql
create table account_signals (
  user_id uuid references auth.users(id),
  signup_ip inet, last_ip inet,
  device_fingerprint text,           -- 任意（フロントで取得）
  created_at timestamptz default now(),
  primary key (user_id)
);
create table fraud_flags (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  rule text not null,                -- 'shared_ip_cluster'|'correlated_betting'|'disposable_email'
  score numeric, detail jsonb,
  status text not null default 'open', -- 'open'|'confirmed'|'dismissed'
  created_at timestamptz default now()
);
```
- バッチで相関を検出: 同一IP/端末の多数アカウント、同一市場で常に同方向に賭ける口の束（談合的）、
  短時間の連携作成。閾値超で `fraud_flags` を起票。
- 換金性が無い前提なので、**自動BANは避け、人手レビュー（SPEC-07）に回す**運用を既定とする。

### 3.3 対応
- `flag_user`（SPEC-07）で `profiles.is_flagged=true` → リーダーボード除外（SPEC-06）。
- 悪質な場合のみアカウント停止。**ポイント没収という概念は持たない**（無価値なので不要）。

---

## 4. 広告・スポンサー市場の中立性

- スポンサーは市場の**作成費用**を払えるが、**解決結果や価格に介入できない**。
- スポンサー市場である旨を明示表示（透明性）。解決は通常どおりフィード/管理者(SPEC-03)。
- 景表法の懸念を避けるため、広告から「当たれば賞品」等の射幸導線を作らない。

---

## 5. プライバシー・データ

- IP/端末フィンガープリント等の不正シグナルは目的を限定して保持し、保持期間を定める。
- ランキングで他者の残高絶対額を晒さない設計を推奨（順位/割合に留める、SPEC-06 §6）。

---

## 6. 受け入れ条件

- [ ] 決済完了時に entitlements のみ付与され、`wallets.balance` は不変。
- [ ] entitlements の有無でトレードの価格・手数料・結果が変わらない。
- [ ] ポイントの購入/換金/譲渡RPCがコードベースに存在しない（静的検査＋テスト）。
- [ ] 未検証アカウントに初期ポイントが付与されない。
- [ ] 同一IP/端末クラスタが閾値超で `fraud_flags` に起票される。
- [ ] フラグ確定でランキングから除外される。
- [ ] スポンサー市場が通常の解決経路で中立に確定する。

---

## 7. 実装順序

1. §2 の「不在テスト」を先に書く（以後の実装が境界を越えないガードレールになる）。
2. entitlements ＋ 外部決済（Stripe等）Webhook（ポイントに触れないことをテスト）。
3. コスメ（テーマ/アバター）と ad_free などの最小SKU。
4. `account_signals` 収集 ＋ 検知バッチ ＋ `fraud_flags`。
5. 広告枠・スポンサー市場（中立性の担保とラベル表示）。
6. 有料情報機能（チャート/データ/通知）。
7. 受け入れ条件の検証。
