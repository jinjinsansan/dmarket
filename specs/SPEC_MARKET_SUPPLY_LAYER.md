# SPEC: 市場供給レイヤー (Market Supply Layer)

予測市場プラットフォーム（ポイント制・換金不可・賭博非該当）における、
**市場をどこから・どれだけ・どう自動配給するか** を定義する仕様書。

> このSPECの担当範囲は「市場の供給と自動解決」のみ。
> LMSR価格エンジン・ポイント台帳・取引RPC・RLSは別SPEC（価格/台帳レイヤー）で定義済みとし、
> 本SPECはそれらの解決RPC `resolve_market(market_id, winning_outcome_id, source_url)` を呼ぶ前提で書く。

---

## 0. 前提と用語

- **市場 (market)**: 1つの予測対象。二択(YES/NO)または多択。LMSRで価格づけされる。
- **供給源 (source)**: 市場がどこから来たか。`admin` / `template` / `mirror` の3種。
- **解決方式 (resolution_kind)**: `manual`（管理者が手で確定）/ `auto`（外部APIから自動確定）。
- **カテゴリ (category)**: 競馬・FX・クリプト・ニュース等。**本SPECの制御はすべてカテゴリ単位**。
- **アクティブ市場**: `status = 'open'` かつ `close_time` 未到来の、まだベット可能な市場。
- **gap**: あるカテゴリで「目標数に対して足りていない、Polyミラーで埋めるべき数」。

---

## 1. 設計思想

### 1.1 比率ではなく「目標を埋める」
管理者は「Poly何%」という比率を操作しない。カテゴリごとに
**「常にアクティブで保ちたい新鮮な市場の数 = `target_active`」** を設定するだけ。
生成ジョブが毎回 gap を計算し、不足分だけをPolyミラーで埋める。
→ 管理者が市場を多く出した日は gap が自然に縮みPolyが引っ込み、
　出せない日は gap が開いてPolyが自動で前に出る。**スライダー操作は不要。**

### 1.2 1カテゴリに3つの供給源、埋める優先順位
1. `admin` — 管理者がアドミンページから手動投稿（`resolution_kind = manual`）
2. `template` — 自前データから自動生成（例: 競馬=Dlogic、FX/クリプト=価格API。`resolution_kind = auto`）
3. `mirror` — Polymarket Gamma APIから複製。**最後の埋め草**（`resolution_kind = auto`）

gap は「target から admin と template を引いた残り」をPolyで埋める形で計算する（§3）。

### 1.3 走行中の市場は絶対に消さない
gap が縮んでも、**既にアクティブなPoly市場を削除・停止してはならない**。
それらにはユーザーのポジションがある。調整するのは **新規生成の量だけ**。
gap が縮む = 「次に新しく作るPolyの数」が減るだけ。走っている市場は解決まで走らせる。

### 1.4 供給上限 = 運営負荷上限
Polyを1つ生成するたびに自動解決の対象が1つ増える。
`poly_max` と `daily_generation_cap` はフィードの賑やかさと運営負荷を同時に縛る単一ダイヤル。

---

## 2. データモデル

