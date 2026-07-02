# ランキング刷新 — 実装仕様書

対象: `jinjinsansan/dmarket`（`web/` Next.js 16 / TS / Tailwind v4 / Supabase 想定）
UI参照: `reference/proposal.html`「13 — ランキング刷新」／ 実装UI: `RankingBoard.tsx`（本バンドル）
目的: 既存の「総資産／的中率」ランキングを、**目利きを正当に評価する予想スコア＋シーズン制リーグ＋カテゴリ王**へ刷新。

---

## 0. なぜ変えるか（設計意図）
- **的中率だけは壊れる**：ユーザーは 95〜99% の鉄板ばかり選べば的中率を機械的に上げられ、当てても運営価値は低い。
- **総資産だけも壊れる**：初期ポイントや投下量が多い人が有利で、実力と無関係。
- → **予想スコア**：安いうち（＝みんながまだ気づいていないうち）に正解を見抜けた人ほど高得点。目利きを評価し、鉄板狙いを無効化する。

---

## 1. 予想スコア（コア指標）

### 1-1. 基本式
ある「乗り（ポジション取得）」が **的中して解決** したとき：
```
gain = round( BASE / p_entry )
  BASE   = 10
  p_entry = そのポジションを取った瞬間の、選んだ側の価格（0.01〜0.99, ¢/100）
```
- 例：`p_entry=0.90`（鉄板）→ +11 ／ `0.50`（互角）→ +20 ／ `0.20`（大穴）→ +50。
- **外れは 0点（減点なし）**。参加を促し、初心者が萎縮しないため。
- `p_entry` は**約定時点の価格**で固定（record time）。後から価格が動いても不変＝「安いうちに気づいた」ことを評価。
- 同一市場で複数回に分けて乗った場合は、各約定ロットごとに加重（数量 × gain 相当）でも、代表約定1件でもよい。MVPは **市場×ユーザーで最初の約定の p_entry を採用**（実装簡単・十分公平）。

### 1-2. スコア（シーズン集計）
```
season_score = Σ gain(的中したポジション)  ×  streak_mult
streak_mult  = 1 + min(current_streak, 10) × 0.03   // 連勝で最大 +30%
```
- **最低予想数ゲート**：`total_resolved < 5` の間はランキング表示対象外（運ゲー・新規スパム除け）。バッジやカテゴリ王も同ゲート。
- 表示の「的中 hit/total」は判定済みポジション由来。

### 1-3. カテゴリスコア
市場の `category` 単位で 1-2 と同じ計算 → **カテゴリ王**（各カテゴリ最上位）。少人数カテゴリでも 1 位になれるので新規参入の動機になる。

---

## 2. ティア（シーズン制リーグ）

シーズン終了時の **season_score の順位パーセンタイル** でティア決定。翌シーズン開始時に反映（昇格/降格）。

| tier | 条件（そのシーズンの上位割合） | 表示 |
|---|---|---|
| `oracle`（ゴリラ王）| 1位のみ | 👑 |
| `platinum` | 上位 5% | ◆ グレープ |
| `gold` | 上位 20% | ◆ バナナ |
| `silver` | 上位 50% | ◆ シルバー |
| `bronze` | それ以下（見習い含む）| ◆ ブロンズ |

- **シーズン長**：1週間（毎週月曜 00:00 JST リセット）。`season` は通し番号。
- ヒーローの「昇格まであと N pt」は、**次ティアのカットオフ score − 自分の score**（暫定・リアルタイム順位から算出）。`promoteProgress = 自score / カットオフscore`（0..1でクランプ）。
- 最上位（暫定1位 or oracle）は `nextTier=null` にして進捗バー非表示。

---

## 3. データ（Supabase 想定）

### 3-1. 集計元（既存の解決済みポジションを利用）
必要フィールド：`user_id, market_id, category, side, p_entry, resolved_outcome, resolved_at`。
既存の positions/trades に `p_entry`（約定時価格）が無ければ**約定時に記録するカラムを追加**（最重要）。過去分は近似（解決時の初期価格等）でも可だがMVPは新規約定から正確に。

### 3-2. 集計テーブル（マテビュー or 集計ジョブ）
```sql
-- シーズン×ユーザーの集計（cron で更新、または解決時に加算）
create table ranking_scores (
  season       int  not null,
  user_id      uuid not null references profiles(id),
  score        int  not null default 0,   -- streak_mult 適用後
  hit          int  not null default 0,
  total        int  not null default 0,
  category     text,                       -- null=総合行 / 値ありでカテゴリ別
  updated_at   timestamptz not null default now(),
  primary key (season, user_id, category)
);
create index on ranking_scores (season, category, score desc);

-- 確定したティア（シーズン終了時に書き込み、翌シーズンの表示に使用）
create table ranking_tiers (
  season   int  not null,
  user_id  uuid not null,
  tier     text not null,   -- oracle/platinum/gold/silver/bronze
  rank     int  not null,
  primary key (season, user_id)
);
```

