# Handoff: ゴリラ予想 リブランド（B案：グレープ・ポップ）

> 対象リポジトリ: `jinjinsansan/dmarket`（`web/`・Next.js 16 App Router / TypeScript / Tailwind CSS v4 / Recharts）
> このパッケージだけで、会話に参加していない開発者が実装を完了できるように書いています。

---

## Overview
既存の予測市場アプリ「D-market」を、**「ゴリラ予想」**（グレープ・バイオレット＋バナナ・イエロー、温かいオフホワイト基調、ゴリラの線画フェイス）へ全面リブランドする。換金不可ポイントで遊ぶ予測市場という性質は変えず、初心者にやさしくXで映えるトーンに刷新する。

## このバンドルのファイルについて（重要）
- `reference/proposal.html` … **デザインの参照用プロトタイプ（HTML）**。最終的な見た目・配色・レイアウトを示すもので、そのまま本番に貼るコードではありません。ブラウザで開くと、パン／ズームできる1枚キャンバスに全画面（①〜⑩）＋パレット＋マスコット＋コンポーネント仕様が並びます。
- それ以外のファイル（`globals.css` / `Logo.tsx` / `Splash.tsx` / `assets/*`）は、**既存リポジトリにほぼそのまま差し込める実装ファイル**です。
- **本タスクの本質は「HTMLの作り直し」ではなく「既存Next.jsコードへのB案の適用」**。トークン設計（変数名据え置き・値だけ差替）のおかげで、大半は `globals.css` の差し替えだけで一般画面・管理画面ともに反映されます。

## Fidelity
**High-fidelity（hifi）**。配色・タイポ・余白・角丸・影は確定値。`reference/proposal.html` の各画面をピクセル基準として、リポジトリの既存コンポーネントに反映してください。

---

## クイックスタート（これで約9割が完了）

1. **`web/app/globals.css` を本バンドルの `globals.css` で置き換える**（`:root` と `html.dark` の値のみ更新。変数名・`@theme inline`・ユーティリティ・アニメーションは据え置き）。`--grad / --hero-grad / --shadow / --cta-glow` も暖色＆グレープへ更新済み。トークン経由の全要素（一般＋`/admin`）が自動で反映される。
2. **`web/components/Logo.tsx` を本バンドルの `Logo.tsx` で置き換える**（D-marketロゴ → ゴリラ線画＋「ゴリラ予想」ワードマーク）。
3. **favicon / アイコンを差し替える**（`assets/` 参照、下記「layout.tsx」）。
4. **起動スプラッシュを追加**：`Splash.tsx` を `web/components/` に置き、`layout.tsx` の `<body>` 先頭でマウント。
5. **ハードコード色の個別調整**：`color-audit.md` の一覧を順に処理（最重要は `lib/market-visual.ts` のサムネtint）。

---

## 変更ファイル一覧

| ファイル | 変更内容 | 種別 |
|---|---|---|
| `web/app/globals.css` | 本バンドルの `globals.css` で置換 | 置換（提供） |
| `web/components/Logo.tsx` | 本バンドルの `Logo.tsx` で置換 | 置換（提供） |
| `web/components/Splash.tsx` | 新規追加（本バンドル） | 追加（提供） |
| `web/app/layout.tsx` | メタ文言・既定テーマ・favicon・Splashマウント | 手修正 |
| `web/lib/market-visual.ts` | `TINTS` / `BY_SLUG` の色をB案調和パレットへ | 手修正 |
| `web/components/TopNav.tsx` | 残高ピルのコインSVG色（シアン→バナナ） | 手修正 |
| `web/app/favicon.ico` 等 | ゴリラ版へ差し替え | 差し替え（提供） |
| OGP生成 | `assets/og-*.svg` をテンプレに動的生成 | 参照（提供） |