```sql
-- カテゴリ定義
create table categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,          -- 'keiba' | 'fx' | 'crypto' | 'news' ...
  name          text not null,
  display_order int  not null default 0,
  is_active     boolean not null default true
);

-- カテゴリ別フィード設定（本SPECの心臓。1カテゴリ1行）
create table category_feed_settings (
  category_id        uuid primary key references categories(id) on delete cascade,
  target_active      int  not null default 10,   -- このカテゴリで保ちたいアクティブ市場数
  poly_min           int  not null default 0,    -- gapが0でも最低出すPoly数
  poly_max           int  not null default 10,   -- どんなに暇でもPolyはここまで（0 = Poly禁止カテゴリ）
  daily_gen_cap      int  not null default 20,   -- 1日あたり新規生成上限（admin手動は数えない）
  poly_tag_ids       int[] not null default '{}',-- Gammaから引くtag_idの許可リスト
  poly_sort          text not null default 'volume_24hr', -- 'volume_24hr'|'liquidity'|'competitive'
  template_enabled   boolean not null default false,      -- 自前テンプレを使うか
  mode               text not null default 'balanced',    -- UIプリセットの記録用（実値はこの行）
  updated_at         timestamptz not null default now()
);

-- 自前テンプレート（自動生成の素）
create table market_templates (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid references categories(id),
  name               text not null,
  question_pattern   text not null,             -- 'BTCは{date}の終値で{threshold}を超えるか？'
  params_source      jsonb not null,            -- 生成時にパターンへ流し込む値の取得元定義
  schedule_cron      text not null,             -- '0 9 * * *' 等。生成タイミング
  resolution_binding jsonb not null,            -- 解決時にどのAPIのどの値を見るか（§6）
  initial_q_rule     jsonb not null,            -- 初期確率の置き方（'flat' | {source:'dlogic'} 等）
  is_active          boolean not null default true
);

-- Polyミラーの取得キャッシュ（重複生成防止と解決突合のため）
create table poly_mirror_cache (
  poly_market_id     text primary key,          -- Gammaの市場ID（冪等キー）
  category_id        uuid references categories(id),
  question           text not null,
  poly_price_yes     numeric,                   -- 取得時点のYES確率（初期qシード用）
  poly_close_time    timestamptz,
  poly_resolution    text,                       -- 確定済みなら結果。未確定はnull
  local_market_id    uuid references markets(id),-- 生成済みなら自サイト市場へのリンク
  fetched_at         timestamptz not null default now()
);

-- markets テーブルの本SPEC関連カラム（既存スキーマに追加）
-- source           text  not null  -- 'admin' | 'template' | 'mirror'
-- resolution_kind  text  not null  -- 'manual' | 'auto'
-- category_id      uuid  references categories(id)
-- resolution_binding jsonb          -- autoの解決元（templateやmirrorから複製）
-- external_ref     text             -- mirrorならpoly_market_id, templateならtemplate_id
-- status           text             -- 'open' | 'closed' | 'resolving' | 'resolved' | 'void'
```

---

## 3. gap 計算アルゴリズム（カテゴリ単位）

生成ジョブが各アクティブカテゴリについて以下を実行する。

```
function compute_poly_to_generate(category c):
    s = category_feed_settings[c]

    admin_active    = count(markets where category=c and source='admin'    and is_active)
    template_active = count(markets where category=c and source='template' and is_active)
    poly_active     = count(markets where category=c and source='mirror'   and is_active)

    # admin と template で埋まっていない残りを Poly が埋める
    desired_poly = clamp(
        s.target_active - admin_active - template_active,
        s.poly_min,          # 下限：暇でも旬を少し混ぜる
        s.poly_max           # 上限：埋め尽くし & 解決負荷を防ぐ（0ならPoly禁止）
    )

    # 既に走っている分は消さない。足りない分だけ新規生成
    to_generate = max(0, desired_poly - poly_active)

    # 1日の生成上限を尊重（admin手動投稿はこのキャップに数えない）
    to_generate = min(to_generate, remaining_daily_cap(c))

    return to_generate
```

**競馬カテゴリの例**: `poly_max = 0`, `template_enabled = true`。
→ Polyは常に0、新鮮な市場はDlogicテンプレが供給。「競馬は完全に自分の城」が実現。

**ニュースカテゴリの例**: `template_enabled = false`, `poly_max = 15`, `poly_min = 3`。
→ 管理者が出さない日はPolyが最大15まで埋め、出した日は縮むが最低3は旬を混ぜる。

---

## 4. 生成ジョブ（pg_cron + Edge Function）

```
cron: 15分ごと
for each category c where is_active:
    # (a) 自前テンプレ生成
    if c.template_enabled:
        for each template t in market_templates where category=c and is_active:
            if t.schedule_cron is due and not already generated for this slot:
                params = resolve_params(t.params_source)        # 例: 今日の日付, BTC閾値
                q0     = seed_q(t.initial_q_rule)                # §5.4
                insert market(source='template', resolution_kind='auto',
                              category=c, resolution_binding=t.resolution_binding,
                              external_ref=t.id, q=q0, ...)

    # (b) Polyミラー生成
    n = compute_poly_to_generate(c)                              # §3
    if n > 0:
        candidates = fetch_poly_candidates(c, limit=n*3)         # §5 多めに引いて選別
        for m in pick_best(candidates, n):                       # 重複・期限切れ除外
            q0 = seed_q_from_price(m.poly_price_yes)             # §5.4
            insert market(source='mirror', resolution_kind='auto',
                          category=c, external_ref=m.poly_market_id,
                          resolution_binding={kind:'poly', poly_id:m.poly_market_id},
                          q=q0, ...)
            upsert poly_mirror_cache(... local_market_id=new.id)
```

