# SPEC-07: 管理コンソール (Admin Console)

管理者の操作面を統合。市場作成、テンプレ/供給設定、解決キュー、カテゴリ別フィード設定、
モデレーション、ユーザー管理、監査ログ。骨子は SPEC-02/03/04 に既出のため、本書は**操作RPCとUI**を確定する。

> 依存: 認証(SPEC-01) の `admin_users`、中核(SPEC-02)、解決(SPEC-03)、供給(SPEC-04)。

---

## 1. アクセス制御

- 全管理RPCは security definer で、内部で `exists(select 1 from admin_users where user_id=auth.uid())` を必須チェック。
- `role`: `admin`（全権）/ `moderator`（モデレーションと解決キューのみ）。
- 全管理操作は §8 の `admin_audit` に記録（誰が・いつ・何を）。

---

## 2. ダッシュボード

- KPI: アクティブ市場数（カテゴリ別の admin/template/mirror 内訳と gap）、本日の取引数、登録者数、解決待ち件数。
- アラート: 解決失敗（error）件数、供給/解決ジョブの失敗、Poly API のレート制限ヒット。

---

## 3. 市場作成（admin手動）

`create_admin_market(payload) returns market_id`（管理者専用）。
```
payload: { question, description, image_url, category_id, market_kind('binary'|'multi'),
           outcomes:[{label, display_order}], b_param, close_time, resolve_time,
           initial_prices?:[...]  // 任意。初期qのシード用（未指定はフラット） }
処理:
1. assert admin
2. insert markets(source='admin', resolution_kind='manual', status='open', ...)
3. insert outcomes（initial_prices があれば SPEC-02 §5.4 の式で q をシード）
4. market_price_history に初期点を記録（SPEC-05 §1）
5. admin_audit に記録 → return market_id
```

UIは SPEC-05 §3.3 の作成フォーム（質問・カテゴリ・二択/多択・close/resolve・b・初期確率・画像）。
多択は outcome を可変個追加。プレビューで初期確率を確認できる。

---

## 4. テンプレート管理（自動生成の素・SPEC-04）

- `market_templates` のCRUD UI。質問パターン、`params_source`、`schedule_cron`、
  `resolution_binding`、`initial_q_rule`、有効/無効。
- テンプレの「次回生成プレビュー」：今 generate したらどんな market になるかを表示。
- 競馬テンプレは `initial_q_rule={source:'dlogic'}` を選べる（初期qをDlogic確率でシード）。

---

## 5. カテゴリ別フィード設定（SPEC-04 §8）

- `categories` と `category_feed_settings` の編集UI。
- カテゴリごとに: `target_active` / `poly_min` / `poly_max` / `daily_gen_cap` /
  `poly_tag_ids` / `poly_sort` / `template_enabled`。
- **プリセット**（おまかせ/バランス/自分で回す）ボタンで裏の値を一括設定。
- カテゴリ別の現況可視化（admin/template/mirror の本数と gap）を併設。
- 「Polyを減らす＝走行中市場は消さない」原則（SPEC-04 §1.3）をUIにも明記。

---

## 6. 解決キュー（最重要オペレーション）

解決待ち・自動解決失敗を一元処理する画面。
```
一覧: 手動市場(close後) ＋ 自動解決のerror市場 を表示
各行: 質問 / カテゴリ / close時刻 / 種別(manual|auto-error) / フィードの生値(あれば)
操作:
  - 勝ちoutcomeを選択 ＋ source_url を入力 → resolve_market() を呼ぶ
  - 中止 → void_market(reason)
  - （誤確定の訂正は §7）
```
- `resolution_audit`（SPEC-03）の生値を行内に表示し、判断材料にする。
- moderator も操作可。全操作を `admin_audit` に記録。

---

## 7. 訂正（誤確定リカバリ）

- `correct_resolution(market_id, correct_outcome_id, reason)`（admin限定・**二段確認必須**）。
- 影響件数（巻き戻し対象の償還数・ポイント総額）をプレビューしてから実行。
- 逆仕訳＋再償還は SPEC-03 §6 に従い、台帳整合を保つ。

---

## 8. ユーザー管理・モデレーション

```sql
create table admin_audit (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id),
  action text not null,             -- 'create_market'|'resolve'|'void'|'correct'|'flag_user'|'settings'
  target jsonb,                     -- 対象ID等
  detail jsonb,
  created_at timestamptz not null default now()
);
```
- ユーザー検索（表示名・メール）、`user_stats`・台帳の閲覧。
- 不正フラグ: `flag_user(user_id, reason)` → リーダーボード除外（SPEC-06 `is_flagged`）。SPEC-08の検知と連携。
- 市場の編集/非表示（公開前 draft の編集、不適切市場の `void`/非表示）。
- カテゴリの追加・並び替え・有効化。

---

## 9. UI構成（SPEC-05のデザイントークンを流用）

```
[ダッシュボード] [市場] [テンプレ] [カテゴリ設定] [解決キュー] [ユーザー] [監査ログ]
```
管理画面は一般UIと同じトークンで、密度の高いデータテーブル中心。操作は確認ダイアログを基本とする。

---

## 10. 受け入れ条件

- [ ] 非管理者は全管理RPC/画面にアクセスできない。
- [ ] `create_admin_market` で初期確率を指定すると、その確率で q がシードされる。
- [ ] テンプレ編集後、次回生成プレビューが新定義を反映する。
- [ ] カテゴリ設定の変更後、供給ジョブが新しい `target/poly_min/poly_max` で gap を計算する。
- [ ] 解決キューで勝ちoutcome＋source_urlを設定すると `resolve_market` が実行され償還される。
- [ ] `correct_resolution` は影響件数プレビューと二段確認を経て実行される。
- [ ] すべての管理操作が `admin_audit` に記録される。
- [ ] フラグしたユーザーがランキングから除外される。

---

## 11. 実装順序

1. `admin_users` 判定（SPEC-01）＋ `admin_audit` ＋ 管理レイアウト/認可。
2. 解決キュー（§6）＋ `resolution_audit` 表示 — **運用上いちばん使う画面を最優先**。
3. 市場作成（§3）。
4. カテゴリ別フィード設定（§5）＋プリセット。
5. テンプレ管理（§4）。
6. ユーザー管理・フラグ（§8）、訂正（§7）。
7. ダッシュボードKPI（§2）、受け入れ条件の検証。