### 追加コンポーネント（reference の各状態を実装ファイル化）
| ファイル | 内容 |
|---|---|
| `GorillaFace.tsx` | マスコット線画。`expr`（neutral/win/thinking/surprised/sad）で表情切替。`color` は currentColor 連動。空/エラー/トースト/アバターで再利用 |
| `States.tsx` | `EmptyState` / `ErrorState`（ゴリラ付き）／`LoadingState`・`Skeleton`（ゴリラ＋shimmer） |
| `Toast.tsx` | 約定・受取・エラー トースト。下中央からスライドイン（`@keyframes dmToast`）。ゴリラ表情が kind で連動 |
| `Hero.tsx` | トップのヒーロー。アクセスのたび A↔B 交互（`localStorage 'gp-hero'`） |
| `TrendingTopics.tsx` | 注目のトピック（背景b：淡グレープ＋ヘッダー帯／YES%ミニリング） |
| `Splash.tsx` | 起動スプラッシュ（グレープ全面＋ゴリラ／`sessionStorage` で初回のみ） |

> `globals.css` には `@keyframes dmToast / gpBlink / shimmer` と `.sk`（スケルトン）も同梱済み。これらコンポーネントは追加のCSS無しで動く。

---

## Design Tokens（確定値）

### Light（`:root`）
| 変数 | 値 | 用途 |
|---|---|---|
| `--bg` | `#FAF6EF` | 背景（温かいオフホワイト） |
| `--surface` | `#FFFFFF` | カード/面 |
| `--surface2` | `#F4EEE3` | 副面/チップ地 |
| `--border` | `#EBE3D6` | 境界線 |
| `--text` | `#2A2018` | 本文（温かいニアブラック） |
| `--dim` | `#8B8073` | 補助テキスト |
| `--faint` | `#C2B7A7` | 最弱テキスト/プレースホルダ |
| `--primary` | `#7B46E3` | ブランド（グレープ） |
| `--primary-weak` | `#EFE8FC` | 主色の弱面 |
| `--accent2` | `#F4BE1F` | アクセント（バナナ） |
| `--pos` | `#15B877` | YES/上げ（グリーン） |
| `--pos-weak` | `#E5F7EF` | YES弱面 |
| `--neg` | `#F2604C` | NO/下げ（コーラル） |
| `--neg-weak` | `#FCEAE6` | NO弱面 |
| `--radius` / `--radius-sm` | `20px` / `12px` | 角丸 |
| `--grad` | `linear-gradient(135deg,#7B46E3,#9D6BF0)` | CTAグラデ |
| `--hero-grad` | `linear-gradient(135deg,#2A1B4D,#4A2E86)` | ヒーロー暗面 |
| `--shadow` | `0 1px 2px rgba(42,32,24,.05), 0 14px 40px -18px rgba(42,32,24,.18)` | カード影 |
| `--cta-glow` | `0 8px 20px -8px rgba(123,70,227,.55)` | CTAグロー |

### Dark（`html.dark`）
| 変数 | 値 |
|---|---|
| `--bg` `--surface` `--surface2` `--border` | `#17120D` `#221B14` `#2C241B` `#3B2F23` |
| `--text` `--dim` `--faint` | `#F3ECE1` `#B2A593` `#796D5D` |
| `--primary` `--primary-weak` | `#A480F2` `#251B3E` |
| `--accent2` | `#FFD53E` |
| `--pos` `--pos-weak` | `#2FD18C` `#123026` |
| `--neg` `--neg-weak` | `#FB7B68` `#3A1D19` |

> **YES=`--pos` / NO=`--neg` はブランド色と必ず区別**。B案（紫）は緑・赤と干渉しない。

### タイポ
- 和文/欧文: `--font-noto`（Noto Sans JP）/ `--font-roboto`（Roboto）。**フォント実装は据え置き**。
- 数値（確率%・倍率・pt・時刻）: `.mono` / `.num` = `--font-roboto-mono` + `tabular-nums`。**確率%・pt は常に等幅で大きく**。

---

## 画面ごとの実装メモ（`reference/proposal.html` 参照）

各画面はトークン経由なので、原則 **`globals.css` 差し替えだけでB案化**。下記は確認ポイントと、参照キャンバス上の番号。

