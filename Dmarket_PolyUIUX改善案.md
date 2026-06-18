# D-market → Polymarket UI/UX 改善提案書

> 作成日: 2026-06-19  
> 対象コードベース: `/mnt/e/dev/Cusor/dmarket/web/`  
> 参照リファレンス: Polymarket.com (2026-06 調査)

---

## 0. エグゼクティブサマリ

Polymarket と D-market を比較調査した結果、最大のギャップは「**情報密度と視覚的訴求力**」にある。Polymarket は市場カードに大判画像・取引量・複数アウトカムを一枚で見せる「情報ショーケース型」デザインを採用するのに対し、D-market は 42px のアイコンタイルとシンプルなテキスト主体で、情報密度が低い。モバイルのボトムシートや Realtime 更新など基盤は良質であるため、改修は UI 表現レイヤーに集中できる。MVP として「①市場カードの大判サムネイル化」「②確率の大型表示強化」「③カテゴリナビのビジュアルタイル化」「④カードホバーアニメーション」「⑤チャートエリア拡張」を優先実装することで、体感品質を Polymarket 水準に引き上げられる。

---

## 1. Polymarket 分析（具体的 UI 特徴）

### 1.1 全体レイアウト
| 要素 | 詳細 |
|------|------|
| ヘッダー | sticky, 白背景, ロゴ + Browse ドロップダウン + トピックタイルスクロール |
| カテゴリナビ | 画像付きタイル（Live Crypto, Politics, Sports, Tech など）横スクロール |
| コンテンツ | 1カラム全幅カード（デスクトップ）、フィルタは上部水平タブ |
| フィルタ | New / Trending / Popular / Liquid / Ending Soon / Competitive の水平タブ |
| ソート | Trending / Liquidity / Volume / Newest / Ending Soon |
| ステータス | Active / Resolved / All の切替 |

### 1.2 市場カード
- **大判サムネイル**: カード上部全幅に画像（イベントビジュアル）
- **カテゴリバッジ**: "Sports · Soccer" のようなドット区切り小バッジ
- **確率**: 大きな% 数値（例 "56%"）+ アウトカム名
- **取引量**: "$3B Vol." 形式で右上に表示
- **複数アウトカム**: 名前 + % をリスト表示
- **ホバー**: カードリフト + ボーダー強調

### 1.3 市場詳細
- 確率チャート: 大きなエリアチャート、左上に現在% の大数字
- トレードパネル: YES/NO ボタン（緑/赤）、金額入力、Potential Return 表示
- タブ: Activity（取引ログ）/ Positions / Comments
- 関連市場: 下部に Related Markets セクション
- "Biggest wins this month" ナラティブセクション