冪等性: `poly_mirror_cache.poly_market_id` を一意キーにし、`local_market_id` が既にあるものは再生成しない。

---

## 5. Polymarket ミラー連携（Gamma API）

### 5.1 エンドポイント
- ベース: `https://gamma-api.polymarket.com`（**認証不要・読み取り専用**）
- 市場一覧: `GET /markets`（`closed=false` でアクティブのみ）
- イベント単位: `GET /events`（複数marketを束ねる上位概念）

### 5.2 フィルタ・ソート
- `tag_id` でカテゴリ相当に絞る（`category_feed_settings.poly_tag_ids` を使用）
- ソートは `volume_24hr`（出来高）/ `liquidity` / `competitive`。
  デフォルト `volume_24hr` 降順で「賑わっている良い市場」だけ拾う。
- `limit` / `offset` でページング。

### 5.3 レート制限・キャッシュ（運用上の必須事項）
- 概算上限: 全体 4,000 req / 10s、`/markets` 300 req / 10s 程度。
- 市場メタデータは変化が遅いので **必ずキャッシュ**（`poly_mirror_cache`）。
- 429受信時は指数バックオフ。15分cronなら通常まったく問題にならない設計。

### 5.4 初期確率 `q` のシード
取得した YES 価格 `p`（= 確率, 0〜1）を自サイトのLMSR初期状態へ変換する。
二択で `q_NO = 0` と置くと:

```
q_YES = b * ln( p / (1 - p) )        # これで p_YES がちょうど p になる
```

- Poly市場 → 上式で `p = poly_price_yes` を使う（他人の集合知を初期値に借りる）
- 自前テンプレ（競馬）→ `p = Dlogicの単勝確率` を使う（**自分のモデルでシード**）
- 根拠が無いカテゴリ → `q = 0` ベクトル（フラット50/50）

### 5.5 日本向けローカライズ
- `poly_tag_ids` には日本ユーザーに刺さるタグのみ入れる（米州地方選などは除外）。
- 質問文は必要なら生成時に日本語へ整形（翻訳パイプは任意。v1は原文+補足でも可）。

### 5.6 解決の依存
Polyミラーの `resolution_binding = {kind:'poly'}` は、**Poly側の確定結果を待って複製**する（§7）。
価格データだけ借りて解決は自前ルールでやれる市場（クリプト価格など）は、
ミラーではなく §6 の自前テンプレに寄せるほうが解決の自律性が高い。

---

## 6. 自前テンプレートの自動解決バインディング

`resolution_binding` (jsonb) の例:

```json
// FX: 金曜終値判定
{ "kind": "price_threshold",
  "feed": "fx",
  "symbol": "USDJPY",
  "at": "2026-06-19T15:00:00+09:00",
  "operator": ">=",
  "threshold": 158.0,
  "yes_if_true": true }

// 競馬: 着順判定
{ "kind": "race_result",
  "feed": "dlogic",
  "race_id": "202606190511",
  "outcome_map": { "win": "horse_7" } }
```

解決ジョブはこの定義を読み、対応するfeedアダプタを呼んで結果を機械判定する。

---

## 7. 自動解決ジョブ（pg_cron + Edge Function）

```
cron: 5分ごと
for each market where resolution_kind='auto'
                 and status in ('open','resolving')
                 and resolve_time <= now():
    set status='resolving'
    try:
        binding = market.resolution_binding
        if binding.kind == 'poly':
            r = fetch poly resolution(binding.poly_id)   # Data/Gammaで確定確認
            if r is null: continue                        # まだ未確定→次回再試行
            winning = map_poly_outcome(r)
        else:
            winning = evaluate_binding(binding)           # §6 のfeedアダプタ
            if winning is undetermined: continue
        call resolve_market(market.id, winning, source_url)  # 別SPECの原子的RPC
        set status='resolved'
    catch:
        push to admin_resolution_queue(market.id, error)  # 失敗は人手キューへ
```

