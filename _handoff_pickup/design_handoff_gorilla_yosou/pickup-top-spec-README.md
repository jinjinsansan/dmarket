# トップ刷新「ピックアップ1本集中」型 — 実装仕様書

対象: `jinjinsansan/dmarket`（`web/` Next.js 16 / TS / Tailwind v4 / Supabase 想定）
UI参照: `reference/proposal.html`「15 — トップ ピックアップ1本集中型」
実装UI: `PickupTop.tsx`（組み立て）＋ `LiveBar / PickupCard / NextPickup / LiveComments / QuietNav`（部品）＋ `PickupSchedule.tsx`（管理）

---

## 0. コンセプト
市場をタイルで大量に並べるのをやめ、**トップは常に「今のピックアップ市場 たった1本」だけ**を大きく見せ、全ユーザーをそこに集中させる。**毎時0分で自動的に次の市場へ切替**。スポーツは試合中もBET可。「今ここで、みんなが同じ1本を見ている」ライブ感を最優先。既存の市場一覧は QuietNav の「すべての市場を見る →」に退避（消さない）。

---

## 1. コンポーネント構成（上→下）
```
<PickupTop>                       ← ページ組み立て（/ を丸ごと置換）
  ├─ LiveBar                      ← ⏳締切 hh:mm:ss / 🔴LIVE試合中 ＋ 👥参加人数
  ├─ brandロウ（今のピックアップ）
  ├─ PickupCard  ★主役           ← question型 or match型（スポーツ）
  ├─ NextPickup                   ← 次予告＋カウントダウン（儀式感/FOMO）
  ├─ LiveComments                 ← アバター枠＋Lv章＋本文、自動追加で流れる
  └─ QuietNav                     ← 保有の小リスト＋すべての市場を見る
```
すべて既存トークン（`var(--…)`）と `GorillaFace`/`AvatarFrame` 前提。**新規の色・フォントは追加しない。**

### 各部品のprops（詳細は各 .tsx 冒頭）
- **LiveBar** `{ mode:"countdown"|"live", closesAt?, liveLabel?, participants }`。`useCountdown(target)` を同梱（hh:mm:ss、1秒更新）。
- **PickupCard**（判別ユニオン）
  - `kind:"question"` … `question, yesPct, deltaPct, yesPrice, spark[], category`
  - `kind:"match"` … `home/away={name,short,color,pct,price}, score?, phase?, yesPrice, spark[]`
  - 共通 `onBet(side,amount)`, `onShare()`。金額入力は内部state（簡易）。
- **NextPickup** `{ nextAt, timeLabel, title, emoji? }`。表示は mm:ss（`remain.slice(3)`）。
- **LiveComments** `{ comments: LiveComment[] }`。`LiveComment={id,name,avatarUrl?,level,text,side?,isNew?}`。`isNew` は `.dm-in` でフェードイン。0件時は空状態（ゴリラ）。
- **QuietNav** `{ holdingCount, holdings?[], onSeeAll? }`。

---

## 2. ピックアップ切替ロジック（サーバー）
- **スケジュール保持**：`pickup_slots(date, hour, market_id, source)` を用意。管理UIで割当（3章）。
- **現在のピックアップ決定**：`get_current_pickup()` … 今の時刻に該当する slot の market を返す。無ければ**フォールバック**（`null`）→ `PickupTop` が「まもなく次のピックアップ」を表示。
- **毎時0分切替**：クライアントは `NextPickup` のカウントダウンが 0 になったら `get_current_pickup()` を再フェッチ（または Supabase Realtime で `pickup_slots`/`current_pickup` の変化を購読）。サーバー時刻を基準に（クライアント時計ズレ対策で `serverNow` を渡すと堅い）。
- **スポーツLIVE**：market に `sport_meta{ live:boolean, phase:string, score:string, home,away }` を持たせ、`live=true` の間は `LiveBar mode="live"`＋`PickupCard kind="match"`。試合中もBET可（板は通常どおり）。
- **参加人数 👥**：`presence`（Realtime presence）や直近N分のアクティブ数を `participants` に。

### データ形（フロントに渡す）
```ts
type CurrentPickup =
 | { kind:"question"; market_id; category; question; yesPct; deltaPct; yesPrice; spark:number[]; closesAt }
 | { kind:"match"; market_id; sport; home; away; score?; phase?; live:boolean; yesPrice; spark:number[] };
```

---

## 3. 管理 `/admin/pickup`（`PickupSchedule.tsx`）
- 24hのスロット一覧に市場を割当。各スロットは `status: live | public | next | 未割当`。
- **自動候補**：出来高順・まもなく開始のスポーツを提示（`get_pickup_candidates()`）。`自動割当ON` のときは空きスロットを自動補完。
- 操作：空きスロットをタップ→右の候補から選ぶ→「HH:00 に割り当て」。`onAssign(hour, candidateId)` を RPC `set_pickup_slot(date,hour,market_id)` に接続。
- スポーツは試合開始時刻にスナップ（`meta:"試合開始に同期"`）。

### 必要RPC
```
get_current_pickup()                → CurrentPickup | null
get_pickup_candidates(date)         → Candidate[]（出来高/開始時刻つき）
set_pickup_slot(date,hour,market_id)
list_pickup_slots(date)             → Slot[]
toggle_auto_assign(on boolean)
```

---

## 4. 状態バリエーション（reference「15-3」）
- **通常市場**：LiveBar=⏳締切カウントダウン、PickupCard=question。
- **スポーツLIVE**：LiveBar=🔴脈動、PickupCard=match（チーム対戦・スコア・回）。
- **フォールバック**（未設定）：`pickup=null`→「まもなく次のピックアップ」＋すべての市場を見る。
- **ローディング**：スケルトン（`.sk`）。`States.tsx` の `LoadingState` でも可。
- **コメント0件**：LiveComments が空状態（ゴリラ neutral）。
- **未ログイン**：乗るボタン押下でLINEログイン導線（`#06C755` はLINEブランド色＝据え置き）。閲覧は自由、BETのみログイン要求。

---

## 5. 実装手順（要約）
1. `/`（ホーム）を `PickupTop` に差し替え。既存のグリッドは `/markets` に移設し QuietNav からリンク。
2. サーバー：`pickup_slots` テーブル＋4章のRPC。`get_current_pickup` を SSR で初期表示、以後クライアントで毎時0分＆Realtime更新。
3. スポーツ market に `sport_meta` を持たせ、`live/phase/score` を配信（既存のスコア連携があれば接続）。
4. `/admin/pickup` に `PickupSchedule` を配置。
5. コメントは既存のコメントストリームを LiveComments 形へ整形（`level` は AvatarFrame の RankLevel）。

## 6. 受け入れチェック
- [ ] トップは常に1本だけ表示。毎時0分で切替わる。
- [ ] スポーツは LIVE 表示＆試合中もBET可。
- [ ] 次予告カウントダウンで切替の期待感が出る。
- [ ] 未設定でもフォールバックで破綻しない。
- [ ] 未ログインは閲覧可・BET時のみLINE導線。
- [ ] 色・フォントは既存トークンのみ（新規追加なし）。
