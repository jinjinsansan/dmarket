# SPEC-06: リーダーボード・ゲーミフィケーション

報酬体験の中核。**賞品ゼロ**（賭博性を出さない）で、ランキング・称号・実績によって
「当てる楽しさ」を駆動する。少人数フェーズの公平性（SPEC-00 §2）と整合させる。

> 依存: 中核(SPEC-02) の `point_ledger` / `resolutions` / `positions`。

---

## 1. 設計の前提（法的整合）

- 上位者へ**金券・物品・換金可能ポイントを一切付与しない**（賞品ゼロ）。報酬は称号・ランキング表示・実績バッジのみ。
- 称号やバッジに二次市場価値が付く仕組み（売買・譲渡）を作らない。
- スコアは換金不可ポイントの実績から算出する純粋な表示指標。

---

## 2. スコアリング指標

複数の指標を持ち、ユーザーが「強さ」を多面的に感じられるようにする。

| 指標 | 定義 | 用途 |
|------|------|------|
| **総資産 (net worth)** | 現在残高 + 保有ポジションの現在評価額 | メインランキング |
| **的中率 (accuracy)** | 解決済み市場で勝ち側を持っていた割合 | 「読みの鋭さ」 |
| **実現損益 (realized P&L)** | 償還 − 取得原価の累計 | シーズン成績 |
| **取引数 / 参加市場数** | アクティビティ量 | 称号条件・新人指標 |
| **連勝 (streak)** | 連続的中数 | バッジ・煽り表示 |

評価額・損益は中核の `cost_basis`・`positions`・`market_price_history`（SPEC-05 §1）から算出。

---

## 3. データモデル

```sql
-- ユーザー集計（バッチ更新。表示の高速化）
create table user_stats (
  user_id        uuid primary key references auth.users(id),
  net_worth      bigint not null default 0,
  realized_pnl   bigint not null default 0,
  resolved_count int not null default 0,
  win_count      int not null default 0,
  current_streak int not null default 0,
  best_streak    int not null default 0,
  trades_count   int not null default 0,
  updated_at     timestamptz not null default now()
);

-- シーズン（期間で区切ってリセット感を出す）
create table seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,          -- '2026 Spring' など
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  is_active  boolean not null default false
);

-- シーズン別スコア（期間内の実現損益等）
create table season_scores (
  season_id  uuid references seasons(id),
  user_id    uuid references auth.users(id),
  score      bigint not null default 0,    -- シーズン内 realized P&L 等
  accuracy   numeric,
  primary key (season_id, user_id)
);

-- 称号・バッジ定義と付与
create table badges (
  id          text primary key,        -- 'first_win'|'streak_5'|'sharpshooter' ...
  name        text not null, description text, icon text,
  criteria    jsonb not null           -- 達成条件の定義
);
create table user_badges (
  user_id  uuid references auth.users(id),
  badge_id text references badges(id),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- 全テーブル RLS: SELECT public(true) / 書き込みはバッチ(RPC/関数)のみ
```

---

## 4. 集計ジョブ

```
cron: 10分ごと（または市場解決をトリガに）
1. 各ユーザーの net_worth = balance + Σ(保有株 × 現在価格 × POINTS_PER_SHARE)
2. 解決済み市場の確定を反映して win_count/resolved_count/streak/realized_pnl を更新
3. アクティブシーズンの season_scores を更新
4. badges.criteria を満たしたユーザーに user_badges を付与（未付与のみ）
5. user_stats.updated_at を更新
```

ランキングは `user_stats` / `season_scores` を `order by` するだけ（インデックス必須）。

---

## 5. 称号・バッジ例（criteria）

- `first_win`: 初の的中。
- `streak_5` / `streak_10`: 連勝5/10。
- `sharpshooter`: 的中率◯%以上（最低N件以上の解決を条件に、少数試行の偶然を除外）。
- `category_master:keiba`: 競馬カテゴリで実現損益トップ帯。
- `early_bird`: 締切まで時間がある段階での的中（先見性）。

criteria は最低試行数の閾値を必ず入れ、**少回数の運をランキング/称号に反映させない**。

---

## 6. 表示（フロント連携・SPEC-05）

- グローバルナビに「ランキング」。総資産/的中率/シーズンのタブ。
- プロフィールページに称号・バッジ・成績サマリ。
- 市場詳細に「この市場の上位保有者」表示は任意（煽り演出）。ただし他者の残高絶対額は出さず順位/割合に留める設計を推奨。
- リセット感: シーズン終了時に「シーズン称号」を確定表示（賞品なし、表示のみ）。

---

## 7. 公平性・不正との関係（SPEC-08連携）

- 全員同額の初期付与・デイリー付与（SPEC-02）がランキングのスタートライン平等を担保。
- マルチアカウントによるランキング操作の動機が残るため、検知はSPEC-08に委譲。
  検知されたアカウントは `user_stats`/ランキングから除外できるフラグ（`is_flagged`）を持つ。

---

## 8. 受け入れ条件

- [ ] 総資産ランキングが残高＋保有評価で正しく並ぶ。
- [ ] 的中率が最低試行数の条件を満たさないユーザーには称号が付かない。
- [ ] 連勝が解決ごとに正しく増減し、best_streak が保持される。
- [ ] シーズン切替で season_scores が新シーズンに対してゼロから始まる。
- [ ] バッジが条件達成時に一度だけ付与される（重複なし）。
- [ ] 換金・賞品付与の導線がどこにも存在しない（コード上の不在をテスト）。
- [ ] フラグ済みアカウントがランキングから除外される。

---

## 9. 実装順序

1. `user_stats` ＋ 集計ジョブ（net_worth/accuracy/streak）。
2. 総資産ランキングUI（SPEC-05）。
3. `badges`/`user_badges` ＋ 付与ロジック。
4. `seasons`/`season_scores` ＋ シーズン表示。
5. プロフィール・称号表示、フラグ除外連携。
6. 受け入れ条件の検証。