### 1.4 カラー・タイポグラフィ
- **ライトモード主体**: 白背景 (#FFFFFF) + 濃グレー文字
- **アクセント**: 緑 (#00C851 系) YES, 赤 (#FF4040 系) NO
- **数値フォント**: モノスペース等幅
- **カード**: 白地 + light box-shadow + 1px border (#E5E7EB 系)
- **border-radius**: 8-12px（D-market の 20px より小さい）

### 1.5 モバイル
- ボトムシートによるトレードパネル（D-market も実装済み ✓）
- カテゴリは横スクロールチップ
- カードは1列フルワイド
- スティッキーヘッダー + ボトムナビ

---

## 2. D-market 現状とのギャップ（表形式）

| 項目 | Polymarket | D-market 現状 | ギャップ | 優先度 |
|------|-----------|--------------|---------|--------|
| 市場カード画像 | 大判フルワイド画像 | 42px アイコンタイル (glyph) | **大** — 視覚的インパクトに差 | 高 |
| 確率表示サイズ | カード内に大きな% | ドーナツ + ¢ 価格 | 中 — % が小さく直感性が低い | 高 |
| 取引量表示 | "$3B Vol." 右上 | 表示なし（pt 非表示） | 中 — 市場の活発さが不明 | 中 |
| カテゴリナビ | 画像付きタイルスクロール | テキストピルのみ | 中 — ビジュアル訴求が弱い | 高 |
| フィルタ・ソート | Trending/Volume/Newest など | カード/リスト切替のみ | 大 — 市場発見性が低い | 中 |
| カードホバー | リフト + ボーダー強化 | ボーダー色変化のみ | 小 — インタラクション品質 | 高 |
| チャートサイズ | 大きなエリアチャート | h-56 (224px) | 中 — 詳細の核心が小さい | 高 |
| 関連市場セクション | あり（詳細ページ下部） | なし | 中 — 回遊率への影響 | 中 |
| ライト/ダークデフォルト | ライトモード主体 | ダークモードデフォルト | 小 — ターゲット次第 | 低 |
| border-radius | 8-12px（シャープ） | 20px（丸め強め） | 小 — ブランド差として許容可 | 低 |
| ミニスパークライン | カード内（一部） | なし | 中 — 価格トレンドの直感把握 | 中 |
| 取引量ランキング | Leaderboard に Volume | 利益/出来高切替あり (✓) | 小 | 低 |
| アニメーション | 数値変化アニメ、Live バッジ | 入場フェードのみ | 中 — 生感の演出 | 中 |
| モバイルボトムシート | あり | あり (✓) | なし | — |
| 検索 | 全文検索（即時） | 基本検索 (✓) | 小 — 機能は十分 | 低 |

---

## 3. 改善提案（8カテゴリ）

---

### 3.1 全体レイアウト・情報設計
**優先度: 高 ／ 工数: 中**

#### 課題
- ホームのヒーロー行が大きすぎてマーケット一覧への到達が遅い
- ソート・フィルタ機能が「カード/リスト」のみで市場発見性が低い
- 詳細ページで「関連市場」がなく回遊しない

#### 改善案

**A) ヒーロー行をコンパクト化 + ソートバー追加**

```tsx
// Before: MarketGrid.tsx 内のヒーロー行（flex-wrap gap-4 mb-6 は大きすぎる）
<div className="flex flex-wrap gap-4 mb-6">
  <Hero openCount={markets.length} catCount={categories.length} />
  <Trending list={trending} yesPct={yesPct} />
</div>

// After: ヒーローをバナーストライプに縮小、ソートバーを追加
<div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
  <div>
    <h1 className="text-xl font-extrabold">予測市場</h1>
    <p className="text-xs text-dim">{markets.length} マーケット · Realtime</p>
  </div>
  <SortBar sort={sort} onSort={setSort} />
</div>
```

**B) ソートバーコンポーネント追加**

```tsx
type SortKey = "trending" | "volume" | "newest" | "ending";
const SORT_OPTIONS: [SortKey, string][] = [
  ["trending", "急上昇"],
  ["volume", "出来高"],
  ["newest", "新着"],
  ["ending", "締切近"],
];

function SortBar({ sort, onSort }: { sort: SortKey; onSort: (s: SortKey) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto scrollx shrink-0">
      {SORT_OPTIONS.map(([key, label]) => (
        <button key={key} onClick={() => onSort(key)}
          className={`px-3 py-1.5 rounded-full text-[12.5px] font-bold whitespace-nowrap border transition-colors
            ${sort === key
              ? "bg-primary text-white border-primary"
              : "bg-surface border-border text-dim hover:text-text"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
```

**C) 関連市場セクション（市場詳細ページ下部）**

```tsx
// MarketDetailClient.tsx 左カラム末尾に追加
{relatedMarkets.length > 0 && (
  <div className="border border-border bg-surface rounded-[var(--radius)] p-4">
    <h2 className="text-[14px] font-bold mb-3">関連マーケット</h2>
    <div className="flex flex-col gap-2">
      {relatedMarkets.slice(0, 3).map((m) => (
        <MarketCard key={m.id} market={m} variant="compact" />
      ))}
    </div>
  </div>
)}
```

---

### 3.2 市場カードデザイン
**優先度: 高 ／ 工数: 中**

#### 課題
- 42px のアイコンタイルでは視覚的インパクトが弱い
- Polymarket は大判画像でイベントの直感把握ができる
- 確率 (¢ 表示) の直感性が% 表示より低い
- 取引量（活発さの指標）が見えない

#### 改善案

**A) カードに大判ヘッダー画像 + 確率% 大型表示**

```tsx
// Before: MarketCard.tsx card variant
<div onClick={open}
  className="flex flex-col gap-3.5 border border-border bg-surface rounded-[var(--radius)] p-4 cursor-pointer hover:border-primary/50 transition-colors min-h-[184px]"
  style={{ boxShadow: "var(--shadow)" }}>
  <div className="flex items-start gap-3">
    <Thumb />  {/* 42px アイコン */}
    ...
  </div>
```

```tsx
// After: カードヘッダーに 160px 画像エリア + カテゴリバッジ重ね
export function MarketCard({ market, variant = "card" }: { market: MarketWithOutcomes; variant?: "card" | "compact" }) {
  // ... 既存ロジック維持 ...

  if (variant === "card") {
    return (
      <div onClick={open}
        className="flex flex-col border border-border bg-surface rounded-[var(--radius)] cursor-pointer
          hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-lg
          transition-all duration-200 overflow-hidden group"
        style={{ boxShadow: "var(--shadow)" }}>

        {/* ヘッダー画像エリア */}
        <div className="relative h-[140px] w-full overflow-hidden"
          style={{ background: vis.image ? `url(${vis.image}) center/cover` : vis.tint }}>
          {!vis.image && (
            <div className="absolute inset-0 grid place-items-center text-white font-extrabold text-5xl opacity-30">
              {vis.glyph}
            </div>
          )}
          {/* カテゴリバッジ（左下オーバーレイ） */}
          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/50 text-white backdrop-blur-sm">
            {market.category?.name ?? "市場"}
          </span>
          {/* 二択のみ: 確率% を右下オーバーレイ */}
          {isBinary && (
            <div className="absolute bottom-2 right-2 flex flex-col items-end">
              <span className="text-[28px] font-extrabold leading-none text-white drop-shadow"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                {Math.round(yes * 100)}%
              </span>
              <span className="text-[10px] text-white/80">YES</span>
            </div>
          )}
        </div>

        {/* カード本体 */}
        <div className="flex flex-col gap-3 p-4">
          <h3 className="text-[14px] font-bold leading-snug line-clamp-2">{market.question}</h3>

          {isBinary ? (
            <div className="flex gap-2 mt-auto">
              <QuickBtn kind="pos" label={`YES ${toCents(yes)}`} onClick={(e) => { e.stopPropagation(); pick(0); }} big />
              <QuickBtn kind="neg" label={`NO ${toCents(1 - yes)}`} onClick={(e) => { e.stopPropagation(); pick(1); }} big />
            </div>
          ) : (
            <div className="space-y-1.5">
              {outcomes.map((o, i) => ({ label: o.label, p: prices[i] })).sort((a, b) => b.p - a.p).slice(0, 3).map((o) => (
                <div key={o.label} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate text-dim">{o.label}</span>
                  <div className="w-[74px] h-1.5 rounded bg-surface2 overflow-hidden">
                    <div className="h-full bg-primary rounded" style={{ width: `${o.p * 100}%` }} />
                  </div>
                  <span className="mono w-8 text-right">{toPct(o.p)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-dim pt-2 border-t border-border">
            <span>{market.category?.name ?? "—"}</span>
            <span>{timeRemaining(market.close_time)}</span>
          </div>
        </div>
      </div>
    );
  }
  // compact variant は現状維持 ...
}
```

**B) QuickBtn に確率% 追記**

```tsx
// Before
<QuickBtn kind="pos" label={`YES ${toCents(yes)}`} ... />

// After: ¢表示 + %表示を併記
<QuickBtn kind="pos" label="YES" sub={`${Math.round(yes * 100)}%`} ... />

function QuickBtn({ kind, label, sub, onClick, big }: { 
  kind: "pos" | "neg"; label: string; sub?: string;
  onClick: (e: React.MouseEvent) => void; big?: boolean 
}) {
  return (
    <button onClick={onClick}
      className={`flex-1 font-bold rounded-[10px] flex flex-col items-center justify-center
        ${big ? "py-2.5" : "py-2"}
        ${kind === "pos" ? "bg-pos-weak text-pos hover:bg-pos hover:text-white" : "bg-neg-weak text-neg hover:bg-neg hover:text-white"}
        transition-colors duration-150`}>
      <span className={big ? "text-[13.5px]" : "text-[13px]"}>{label}</span>
      {sub && <span className="text-[11px] opacity-80 font-semibold">{sub}</span>}
    </button>
  );
}
```

---

### 3.3 市場詳細ページ（チャート・取引UX）
**優先度: 高 ／ 工数: 中**

#### 課題
- チャートが `h-56` (224px) と小さく、詳細ページの核心なのに目立たない
- 価格変化（▲▼）の表示がない
- "Potential Return" 表示が分かりにくい

#### 改善案

**A) チャートエリア拡張 + 確率変化表示**

```tsx
// ProbabilityChart.tsx — h-56 → h-72 (288px) に拡張
// Before
<div className="h-56">

// After
<div className="h-72 md:h-80">
```

```tsx
// MarketDetailClient.tsx — 確率表示に変化量を追加
const prevPct = allHistory.length >= 2
  ? Math.round(allHistory[allHistory.length - 2]?.price * 100 ?? yesPct)
  : yesPct;
const delta = Math.round(yesPct) - prevPct;

// Before
<span className="mono text-[38px] font-bold leading-none" style={{ color: vis.tint }}>{Math.round(yesPct)}%</span>
<span className="text-[13px] text-dim ml-2">{outcomes[0]?.label} の確率</span>

// After
<div className="flex items-end gap-3">
  <span className="mono text-[42px] font-bold leading-none" style={{ color: vis.tint }}>
    {Math.round(yesPct)}%
  </span>
  <div className="pb-1.5">
    <span className={`text-[13px] font-bold ${delta >= 0 ? "text-pos" : "text-neg"}`}>
      {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}pt
    </span>
    <p className="text-[12px] text-dim">{outcomes[0]?.label} の確率</p>
  </div>
</div>
```

**B) トレードパネル — Potential Return を視覚的に強調**

```tsx
// TradePanel.tsx — リターン表示を強調ボックスに変更
// Before
<Row label="想定リターン" value={`+${formatPoints(shares * POINTS_PER_SHARE - preview.points)} pt`} pos />

// After
{side === "buy" && preview && (
  <div className="rounded-[10px] bg-pos-weak border border-pos/20 px-3 py-2.5 mt-1">
    <div className="flex justify-between items-center">
      <span className="text-[12px] font-bold text-pos">💰 的中時の受取</span>
      <span className="mono text-[16px] font-extrabold text-pos">
        +{formatPoints(shares * POINTS_PER_SHARE - preview.points)} pt
      </span>
    </div>
    <p className="text-[10.5px] text-dim mt-0.5">
      投資 {formatPoints(preview.points)} pt → 受取 {formatPoints(shares * POINTS_PER_SHARE)} pt
    </p>
  </div>
)}
```

**C) アウトカム選択ボタンに現在% 大型表示**

```tsx
// TradePanel.tsx — アウトカムボタンに確率を大きく
// Before
<button key={o.id} onClick={() => setPickIdx(i)}
  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] text-sm font-bold border-[1.5px] ${...}`}>
  <span>{o.label}</span><span className="mono">{toCents(prices[i])}</span>
</button>

// After
<button key={o.id} onClick={() => setPickIdx(i)}
  className={`w-full flex items-center justify-between px-3 py-3 rounded-[10px] border-[1.5px] transition-all duration-150
    ${i === pickIdx
      ? i === 0 ? "border-pos bg-pos-weak" : "border-neg bg-neg-weak"
      : "border-border bg-surface hover:border-primary/50"}`}>
  <div className="flex items-center gap-2">
    <span className="w-2 h-2 rounded-full shrink-0"
      style={{ background: i === 0 ? "var(--pos)" : i === 1 ? "var(--neg)" : "var(--primary)" }} />
    <span className="text-sm font-bold">{o.label}</span>
  </div>
  <div className="text-right">
    <div className="mono text-[18px] font-extrabold leading-none"
      style={{ color: i === 0 ? "var(--pos)" : i === 1 ? "var(--neg)" : "var(--primary)" }}>
      {Math.round(prices[i] * 100)}%
    </div>
    <div className="text-[11px] text-dim">{toCents(prices[i])}</div>
  </div>
</button>
```

---

### 3.4 ナビゲーション・ヘッダー
**優先度: 中 ／ 工数: 小**

#### 課題
- カテゴリナビがテキストピルのみで視覚的インパクトが弱い
- Polymarket は画像付きタイルで一目でカテゴリが分かる
- 検索バーが実際にはリンク（`<Link>`）であり、本物の検索UXでない

#### 改善案

**A) カテゴリタイルにカラーアクセント + グリフ追加**

```tsx
// MarketGrid.tsx — CatPill を視覚強化
// Before
function CatPill({ active, onClick, label, sub }: ...) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-start gap-px px-3.5 py-[7px] rounded-[10px] whitespace-nowrap border
        ${active ? "bg-primary text-white border-primary" : "bg-surface text-dim border-border hover:text-text"}`}>
      <span className="text-[13.5px] font-bold leading-none">{label}</span>
      <span className="text-[10px] uppercase opacity-70 leading-none">{sub}</span>
    </button>
  );
}

// After: カテゴリ色・グリフ付きタイル
const CATEGORY_STYLE: Record<string, { glyph: string; color: string }> = {
  politics: { glyph: "🏛", color: "#6366f1" },
  sports: { glyph: "⚽", color: "#10b981" },
  crypto: { glyph: "₿", color: "#f59e0b" },
  tech: { glyph: "🤖", color: "#8b5cf6" },
  entertainment: { glyph: "🎬", color: "#ec4899" },
  default: { glyph: "📊", color: "var(--primary)" },
};

function CatPill({ active, onClick, label, sub, slug }: { active: boolean; onClick: () => void; label: string; sub: string; slug?: string }) {
  const style = CATEGORY_STYLE[slug ?? ""] ?? CATEGORY_STYLE.default;
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-[10px] whitespace-nowrap border transition-all duration-150
        ${active
          ? "text-white border-transparent shadow-md scale-[1.03]"
          : "bg-surface text-dim border-border hover:text-text hover:border-primary/30"}`}
      style={active ? { background: style.color, borderColor: style.color } : {}}>
      <span className="text-base leading-none">{style.glyph}</span>
      <span className="text-[13.5px] font-bold leading-none">{label}</span>
    </button>
  );
}
```

**B) 検索を即時フィルタリングに（TopNav → MarketGrid 連携）**

```tsx
// TopNav.tsx — 検索バーをクリック可能なダイアログトリガーに変更
// 既存の Link を button + 検索ダイアログに置換（SearchDialog コンポーネント新設）
// 実装イメージのみ示す（工数: 中）
<button onClick={() => setSearchOpen(true)}
  className="w-full h-10 pl-9 pr-3.5 border border-border bg-surface2 rounded-[11px] text-sm text-faint text-left">
  市場を検索 / Search markets
</button>
{searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
```

---

### 3.5 モバイル対応
**優先度: 中 ／ 工数: 小**

#### 課題
- BottomNav の「管理」タブはユーザー向けに不要（admin のみ表示すべき）
- モバイルのカードグリッドが `auto-fill minmax(290px, 1fr)` のため 1列になりやすい
- ホームのヒーロー行が大きくスクロールが長い

#### 改善案

**A) BottomNav から管理タブを条件表示に**

```tsx
// BottomNav.tsx
const USER_TABS = [
  { href: "/", label: "マーケット", icon: (a: boolean) => <IconMarket active={a} /> },
  { href: "/leaderboard", label: "ランキング", icon: (a: boolean) => <IconRank active={a} /> },
  { href: "/mypage", label: "マイページ", icon: (a: boolean) => <IconUser active={a} /> },
];
// 管理タブは isAdmin の時のみ追加（TopNav と同様の isAdmin チェック）
```

**B) カードグリッドをモバイルで 2列に**

```tsx
// MarketGrid.tsx — モバイル2列対応
// Before
<div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))" }}>

// After: モバイル minmax を小さくして2列を促進
<div className="grid gap-3 sm:gap-4"
  style={{ gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))" }}>
```

**C) モバイルヒーロー非表示（ホームでスクロール短縮）**