- **① 市場一覧** (`/` `MarketGrid` `MarketCard`): 大きな確率%（等幅・`--primary`寄り or `vis.tint`）＋スパークライン＋カテゴリチップ＋YES/NO（`--pos`/`--neg`）＋シェア。LIVEバッジは`--neg`地に白。
- **② 市場詳細＋トレード** (`/market/[id]` `MarketDetailClient` `TradePanel` `ProbabilityChart`): 「起きる方／起きない方に乗る」。約定後プレビューは`--pos-weak`面に「的中時の受取 +N pt」。チャートは Recharts（線/塗り＝`color`プロップ）。
- **③ 貯める** (`/earn`): タブ（ミッション/友達紹介/シェア/案件/ランキング）。ログボはバナナ面、シェア＝`--primary`、友達紹介＝`--pos`。「乗っかり→的中で+1%」を明示。**もらえるのは換金不可の参加ポイント**である旨のフッター必須。
- **④ コメント**: スレッド／いいね（`--neg`ハート）／返信（左ボーダーでネスト）／ポジションバッジ（YES保有=`--pos-weak`、NO保有=`--neg-weak`、的中率=`--primary-weak`）／通報（⋯）。アバターはゴリラ線画（`currentColor`で色替）。
- **⑤ OGP**: 下記「Assets / OGP」参照。
- **⑥ ユーザー作成市場**: 審査通過者のみ作成可・**解決は運営（管理者）**・作成者テラ銭（=参加pt）をバナナ面で表示。
- **⑦ ランキング** (`/leaderboard` `LeaderboardView`): 表彰台＋一覧。**アバターはウォームニュートラル**（`--surface2`地）、1位のみ淡い紫。順位ポイントは本文色。「あなた」の行だけ`--primary`でハイライト。メダル金銀銅 `#eab308/#94a3b8/#cd7f32` は意味色として据え置き。
- **⑧ 景品交換** (`/prizes`): 賞品ポイント残高ピル（`--primary-weak`）＋カードグリッド。必要ptは本文色、`交換する`のみ`--primary`の実CTA。在庫切れはdim＋無効化。
- **⑨ マイページ** (`/mypage`): プロフィール（`--grad`アバター＋称号バッジ）＋ステータスカード＋称号コレクション＋保有＋賞品pt台帳。
- **⑩ スプラッシュ（起動画面）**: 新規。下記参照。

> 紫の使いどころ＝主要アクション／ブランド要所／「あなた」ハイライトのみ。一覧の数値やユーザーアバターは中立色にして紫の過多を避ける（②③でも同方針）。

---

## スプラッシュ（起動画面）の実装

`web/components/Splash.tsx`（本バンドル）を追加し、`web/app/layout.tsx` の `<body>` 先頭にマウント：

```tsx
import { Splash } from "@/components/Splash";
// ...
<body className="h-screen flex flex-col overflow-hidden bg-bg text-text" style={{ height: "100dvh" }}>
  <Splash />
  <TopNav />
  {/* ... */}
</body>
```
- グレープ全面（`var(--primary)`）に白のゴリラ＋「ゴリラ予想」＋タグライン＋点滅ドット。
- 初回マウントから約0.9s表示→0.4sでフェードアウト。`sessionStorage`で同一セッション内は再表示しない。
- ドットのアニメは `globals.css` の `@keyframes gpBlink` / `.gp-dot`（本バンドルに同梱済み）。

---

## `layout.tsx` の手修正

