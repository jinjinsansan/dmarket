# ハードコード色 洗い出し（B案移行）

`globals.css` の値差し替えで大半は自動反映されますが、**トークンを経由せず直接色指定している箇所**は個別調整が必要です。以下、ファイル別。

凡例：✅=`handoff/` に修正版あり／🔧=要コード修正／🟡=ブランド都合で据え置き

---

## 1. `web/app/globals.css` ✅
旧ネイビー/シアンの直値があったトークン定義。修正版 `handoff/globals.css` で対応済み。
- `--grad` `#0ea5e9→#06b6d4` ⟶ グレープ `#7b46e3→#9d6bf0`
- `--hero-grad` `#0b1f3a→#143a63` ⟶ ダークグレープ `#2a1b4d→#4a2e86`
- `--shadow` `rgba(11,31,58,…)` ⟶ 暖色 `rgba(42,32,24,…)`
- `--cta-glow` `rgba(6,182,212,…)` ⟶ `rgba(123,70,227,…)`
- `.card-hover:hover` の `box-shadow` ネイビー直値 ⟶ 暖色化（修正版反映済み）

## 2. `web/components/Logo.tsx` ✅
`#0ea5e9 / #06b6d4 / #0b1f3a`（D-marketロゴ）⟶ ゴリラ線画＋`var(--primary)`。修正版 `handoff/Logo.tsx`。

## 3. `web/lib/market-visual.ts` 🔧 ←最重要
カードの大きな確率%とサムネ地に使う `tint` の元。旧パレットが青系で残る。
- `TINTS = ["#0284c7","#f59e0b","#10b981","#14b8a6","#f43f5e",…]` ⟶ B案調和パレットへ差し替え推奨：
  ```ts
  const TINTS = ["#7b46e3","#f4be1f","#e08a2b","#3fa8b5","#e0608a","#6e8bd8","#8c6fe0","#d98c5f","#5bae8a"];
  ```
  ※ YES緑(#15B877)・NO赤(#F2604C)と紛れないよう、純緑・純赤は除外。
- `BY_SLUG` の各 `tint`（`#0e9488`,`#f59e0b`,`#0284c7`,`#10b981`,`#14b8a6`）も上記から再割当。
- `image_url` ありの戻り `tint:"#0284c7"` ⟶ `"#7b46e3"`。
- 補足：カード%色は現状 `vis.tint`。カテゴリで色を散らす演出を残すなら上記でOK。ブランド統一したいなら `--primary` 固定に変更も可。

## 4. `web/components/TopNav.tsx` 🔧🟡
- 残高ピルのコインSVG `fill="#0891b2"`（シアン）/ `fill="#e6faff"` 🔧 ⟶ バナナ＋グレープへ：
  `<circle r="10" fill="#F4BE1F"/><circle r="4.4" fill="#fff"/>` など。
- `受取`ボタンは `var(--grad)`/`var(--cta-glow)` 経由 ✅（自動でグレープ化）。
- LINEログイン `background:"#06C755"` 🟡 ⟶ **据え置き**（LINE公式ブランド色。変更不可）。

## 5. `web/app/layout.tsx` 🔧
- `metadata.title/description` が「D-market …」🔧 ⟶ ゴリラ予想の文言へ。
- `metadataBase` フォールバック `https://d-market.io` 🔧 ⟶ 新ドメイン。
- **既定テーマがダーク**（`themeScript` が既定で `.dark` 付与）🔧 ⟶ 白基調方針に合わせ **既定ライト** 推奨：
  ```js
  // 既定ライト・明示dark時のみダーク
  var t=localStorage.getItem('dm-theme'); if(t==='dark'){document.documentElement.classList.add('dark')}
  ```
- `<meta name="theme-color">` を追加するなら ライト`#FAF6EF` / ダーク`#17120D`。

## 6. `web/components/ProbabilityChart.tsx` ✅(ほぼ)
軸・ツールチップは `var(--faint)/--surface/--border)` 経由。線/塗りは `color` プロップ＝`vis.tint` 由来 → **3 のパレット差し替えで連動**。追加修正不要。

## 7. アイコン類 ✅
`web/app/favicon.ico` ⟶ `handoff/favicon-32/180/512.png` ＋ `favicon.svg` に差し替え。
OGP ⟶ `handoff/og-default.svg` / `og-win.svg`（現在%・受取ptは動的合成）。

---

## まだ確認していない箇所（grep推奨）
本番リポで以下を検索し、ヒットを上記方針で処理してください：
```
#0ea5e9  #06b6d4  #0b1f3a  #143a63  #0284c7  #0891b2  #e6faff
#f59e0b  #10b981  #14b8a6  #f43f5e  #0e9488   navy  cyan  sky-  blue-
```
- `app/mypage` `app/prizes` `app/earn` `app/leaderboard` と `admin/*` の各 `page.tsx`
- `components/admin/*`（FeedSettings / Templates / Dashboard 等のステータス色）
- インライン `style={{ background:"#..." }}` と Tailwind の `text-sky-* / bg-blue-* / *-cyan-*`

> トークン(`text-primary` `bg-pos` `var(--…)`)経由のものは **globals.css 差し替えだけで反映**。直値だけが個別対象です。