```tsx
// MarketGrid.tsx — ヒーロー行をデスクトップのみ表示
<div className="hidden md:flex flex-wrap gap-4 mb-6">
  <Hero openCount={markets.length} catCount={categories.length} />
  <Trending list={trending} yesPct={yesPct} />
</div>
{/* モバイル用コンパクトヘッダー */}
<div className="md:hidden mb-4">
  <h1 className="text-lg font-extrabold">D-market</h1>
  <p className="text-xs text-dim">ポイントで読む、世界の確率</p>
</div>
```

---

### 3.6 タイポグラフィ・カラースキーム
**優先度: 低 ／ 工数: 小**

#### 課題
- D-market のダークモールデフォルトは Polymarket とは異なる（ブランド差として許容可）
- ただし価格表示 (¢) が日本ユーザーに直感的でない
- border-radius 20px は Polymarket より丸すぎる（ブランド差として保持可）

#### 改善案

**A) 価格表示を ¢ と % 併記に統一**

```tsx
// lib/format.ts に追加ユーティリティ
export function priceDisplay(p: number): string {
  const pct = Math.round(p * 100);
  return `${pct}%`;  // ユーザー向けは% に統一
}

// ¢ 表示は取引プロ向け（TradePanel の平均価格等）に限定
// カード・アウトカム行は % 表示に切替
```