```ts
// 1) メタ文言
title: "ゴリラ予想 — みんなで予想する、世界の確率。",
description: "換金不可ポイントで楽しむ予測市場。賭けではなく『予想して乗る』。当てて貯めた賞品ポイントは景品と交換できます。",
metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "https://goripredict.app"),

// 2) 既定テーマをライトに（白基調方針）。明示 dark のときだけダーク。
const themeScript = `(function(){try{var t=localStorage.getItem('dm-theme');if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`;
```
- `<head>` に favicon/PWA リンクと theme-color を追加：
```tsx
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png" sizes="32x32" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="theme-color" content="#FAF6EF" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#17120D" media="(prefers-color-scheme: dark)" />
```
`assets/` の `favicon.svg / favicon-32.png / apple-touch-icon.png(180) / icon-512.png` を `web/public/`（および `app/favicon.ico` 差し替え）へ配置。

---

## `lib/market-visual.ts` の手修正（最重要のハードコード色）

カードの大きな確率%・サムネ地に使う `tint` を、B案調和パレットへ：
```ts
const TINTS = ["#7b46e3","#f4be1f","#e08a2b","#3fa8b5","#e0608a","#6e8bd8","#8c6fe0","#d98c5f","#5bae8a"];
// BY_SLUG の各 tint も上記から再割当。image_url ありの戻り tint も "#7b46e3" に。
```
- 純緑・純赤は YES(`#15B877`)/NO(`#F2604C`) と紛れるため除外済み。
- ブランド統一を強めたい場合は、カード%色を `vis.tint` ではなく `--primary` 固定にする選択肢もあり（要相談）。

その他の直値（TopNavコインSVG、`navy/cyan/sky-/blue-` 等）は **`color-audit.md` の一覧＋grepキーワード**で順に処理。トークン経由（`text-primary` `bg-pos` `var(--…)`）のものは `globals.css` 差し替えだけで反映されるので対象外。

---

## コンポーネント仕様（共通）
- **ボタン**: 角丸 `12〜14px`、押下 `.btn-press`（scale .97）。プライマリ=`--primary`実塗り+`--cta-glow`／YES=`--pos`・NO=`--neg`（実塗り or `*-weak`ソフト）／ゴースト=`--border`枠。
- **チップ**: 角丸 `999px`、選択中=`--primary`実塗り、未選択=`--surface`+`--border`枠+`--dim`。
- **タブ**: 下線2.5px `--primary`／セグメントは `--surface2` トラック＋選択タイルに白＋小影。
- **バッジ**: LIVE=`--neg`地白＋点滅ドット、NEW=`--banana`系、YES/NO保有=`*-weak`、的中率=`--primary-weak`。角丸 `6px`、`10〜11px` 800。
- **カード**: `--surface`＋1px `--border`＋`--radius`＋`--shadow`、ホバー `.card-hover`。
- **トースト**: `--text`地に`--bg`文字、下中央から `dmToast`。約定/受取/エラーで表示。

## マスコット運用
- ゴリラ線画は単一ウェイト（viewBox100で stroke≈4.6）。`stroke="currentColor"` で色替。
- 状態別表情：ふつう/的中（笑顔・`--pos`）/思案/びっくり/残念（`--neg`）。空・ローディング・エラーで使用。コメントアバターにも縮小利用。

## Assets / OGP
- アイコン: `assets/favicon.svg`（原版）、`favicon-32.png`、`apple-touch-icon.png`(180)、`icon-512.png`。
- OGP: `assets/og-default.svg`（市場名＋現在%＋ゴリラ）／`og-win.svg`（的中後・笑顔ゴリラ＋受取pt）。1200×630。**resvg / @vercel/og（Satori）対応のtextベース**（foreignObject不使用）。`{question}` `{pct}` `{受取pt}` を動的差替して生成。和文フォントはサーバ側で埋め込み（Noto Sans JP）。
- サムネ実画像は `markets.image_url` 推奨（無い場合のみ tint＋glyph プレースホルダ）。

---

## Acceptance checklist
- [ ] `globals.css` 置換後、一般画面・`/admin` ともに紫＋オフホワイトになる（青系が残らない）。
- [ ] ライト/ダーク両方で文字コントラストが確保される（既定はライト）。
- [ ] YES=緑 / NO=コーラル がブランド紫と明確に区別できる。
- [ ] Logo・favicon・OGP・スプラッシュがゴリラに統一されている。
- [ ] 「賭ける」表現が無く、「予想する/乗る」になっている。換金訴求が無い（換金不可ポイント明示）。
- [ ] `color-audit.md` の直値がすべて処理済み（grep でヒット無し）。
- [ ] ランキング/景品で紫が過剰でない（アバター中立・数値本文色・CTA/ハイライトのみ紫）。

## Files（このバンドル）
- `globals.css` … 差し込む本番CSS（B案・ライト/ダーク・gpBlink同梱）
- `Logo.tsx` / `Splash.tsx` … 実装コンポーネント
- `assets/` … favicon各種・OGP SVG
- `color-audit.md` … ハードコード色の洗い出し＋grepキーワード
- `reference/proposal.html` … 全画面のデザイン参照（ブラウザで開く）