**失敗のフォールバックが重要**: 自動解決が取れなかった市場は管理者の解決キューに落とし、
手動で確定できるようにする。自動と手動の境界をここで吸収する。

---

## 8. アドミンページ

### 8.1 カテゴリ別フィード設定
カテゴリごとに `category_feed_settings` を編集するUI。ダイヤルは:
1. **目標市場数** `target_active`（メイン）
2. **Poly下限 / 上限** `poly_min` / `poly_max`（上限0でそのカテゴリはPoly禁止）
3. **1日生成上限** `daily_gen_cap`
4. **Poly許可タグ** `poly_tag_ids` ＋ **ソート** `poly_sort`
5. **自前テンプレ有効** `template_enabled`

### 8.2 プリセット（生ダイヤルの上に被せる）
1ボタンで裏の値をまとめてセット。`mode` に記録。
- **おまかせ（忙しい）**: target高め・poly_max高め・poly_min中
- **バランス**: 中庸
- **自分で回す**: poly_max を絞る（管理者投稿が主役）

### 8.3 市場作成フォーム（admin手動投稿）
質問・カテゴリ・二択/多択・close/resolve時刻・`b`（流動性）・初期`q`・画像。
`source='admin'`, `resolution_kind='manual'` 固定。

### 8.4 解決キュー
- 手動確定待ち（admin市場）＋ 自動解決の失敗分（§7）を一覧。
- 各行で「確定アウトカム」＋「根拠ソースURL」を入力して `resolve_market` を実行。

### 8.5 監視
- カテゴリ別の現在のアクティブ内訳（admin / template / mirror の本数）と gap の可視化。
- 生成失敗・解決失敗のログ。

---

## 9. 不変条件 / エッジケース

1. **走行中市場の不削除**: gap縮小で既存アクティブ市場を停止/削除してはならない（§1.3）。
2. **冪等生成**: 同一 `poly_market_id` / 同一テンプレ生成スロットから二重生成しない。
3. **期限切れ除外**: `poly_close_time` が近すぎる/過ぎたPoly市場はミラーしない。
4. **poly_max=0 の厳守**: 競馬等の「自分の城」カテゴリへPolyを一切入れない。
5. **daily_gen_cap は自動生成のみ**: admin手動投稿はキャップに含めない（管理者は無制限に出せる）。
6. **解決の二重実行防止**: `status='resolving'` の遷移と行ロックで `resolve_market` の重複呼び出しを防ぐ。
7. **未確定はリトライ**: Poly/feedが未確定の間は確定せず、次回cronで再試行（無理に確定しない）。
8. **カテゴリ無効化**: `categories.is_active=false` のカテゴリは新規生成を止める（既存は走らせる）。

---

## 10. 受け入れ条件 (Acceptance Criteria)

- [ ] あるカテゴリで管理者市場を増やすと、次回生成サイクルで新規Poly生成数が自動的に減る。
- [ ] 管理者が市場を出さない日は、Polyが `poly_max` まで（下限 `poly_min` 以上で）フィードを埋める。
- [ ] `poly_max=0` のカテゴリにPoly市場が1つも生成されない。
- [ ] 既にアクティブなPoly市場は、gapが縮んでも解決まで削除・停止されない。
- [ ] 競馬テンプレ市場の初期確率がDlogicの確率と一致してシードされる。
- [ ] 自動解決が取れない市場が管理者の解決キューに必ず現れる。
- [ ] 同一Poly市場が二重にミラーされない（冪等）。
- [ ] Gamma APIが429を返してもバックオフし、生成サイクルが破綻しない。

---

## 11. 実装順序の推奨

1. `categories` / `category_feed_settings` テーブルと markets への列追加。
2. アドミンの設定UI（§8.1〜8.2）。まず手で値をいじれる状態に。
3. gap計算関数（§3）＋生成ジョブのPoly部分（§4b, §5）。**ここで最低限フィードが埋まる。**
4. 自動解決ジョブ（§7）＋解決キュー（§8.4）。**確定が回る。**
5. 自前テンプレ（§4a, §6）＋Dlogicシード（§5.4）。競馬カテゴリを自分の城に。
6. 監視・ログ（§8.5）と受け入れ条件の検証。