**B) Live バッジ追加（Realtime 更新の視認性）**

```tsx
// MarketCard.tsx — リアルタイム価格更新中に Live バッジ
{market.status === "open" && (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
    style={{ background: "var(--pos)" }}>
    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
    LIVE
  </span>
)}
```

**C) globals.css に tabular-nums グローバル適用**

```css
/* globals.css — 数値要素全体の桁ブレ防止を強化 */
input[type="number"], .price, .pct, .volume {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

---

### 3.7 アニメーション・マイクロインタラクション
**優先度: 高 ／ 工数: 小**

#### 課題
- カードホバーが `hover:border-primary/50 transition-colors` のみ（リフト感なし）
- ボタン押下フィードバックがない
- 確率数値変化がスナップ切替（Realtime 更新時に数値がジャンプ）

#### 改善案

**A) カードリフトホバー（globals.css に共通クラス追加）**

```css
/* globals.css */
.card-hover {
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 24px -8px rgba(11, 31, 58, 0.18);
}
html.dark .card-hover:hover {
  box-shadow: 0 4px 24px -8px rgba(0, 0, 0, 0.5);
}
```

```tsx
// MarketCard.tsx — card-hover クラスを追加
<div onClick={open}
  className="card-hover flex flex-col border border-border bg-surface rounded-[var(--radius)] cursor-pointer
    hover:border-primary/40 overflow-hidden">
