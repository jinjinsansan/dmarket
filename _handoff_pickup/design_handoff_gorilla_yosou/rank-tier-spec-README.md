# 称号ランク（8段階・アバター枠）— 実装仕様書

対象: `jinjinsansan/dmarket`（`web/` Next.js 16 / TS / Supabase 想定）
UI参照: `reference/proposal.html`「14 — 称号ランク」／ 実装UI: `AvatarFrame.tsx`（本バンドル）
目的: 既存マイページの「称号」を、**一生かけて登る個人ランク（Lv.1〜8）＝アバターのフレーム**へ刷新。コメント欄・ランキング・マイページで一目で実力が伝わる。

---

## 0. 役割分担（重要）
| | 週次ランキング（`ranking-spec`） | 称号ランク（本書） |
|---|---|---|
| 性質 | 競争・相対 | 到達度・絶対 |
| 期間 | 毎週リセット | 永続（**下がらない**） |
| 単位 | 予想スコア（週次） | 累計 **XP** |
| 表示 | 順位・ティア | Lv.1〜8＋**アバター枠** |
| 心理 | 今週の勝負 | 積み上げた信頼の証 |

2つは別物。ランクは下がらないので初心者も安心して登れる。ランキングのティア（週次）とは混同しない。

---

## 1. 8段階のランクと解放条件（デフォルト案・調整可）
| Lv | 名称 | 解放条件（例） | 枠の見た目 |
|---|---|---|---|
| 1 | 新米 | 登録直後 | ブロンズ縁 |
| 2 | 見習い | 予想 10 回 | シルバー縁 |
| 3 | 一人前 | 的中 10 回 | ゴールド縁 |
| 4 | 予想士 | 的中率 55% 以上（母数20+） | グレープ縁 |
| 5 | 精鋭 | 的中 50 回 | グレープ＋バナナ縁取り |
| 6 | 予言者 | 難問（p_entry ≤ 0.3）を的中 | グラデ＋グロー |
| 7 | 賢者 | 通算スコア上位 / XP到達 | グラデ＋★エンブレム |
| 8 | ゴリラ神 | 頂点（XP最大到達） | グラデ＋👑＋強グロー、アバター地もダークグレープ |

- **主軸は累計XP**（下表）でLvを決める。的中率・難問的中などの「条件系」は、該当Lvの**追加ゲート**として併用してよい（例：Lv4は XP到達 かつ 的中率55%）。MVPは**XPしきい値のみ**で単純化してもOK。
- Lv.8 は席数を絞る運用（例：XP最大 かつ 上位N名）も可。まずは XP しきい値で開放して問題ない。

### XPしきい値（例・要バランス調整）
```
Lv1:0  Lv2:100  Lv3:300  Lv4:700  Lv5:1500  Lv6:3000  Lv7:6000  Lv8:12000
```

### XPの貯まり方（活動全般 → 継続を促す）
```
的中1回        +40
コメントいいね獲得 +5（1コメントの上限あり: 例 +50/日）
シェア(?ref付き) +10（1日上限あり）
連続ログイン    +10/日（7日で+30ボーナス）
市場作成が承認   +30
乗っかりボーナス発生 +15
```
- **外しても減点なし**。XPは活動量＋実績の複合で、純粋な勝敗だけに寄らない（初心者も登れる）。
- スパム対策：いいね/シェアは日次上限。自己いいね・相互不正はサーバー側で除外。

---

## 2. データ（Supabase 想定）
```sql
alter table profiles add column xp int not null default 0;
alter table profiles add column rank_level smallint not null default 1;

-- XP付与履歴（監査・不正対策・日次上限判定に使用）
create table xp_events (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id),
  kind       text not null,   -- 'hit' | 'like' | 'share' | 'login' | 'market_approved' | 'ride_bonus'
  amount     int  not null,
  ref_id     text,            -- 対象market/comment等
  created_at timestamptz not null default now()
);
create index on xp_events (user_id, kind, created_at);
```
- **rank_level はサーバーで再計算**（XPしきい値関数）。付与のたびに更新し、上がったら通知/トースト（`Toast.tsx`, ゴリラ win 表情）。
- `rank_level` は**単調非減少**（max を保持）。しきい値を将来上げても既存ユーザーは降格しない運用に。

### RPC / 関数
```
add_xp(p_user uuid, p_kind text, p_amount int, p_ref text)
  → 日次上限チェック → xp_events insert → profiles.xp 加算 → rank_level 再計算 → { xp, rank_level, leveled_up }

get_rank(p_user uuid)
  → { level, xp, xp_for_next, xp_current_floor, breakdown? }
```
- コメント一覧/ランキングのユーザー行には `rank_level` を含めて返す（N+1回避のため JOIN で同梱）。

---

## 3. フロント実装（`AvatarFrame.tsx`）

### 3-1. コメント欄・ランキング・保有者リストのアバターを差し替え
既存のアバター（頭文字丸／画像）を `AvatarFrame` に置換。名前の横に Lv章を出す。
```tsx
import { AvatarFrame, rankBadgeStyle, RANK_META } from "@/components/AvatarFrame";

<AvatarFrame level={c.author.rankLevel} size={40} name={c.author.name} avatarUrl={c.author.avatarUrl} />
// 名前の右に：
<span style={rankBadgeStyle(c.author.rankLevel)}>Lv.{c.author.rankLevel} {RANK_META[c.author.rankLevel].short}</span>
```
- サイズ目安：コメント=`40`／リスト行=`32`／マイページ=`80`。小さいほどエンブレムも自動縮小（size基準）。
- 依存：`GorillaFace.tsx`、既存トークン。**新規の色・フォント追加なし**（medal色 bronze/silver/gold は既存の意味色として使用）。

### 3-2. マイページのランクヒーロー
```tsx
import { RankHero } from "@/components/AvatarFrame";

const r = await getRank(userId); // {level, xp, xp_for_next}
<RankHero
  level={r.level}
  xp={r.xp - r.xp_current_floor}      // 現Lv床からの相対
  xpForNext={r.xp_for_next - r.xp_current_floor}
  breakdown={[
    { label: "的中でXP", value: "+40" },
    { label: "いいね獲得", value: "+5" },
    { label: "シェア", value: "+10" },
  ]}
/>
```
- マイページの「称号コレクション」は**このランクヒーロー＋（任意で）実績バッジ**に置き換え/併存。`MyPageHero.tsx` の下に配置するのが自然。

### API（`AvatarFrame.tsx` 内 export）
- `AvatarFrame({level,size,name,avatarUrl})` … アバター＋枠（エンブレム自動）
- `RankHero({level,xp,xpForNext,breakdown})` … マイページ用ヒーロー
- `rankBadgeStyle(level)` … 名前横のLv章スタイル
- `RANK_META` / 型 `RankLevel`

---

## 4. 昇格演出・トーン
- 昇格時：`Toast.tsx`（ゴリラ win 表情）＋任意で `Confetti`。「Lv.6 予言者に昇格！🦍」。
- 「賭ける」表現は使わない。ランクは遊びの実績であり金銭価値はない。
- 枠は自己主張しすぎない太さ（size×0.06）。UIの可読性を最優先。

## 5. 受け入れチェック
- [ ] コメント欄で 36〜40px でも Lv 差が枠色/エンブレムで識別できる。
- [ ] ランク（Lv）は下がらない。XPは活動全般で貯まる。
- [ ] Lv.8 は 👑＋強グロー＋ダーク地で明確に別格。
- [ ] 週次ランキングのティアと混同しない表記になっている。
- [ ] 色・フォントは既存トークンのみ（新規追加なし）。