### 3-3. RPC（フロントが叩く）
```
-- 総合/今週リスト（category=null）またはカテゴリ別
get_ranking(p_season int, p_category text default null, p_limit int default 50)
  → RankRow[]  { user_id, name, avatar_url, rank, score, hit, total, tier, crown, note }
     ※ rank は score desc の row_number()。tier は前シーズンの ranking_tiers から。
     ※ note は "難問王"(平均 p_entry が最小の上位)等の演出。無ければ null。

-- 自分の行（順位・パーセンタイル・昇格情報）
get_my_rank(p_season int)
  → MyRank { rank, percentile, delta, tier, score, hit, total,
             next_tier, to_promote, promote_progress }
     percentile = ceil(rank / total_ranked * 100)
     delta      = 前回スナップショットとの順位差（無ければ 0）
     to_promote = 次ティアcutoff_score - my_score（クランプ0）

-- カテゴリ王一覧
get_category_champions(p_season int)
  → { category, icon, entrants, leader:{name,score,avatar_url,is_you,crown} }[]
```
- `is_you` はサーバー側で auth.uid() と比較して付与。
- **カットオフ**：`percentile` から platinum=5,gold=20… の閾値scoreを算出（`percentile_disc` / 件数×割合番目のscore）。

### 3-4. 更新タイミング
- **スコア加算**：市場解決時のジョブで、勝ち側ポジションに `gain` を加算（`ranking_scores` upsert、category行も同時更新）。
- **順位スナップショット**：`delta` 用に日次で `rank` を控える（任意）。
- **シーズン締め cron**（毎週月曜 00:00 JST）：`ranking_scores` の最終順位から `ranking_tiers` を確定 → `season++`。上位者へ称号/景品ポイント付与（運用ポリシーに従う）。

---

## 4. フロント実装

`web/components/RankingBoard.tsx`（本バンドル）を配置し、`/leaderboard`（既存 `LeaderboardView`）を置き換え／内包。

```tsx
import { RankingBoard, CategoryChampion } from "@/components/RankingBoard";

const [tab, setTab] = useState<"week"|"all"|"category">("week");
const { data: me }   = useSWR(["myRank", season], () => rpc("get_my_rank", { p_season: season }));
const { data: rows } = useSWR(["ranking", season, tab], () =>
  rpc("get_ranking", { p_season: tab === "all" ? 0 : season }));  // all=通算は season=0 等の規約で
// category タブは get_category_champions を使い <CategoryChampion/> を並べる

<RankingBoard
  season={season}
  endsIn={endsIn}          // 締めまでのカウントダウン（クライアント計算可）
  tab={tab} onTab={setTab}
  me={me}
  rows={rows}
  promoteCutoff={platinumCutoffRank}  // 昇格ライン（この順位の後に区切り線）
/>
```
- `tab==="category"` のときは `rows` の代わりにカテゴリ王カード群を描画（`reference` の「カテゴリ王」画面参照）。
- ティア章は `TierBadge`、カテゴリ王は `CategoryChampion` を再利用。
- 依存：`GorillaFace.tsx`、既存トークン（`globals.css`）。**新規の色・フォントは追加しない**。

### コンポーネントAPI（`RankingBoard.tsx` 内 export）
- `RankingBoard(props)` … 本体（ヘッダー/タブ/自分ヒーロー/リスト/昇格ライン）
- `TierBadge({tier,size})` … 六角形ティア章（oracle=👑/他=🦍＋tier名）
- `CategoryChampion({icon,name,entrants,leader,accent})` … カテゴリ王カード
- 型：`Tier` / `RankRow` / `MyRank` / `TIER_META`

---

## 5. トーン / 表記
- 「賭ける」表現は使わない（「予想する・乗る」）。スコアは遊びの指標であり金銭価値はない。
- 「予想スコア」「難しい予想ほど高得点」を用語ヘルプ（ⓘ）で1行説明。
- 少人数カテゴリでも成立するよう、カテゴリ王は entrants を併記して煽らない。

---

## 6. 受け入れチェック
- [ ] 鉄板だけ当て続けても、大穴を当てる人よりスコアが伸びにくい（1-1の式が効いている）。
- [ ] `total_resolved < 5` はランキング/カテゴリ王に出ない。
- [ ] 週次で season が進み、ティアが昇格/降格する。
- [ ] 自分の行がハイライトされ、昇格まで pt と上位%が出る。
- [ ] 色・フォントは既存トークンのみ（新規追加なし）。