```

**B) ボタン押下アニメーション**

```css
/* globals.css */
.btn-press {
  transition: transform 0.1s ease, opacity 0.1s ease;
}
.btn-press:active {
  transform: scale(0.97);
  opacity: 0.85;
}
```

```tsx
// QuickBtn, TradePanel CTA ボタンに btn-press クラス追加
<button className="... btn-press">
```

**C) 価格変化カウントアップアニメーション**

```tsx
// hooks/useAnimatedValue.ts（新規作成）
import { useEffect, useRef, useState } from "react";

export function useAnimatedValue(target: number, duration = 600) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    if (prev.current === target) return;
    const start = prev.current;
    const diff = target - start;
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      setDisplay(Math.round(start + diff * ease));
      if (t < 1) requestAnimationFrame(tick);
      else prev.current = target;
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return display;
}

// MarketDetailClient.tsx での使用例
const animatedPct = useAnimatedValue(Math.round(yesPct));
// <span>... {animatedPct}% ...</span>
```

**D) Realtime 更新時のフラッシュハイライト**

```css
/* globals.css */
@keyframes priceFlash {
  0% { background-color: transparent; }
  30% { background-color: rgba(45, 212, 167, 0.3); }  /* --pos */
  100% { background-color: transparent; }
}
.price-flash {
  animation: priceFlash 0.8s ease;
}
```

```tsx
// MarketCard.tsx — Realtime 更新検知時に .price-flash を一時付与
const [flashing, setFlashing] = useState(false);
useEffect(() => {
  setFlashing(true);
  const t = setTimeout(() => setFlashing(false), 800);
  return () => clearTimeout(t);
}, [prices[0]]);  // 価格が変わったら発火

