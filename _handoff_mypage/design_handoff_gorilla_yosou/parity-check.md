# Parity Check — プレビュー vs 現行リポジトリ（main）

最新の `jinjinsansan/dmarket@main` を読んで、私のプレビュー（`reference/proposal.html`）と一致しているかを画面ごとに照合した結果です。
**結論：B案デザインはほぼ忠実に実装済み。** ただし、最後に二人で詰めた「注目トピックの最終形」と「ヒーローA↔B交互」が未反映でした。下記の🔴を当てれば完全一致します。

凡例：🟢一致／🟡軽微な差（任意）／🔴プレビューと相違（要反映）

---

## 🟢 完全一致（そのままでOK）
| 対象 | 既存ファイル | 備考 |
|---|---|---|
| デザイントークン | `web/app/globals.css` | 私の `handoff/globals.css` と同一（ライト/ダーク・`--grad/--shadow/--cta-glow`・`gpBlink`まで）。`gpConfetti` が追加されている＝的中時の紙吹雪用で問題なし |
| 起動スプラッシュ | `web/components/Splash.tsx` | 私の `Splash.tsx` と同一 |
| 市場カード① | `web/components/MarketCard.tsx` | カテゴリ＋大きな%＋全幅スパークライン＋YES/NOピル＋残り時間＋シェア。プレビュー①と一致。`price-flash` 連動も実装済み |
| 市場詳細＋トレード② | `MarketDetailClient.tsx` / `TradePanel.tsx` / `MarketTabs.tsx` | タブ（注文板/保有者/取引履歴/コメント）構成。トークン経由でB案反映済み |
| ロゴ | `web/components/Logo.tsx` | ゴリラ版に差し替え済み |

## 🟢 コメントエリア④ — ほぼ一致
`web/components/MarketTabs.tsx` 内 `Comments` に実装済み。プレビュー④の要素はすべて揃っています：
- スレッド（親＋返信）／いいね（カウント）／返信入力／**ポジションバッジ YES保有・NO保有**／通報／**人気順・新着順**切替／空状態（「最初の一言を！🦍」）。

### 🟡 プレビューとの軽微な差（お好みで・任意）
1. **アバター**：現行は「頭文字＋カラー（`AVATAR_COLORS`）／画像があれば画像」。プレビューは**ゴリラ線画アバター**。
   - 現行方式はユーザー識別がしやすい実利あり。ブランド優先なら下記「ゴリラアバター案」に差し替え可（`handoff/GorillaFace.tsx` を利用）。
2. **いいねアイコン**：現行はサムズアップ系＋`liked`で紫。プレビューは**ハート＋赤(`--neg`)**。どちらでも可。統一したいならプレビューに寄せる。
3. **返信のネスト**：現行は左インデント（`ml-9`）。プレビューは**左ボーダー線**でのネスト。視認性を上げたいなら左ボーダーを追加。
4. プレビューにあった **「的中率68%」バッジ**は現行未実装（YES保有/NO保有のみ）。出すなら `holding` と並べて表示。

> いずれも“動作に影響しない見た目の好み”レベル。必須ではありません。

---

## 🔴 プレビューと相違（最後に詰めた最終形が未反映）

### 1. 注目のトピック（Trending）— 最重要
- **現行**：`web/components/MarketGrid.tsx` 内 `Trending`。**白カード＋カテゴリ色のグリフ角タイル（≒以前の菱形）**、%は `vis.tint` 色。→ これは**改善前の姿**で、スクショで「ダサい」と指摘いただいた状態のまま。
- **プレビュー最終形（確定済み）**：
  - パネル背景 = **背景b（淡グレープ `--primary-weak` ＋ グレープのヘッダー帯）**
  - 行頭 = **YES%ミニリング**（50%以上=緑/未満=赤、リング背景は白）
  - 順位番号・%は本文/グレープ色
- **対応**：`handoff/TrendingTopics.tsx`（提供済み）に差し替え。`MarketGrid.tsx` の `<Trending list={trending} yesPct={yesPct} />` を以下に置換：
  ```tsx
  import { TrendingTopics } from "./TrendingTopics";
  // ...
  <TrendingTopics
    topics={trending.map((m) => ({ id: m.id, question: m.question, yesPct: Math.round(yesPct(m)) }))}
  />
  ```
  （`TrendingTopics` は `{id, question, yesPct}[]` を受け取る。既存の `trending` と `yesPct()` をそのまま使える）

### 2. ヒーローの A↔B 交互表示
- **現行**：`web/components/Hero.tsx` は **B案（今日のお題型）のみ**（`Hero({ daily })`）。
- **プレビュー/最終提供**：アクセスごとに **A案（ようこそ型）↔ B案** を交互（`handoff/Hero.tsx`、`localStorage 'gp-hero'`）。
- **対応（交互にしたい場合のみ）**：`handoff/Hero.tsx` に差し替え、`MarketGrid.tsx` の呼び出しを `featured` も渡す形へ：
  ```tsx
  <Hero
    daily={toHero(heroDaily)}
    featured={toHero(trending[0])}  // A案右側の「今日の注目」に使用
  />
  ```
  ※ B案のみで運用継続なら現状維持でOK（その場合この項目は無視）。

---

## 状態・トースト（参考）
- **ローディング**：`app/loading.tsx` 等のスケルトンで実装済み（B案で問題なし）。ゴリラ付きの空/エラーにしたい画面があれば `handoff/States.tsx`（`EmptyState`/`ErrorState`/`LoadingState`）を使用。
- **的中演出**：`Confetti.tsx`＋`gpConfetti` で実装済み。
- **約定/受取トースト**：ゴリラ表情つきの共通トーストにしたい場合は `handoff/Toast.tsx`。現行が独自トーストで足りていれば任意。
- **GorillaFace**：表情つきマスコットを各所で使い回すなら `handoff/GorillaFace.tsx` を共通化（コメントアバター・空状態・トーストで再利用可）。

---

## まとめ（Claude Code への指示例）
1. **必須**：`TrendingTopics.tsx` を追加し、`MarketGrid.tsx` の `Trending` を差し替え（注目トピックを最終形＝背景b＋YES%リングに）。
2. **任意（交互ヒーロー）**：`Hero.tsx` を交互版に差し替え、`featured` を渡す。
3. **任意（コメント微調整）**：いいね＝ハート赤／返信ネスト＝左ボーダー／ゴリラアバター、をプレビューに寄せる。
4. それ以外（トークン・スプラッシュ・カード・トレード・コメント機能本体）は**すでにプレビュー通り**。