<span className={`mono text-[28px] font-extrabold ${flashing ? "price-flash" : ""}`}>
  {Math.round(yes * 100)}%
</span>
```

---

### 3.8 データ可視化
**優先度: 中 ／ 工数: 中**

#### 課題
- チャートは Recharts エリアのみで、カード上にはミニチャートがない
- 取引量（volume）が可視化されていない
- 注文板の深さ表現が粗い（3段階のみ）

#### 改善案

**A) カード用ミニスパークライン（SVG inline）**

```tsx
// components/Sparkline.tsx（新規）
export function Sparkline({ data, color, width = 80, height = 32 }: {
  data: number[]; color: string; width?: number; height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// MarketCard.tsx コンパクトレイアウトでの使用
// market.recentPrices が存在する場合にフッターに追加
```

**B) チャートに取引量バー（Volume bars）追加**

```tsx
// ProbabilityChart.tsx — ComposedChart + Bar で出来高を追加
import { Area, Bar, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// data に volume フィールドを追加（market_price_history にvolume列が必要）
const dataWithVolume = data.map((d) => ({ ...d, volume: d.volume ?? 0 }));

<ComposedChart data={dataWithVolume} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
  {/* 既存の XAxis/YAxis/Tooltip */}
  <Bar dataKey="volume" fill={color} opacity={0.15} yAxisId="vol" />
  <Area type="monotone" dataKey="pct" stroke={color} fill="url(#dmFill)" strokeWidth={2.4} />
</ComposedChart>
```

**C) 注文板の深さを 5 段階に拡張**

```tsx
// MarketTabs.tsx — OrderBook の levels を拡張
// Before
const levels = [0.03, 0.02, 0.01];

// After: 5段階で流動性を詳細表示
const levels = [0.05, 0.03, 0.02, 0.01, 0.005];
```

---

## 4. 優先実装ロードマップ

### MVP（〜2週間）— 最大インパクト 5項目

| # | 改善項目 | 対象ファイル | 工数 | 期待効果 |
|---|---------|------------|------|---------|
| MVP-1 | **市場カードに大判画像ヘッダー** | `MarketCard.tsx` | S (0.5日) | 視覚的インパクト★★★ |
| MVP-2 | **確率を % 大型表示（カード + 詳細）** | `MarketCard.tsx`, `MarketDetailClient.tsx` | S (0.5日) | 直感性★★★ |
| MVP-3 | **カードホバーリフトアニメーション** | `globals.css`, `MarketCard.tsx` | S (0.5日) | インタラクション品質★★★ |
| MVP-4 | **チャートエリア拡張（h-56→h-72）+ 変化量表示** | `ProbabilityChart.tsx`, `MarketDetailClient.tsx` | S (0.5日) | 詳細ページ訴求力★★ |
| MVP-5 | **カテゴリタイルにグリフ + 色アクセント** | `MarketGrid.tsx` | S (0.5日) | カテゴリ発見性★★ |

**MVP 合計: 約 2-3 日（フルタイム換算）**

---

### Phase 2（〜1ヶ月）— 体験品質向上

| # | 改善項目 | 対象ファイル | 工数 |
|---|---------|------------|------|
| P2-1 | ソートバー追加（Trending/Volume/Newest/Ending） | `MarketGrid.tsx` | M (1日) |
| P2-2 | アウトカム選択ボタンの% 大型表示 | `TradePanel.tsx` | S (0.5日) |
| P2-3 | Potential Return 強調ボックス | `TradePanel.tsx` | S (0.5日) |
| P2-4 | Realtime 価格フラッシュハイライト | `MarketCard.tsx`, `globals.css` | S (0.5日) |
| P2-5 | Live バッジ追加 | `MarketCard.tsx` | XS (0.25日) |
| P2-6 | BottomNav から管理タブを条件表示 | `BottomNav.tsx` | XS (0.25日) |
| P2-7 | モバイルカードグリッド 2列対応 | `MarketGrid.tsx` | XS (0.25日) |
| P2-8 | モバイルのヒーロー行コンパクト化 | `MarketGrid.tsx` | S (0.5日) |

**Phase 2 合計: 約 4-5 日**

---

### Phase 3（〜3ヶ月）— 高度なデータ体験

| # | 改善項目 | 対象ファイル | 工数 |
|---|---------|------------|------|
| P3-1 | カード用ミニスパークライン | `Sparkline.tsx` 新設 + `MarketCard.tsx` | M (2日) |
| P3-2 | チャートに取引量バー（Volume bars） | `ProbabilityChart.tsx`, DB スキーマ | L (3日) |
| P3-3 | 価格変化カウントアップアニメーション | `hooks/useAnimatedValue.ts` 新設 | M (1日) |
| P3-4 | 関連市場セクション（詳細ページ下部） | `MarketDetailClient.tsx`, `queries.ts` | M (2日) |
| P3-5 | 検索ダイアログ（コマンドパレット型） | `SearchDialog.tsx` 新設 | L (3日) |
| P3-6 | 注文板 5段階拡張 | `MarketTabs.tsx` | XS (0.25日) |

**Phase 3 合計: 約 11-12 日**

---

## 5. 参考資料

| リソース | 目的 |
|---------|------|
| https://polymarket.com | UI/UX 参照（本調査で取得） |
| `/mnt/e/dev/Cusor/dmarket/web/components/MarketCard.tsx` | 市場カード現状実装 |
| `/mnt/e/dev/Cusor/dmarket/web/components/MarketDetailClient.tsx` | 詳細ページ現状実装 |
| `/mnt/e/dev/Cusor/dmarket/web/components/TradePanel.tsx` | トレードパネル現状実装 |
| `/mnt/e/dev/Cusor/dmarket/web/components/MarketGrid.tsx` | ホームグリッド現状実装 |
| `/mnt/e/dev/Cusor/dmarket/web/app/globals.css` | デザイントークン定義 |
| `/mnt/e/dev/Cusor/dmarket/_design_handoff/design_handoff_dmarket/SPEC.md` | 機能仕様書 |
| `/mnt/e/dev/Cusor/dmarket/_design_handoff/design_handoff_dmarket/README.md` | デザイン handoff 詳細 |
| Recharts ドキュメント | チャート拡張実装 |
| Tailwind CSS v4 ドキュメント | ユーティリティ実装 |

---

> **注記**: 本提案書の TSX/CSS コード例は実装ガイドとして示したもの。実際の実装では既存コードベースのパターン（App Router, RSC, Supabase RPC, Tailwind v4 トークン）に準拠し、SPEC.md §0「賭博非該当の生命線」を厳守すること。

---

## 6. スマホバグ修正（2026-06-19 適用済み）

> TypeScript コンパイル: ✅ 通過（`npx tsc --noEmit`）

### Bug 1: コメント入力欄タップでキーボード拡大

| 項目 | 内容 |
|------|------|
| 現象 | iOS Safari でコメント入力欄をタップするとページ全体が自動ズーム |
| 原因 | `<input>` の font-size が 13.5px で、iOS の 16px 未満自動ズーム閾値を下回る |

修正（3ファイル）:

`web/components/MarketTabs.tsx` L171 — `text-[13.5px]` → `text-base md:text-[13.5px]`
`web/components/MarketGrid.tsx` L68 — `text-sm` → `text-base md:text-sm`
`web/app/layout.tsx` — viewport meta: `maximum-scale=1.0, user-scalable=no` 追加

### Bug 2: 画面遷移時に空カードの残像

| 項目 | 内容 |
|------|------|
| 現象 | 一覧⇔詳細の遷移時に灰色の空カードが一瞬チラつく |
| 原因 | `loading.tsx` の `animate-pulse` スケルトンが Suspense 境界で一瞬描画 |

修正（2ファイル）:

`web/app/loading.tsx` — `animate-pulse` 削除、`bg-surface/30 border/30` に半透明化
`web/app/market/[id]/loading.tsx` — スケルトン全廃、ミニマルスピナーに差替

### Bug 3: 取引するボタンがフッターエリアに被る

| 項目 | 内容 |
|------|------|
| 現象 | 下部スクロール時、取引ボタンが BottomNav の下に隠れる / Footer と競合 |
| 原因 | 取引バー z-index=30 が BottomNav z-index=40 より低い。Footer 下部余白不足 |

修正（2ファイル）:

`web/components/MarketDetailClient.tsx` L119 — `z-30` → `z-50`
`web/components/Footer.tsx` L7 — `mt-16` → `mt-16 mb-16 md:mb-0`

### Bug 4: スマホでの画面ガクつき

| 項目 | 内容 |
|------|------|
| 現象 | マーケット一覧スクロールがカクつく。Realtime 更新時に画面全体が重い |
| 原因 | ① Realtime が 1イベント毎に即 setState ② `lmsrPrices()` が useMemo なし ③ GPU アクセラレーションなし |

修正（4ファイル）:

`web/components/MarketCard.tsx` — `memo()` + `useMemo` で LMSR 計算をメモ化
`web/components/MarketGrid.tsx` — Realtime 更新を 100ms バッチ処理に
`web/components/MarketDetailClient.tsx` — 同上、詳細ページもバッチ処理化
`web/app/globals.css` — `will-change: transform` + `translateZ(0)` 追加

### 修正ファイル一覧

| # | ファイル | Bug |
|---|---------|-----|
| 1 | `web/components/MarketTabs.tsx` | Bug 1 |
| 2 | `web/components/MarketGrid.tsx` | Bug 1, 4 |
| 3 | `web/app/layout.tsx` | Bug 1 |
| 4 | `web/app/loading.tsx` | Bug 2 |
| 5 | `web/app/market/[id]/loading.tsx` | Bug 2 |
| 6 | `web/components/MarketDetailClient.tsx` | Bug 3, 4 |
| 7 | `web/components/Footer.tsx` | Bug 3 |
| 8 | `web/components/MarketCard.tsx` | Bug 4 |
| 9 | `web/app/globals.css` | Bug 4 |
