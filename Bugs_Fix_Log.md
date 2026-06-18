# D-market スマホバグ修正仕様書

> 作成日: 2026-06-19
> ステータス: 修正適用済み（検証待ち）
> TypeScript コンパイル: ✅ 通過

---

## 概要

D-market をスマートフォン（iOS Safari / Android Chrome）で使った際に発生する 4 件のバグを修正する。

---

## Bug 1: コメント入力欄タップでキーボード拡大

### 現象
- コメント欄（市場詳細 > コメントタブ）をタップすると、iOS Safari がページ全体を自動ズームする
- Android Chrome でも同様の拡大が発生する場合がある

### 原因
`<input>` の `font-size` が **16px 未満**（`text-[13.5px]` = 13.5px）のため、iOS Safari の「自動ズーム」機能が発動。iOS Safari はフォーカス時にフォントサイズが 16px 未満の入力欄を拡大する仕様。

### 修正内容（3ファイル）

#### 1-1. `web/components/MarketTabs.tsx` L171
```diff
- className="flex-1 h-10 px-3 border border-border bg-surface2 rounded-[10px] text-[13.5px] outline-none focus:border-primary"
+ className="flex-1 h-10 px-3 border border-border bg-surface2 rounded-[10px] text-base md:text-[13.5px] outline-none focus:border-primary"
```
→ モバイルでは 16px（`text-base`）、デスクトップでは 13.5px を維持

#### 1-2. `web/components/MarketGrid.tsx` L68
```diff
- className="h-9 px-3 rounded-[10px] border border-border bg-surface2 text-sm outline-none focus:border-primary w-32 sm:w-44"
+ className="h-9 px-3 rounded-[10px] border border-border bg-surface2 text-base md:text-sm outline-none focus:border-primary w-32 sm:w-44"
```
→ 検索入力欄も同様に対応

#### 1-3. `web/app/layout.tsx` L13-15
```diff
export const metadata: Metadata = {
  title: "D-market — ポイントで読む、世界の確率。",
  description: "換金不可ポイントで楽しむ予測市場。換金なし、勝つのは称号とランキングだけ。",
+ viewport: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
};
```
→ viewport メタタグで全ページの自動ズームを防止

---

## Bug 2: 画面遷移時に空カードの残像が表示される

### 現象
- マーケット一覧 → 詳細、または詳細 → 一覧に遷移する際、一瞬「空のカード（灰色の四角）」がチラつく
- ローディング中のスケルトンが実カードとサイズ不一致で違和感がある

### 原因
`loading.tsx` が `animate-pulse` + `border` + `bg-surface` で目立つスケルトンを表示し、画面遷移の瞬間にこれが描画される。
Next.js App Router の Suspense 境界で loading.tsx が一瞬表示されるのが根本原因。

### 修正内容（2ファイル）

#### 2-1. `web/app/loading.tsx`（マーケット一覧のローディング）
```diff
export default function Loading() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
-       <div key={i} className="h-40 rounded-[var(--radius)] border border-border bg-surface animate-pulse" />
+       <div key={i} className="h-40 rounded-[var(--radius)] border border-border/30 bg-surface/30" />
      ))}
    </div>
  );
}
```
→ `animate-pulse` 削除、透明度を下げて残像感を低減

#### 2-2. `web/app/market/[id]/loading.tsx`（詳細ページのローディング）
```diff
export default function Loading() {
  return (
-   <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
-     <div className="space-y-4">
-       <div className="h-6 w-2/3 rounded bg-surface animate-pulse" />
-       <div className="h-56 rounded-[var(--radius)] border border-border bg-surface animate-pulse" />
-     </div>
-     <div className="h-64 rounded-[var(--radius)] border border-border bg-surface animate-pulse" />
-   </div>
+   <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-20 flex items-center justify-center">
+     <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
+   </div>
  );
}
```
→ スケルトン全廃。シンプルなスピナーのみに変更

---

## Bug 3: 取引するボタンがフッターエリアに被る

### 現象
- 市場詳細ページで下部にスクロールすると、「取引する」固定ボタンが BottomNav の下に潜り込む
- フッター（Footer）が下部で取引ボタンと競合する

### 原因
1. 取引バーの z-index が `z-30` で、BottomNav の `z-40` より低い → BottomNav の後ろに隠れる
2. Footer が `mt-16` のみで、モバイルでは BottomNav に隠れる下部領域のパディングがない

### 修正内容（2ファイル）

#### 3-1. `web/components/MarketDetailClient.tsx` L119
```diff
- <div className="lg:hidden fixed left-0 right-0 bottom-16 z-30 bg-surface/95 backdrop-blur border-t border-border px-4 py-3">
+ <div className="lg:hidden fixed left-0 right-0 bottom-16 z-50 bg-surface/95 backdrop-blur border-t border-border px-4 py-3">
```
→ z-index を BottomNav（z-40）より上に

#### 3-2. `web/components/Footer.tsx` L7
```diff
- <footer className="border-t border-border mt-16">
+ <footer className="border-t border-border mt-16 mb-16 md:mb-0">
```
→ モバイルでは BottomNav の高さ分（64px）の下部余白を確保。デスクトップでは影響なし

---

## Bug 4: スマホでの画面ガクつき（スクロール時のカクつき・遅延）

### 現象
- マーケット一覧をスクロールするとカクつく
- 確率が変動するたびに画面全体が重くなる
- 特に Realtime 更新が頻繁な市場で顕著

### 原因（複合的要因）

#### 4-A. 高頻度な state 更新
Realtime 購読（Supabase）が `outcomes.q` の UPDATE を受け取るたびに即座に `setMarkets()` / `setOutcomes()` を呼び、全カードの再レンダーを引き起こしていた。活発な市場では 1 秒間に数十回の更新が発生。

#### 4-B. 高コスト計算の非メモ化
`MarketCard.tsx` の `lmsrPrices()` は `Math.exp` / `Math.log` を含む重い計算だが、`useMemo` なしで毎レンダー再計算されていた。

#### 4-C. GPU アクセラレーションなし
CSS アニメーション・固定配置要素に `will-change: transform` や `translateZ(0)` がなく、GPU 合成レイヤーに昇格されていなかった。

### 修正内容（4ファイル）

#### 4-1. `web/components/MarketCard.tsx` — メモ化
```diff
- import { useRouter } from "next/navigation";
+ import { useMemo, memo } from "react";
+ import { useRouter } from "next/navigation";

- export function MarketCard({ market, variant = "card" }: { ... }) {
+ export const MarketCard = memo(function MarketCard({ market, variant = "card" }: { ... }) {
    const router = useRouter();
-   const outcomes = [...market.outcomes].sort((a, b) => a.display_order - b.display_order);
-   const prices = lmsrPrices(outcomes.map((o) => o.q), market.b_param);
+   const outcomes = useMemo(() => [...market.outcomes].sort((a, b) => a.display_order - b.display_order), [market.outcomes]);
+   const prices = useMemo(() => lmsrPrices(outcomes.map((o) => o.q), market.b_param), [outcomes, market.b_param]);
    ...
- }
+ });
```
→ `React.memo` で props 未変化のカードは再レンダースキップ
→ `useMemo` で LMSR 計算結果をキャッシュ

#### 4-2. `web/components/MarketGrid.tsx` — Realtime バッチ処理
```diff
useEffect(() => {
    const sb = createClient();
+   let pending: Record<string, { market_id: string; id: string; q: number }> = {};
+   let timer: ReturnType<typeof setTimeout> | null = null;
+
    const ch = sb.channel("markets-outcomes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "outcomes" }, (payload) => {
        const n = payload.new as { id: string; market_id: string; q: number };
-       setMarkets((prev) => prev.map((m) => m.id === n.market_id
-         ? { ...m, outcomes: m.outcomes.map((o) => (o.id === n.id ? { ...o, q: n.q } : o)) } : m));
+       pending[n.id] = n;
+       if (!timer) {
+         timer = setTimeout(() => {
+           const updates = Object.values(pending);
+           pending = {};
+           timer = null;
+           if (updates.length === 0) return;
+           setMarkets((prev) => prev.map((m) => {
+             const u = updates.find((up) => up.market_id === m.id);
+             return u ? { ...m, outcomes: m.outcomes.map((o) => (o.id === u.id ? { ...o, q: u.q } : o)) } : m;
+           }));
+         }, 100);
+       }
      }).subscribe();
-   return () => { sb.removeChannel(ch); };
+   return () => { sb.removeChannel(ch); if (timer) clearTimeout(timer); };
  }, []);
```
→ 100ms 以内の全更新を1回の `setMarkets()` に集約

#### 4-3. `web/components/MarketDetailClient.tsx` — Realtime バッチ処理
```diff
useEffect(() => {
    const sb = createClient();
+   let pendingQ: Record<string, { id: string; q: number }> = {};
+   let pendingPts: PricePoint[] = [];
+   let timer: ReturnType<typeof setTimeout> | null = null;
+
    const ch = sb.channel(`market-${market.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "outcomes", filter: `market_id=eq.${market.id}` },
-       (p) => { const n = p.new as { id: string; q: number }; setOutcomes((prev) => prev.map(...)); })
+       (p) => { const n = p.new as { id: string; q: number }; pendingQ[n.id] = n; scheduleFlush(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "market_price_history", filter: `market_id=eq.${market.id}` },
-       (p) => setLivePoints((prev) => [...prev, p.new as PricePoint]))
+       (p) => { pendingPts.push(p.new as PricePoint); scheduleFlush(); })
      .subscribe();
-   return () => { sb.removeChannel(ch); };
+
+   function scheduleFlush() {
+     if (!timer) {
+       timer = setTimeout(() => {
+         const qUpdates = Object.values(pendingQ);
+         const ptUpdates = pendingPts;
+         pendingQ = {};
+         pendingPts = [];
+         timer = null;
+         if (qUpdates.length > 0) setOutcomes((prev) => prev.map((o) => { const u = qUpdates.find((up) => up.id === o.id); return u ? { ...o, q: u.q } : o; }));
+         if (ptUpdates.length > 0) setLivePoints((prev) => [...prev, ...ptUpdates]);
+       }, 100);
+     }
+   }
+   return () => { sb.removeChannel(ch); if (timer) clearTimeout(timer); };
  }, [market.id]);
```
→ 詳細ページの Realtime 更新もバッチ処理化

#### 4-4. `web/app/globals.css` — GPU アクセラレーション
```diff
.scrollx::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 6px;
}

+ /* GPU アクセラレーション（モバイルのガクつき防止） */
+ .card-hover,
+ .fixed,
+ .sticky,
+ .dm-in,
+ .dm-sheet,
+ .dm-fade,
+ button:active {
+   will-change: transform;
+   transform: translateZ(0);
+ }

@keyframes dmIn {
```
→ 固定配置・アニメーション要素を GPU 合成レイヤーに強制昇格

---

## 修正済みファイル一覧

| # | ファイル | バグ番号 |
|---|---------|---------|
| 1 | `web/components/MarketTabs.tsx` | Bug 1 |
| 2 | `web/components/MarketGrid.tsx` | Bug 1, Bug 4 |
| 3 | `web/app/layout.tsx` | Bug 1 |
| 4 | `web/app/loading.tsx` | Bug 2 |
| 5 | `web/app/market/[id]/loading.tsx` | Bug 2 |
| 6 | `web/components/MarketDetailClient.tsx` | Bug 3, Bug 4 |
| 7 | `web/components/Footer.tsx` | Bug 3 |
| 8 | `web/components/MarketCard.tsx` | Bug 4 |
| 9 | `web/app/globals.css` | Bug 4 |

---

## 検証手順

### Bug 1: キーボード拡大
1. iOS Safari で市場詳細 > コメントタブを開く
2. コメント入力欄をタップ
3. **期待**: ページが拡大されず、キーボードのみ表示される

### Bug 2: ローディング残像
1. マーケット一覧と詳細を複数回往復する
2. **期待**: 遷移時に空カードのチラつきがない（スピナーのみ）

### Bug 3: 取引ボタン被り
1. 市場詳細で下部までスクロール
2. **期待**: 「取引する」ボタンが BottomNav の上に正しく表示される
3. Footer までスクロールしてもボタンが Footer に被らない

### Bug 4: ガクつき
1. マーケット一覧をスクロールしながら、Realtime 更新が走るのを待つ
2. **期待**: スクロールがスムーズ。価格更新時もカクつかない
3. Chrome DevTools → Performance タブで FPS を確認（30fps 以上を維持）

---

## 注意事項

- 本修正は TypeScript コンパイル通過済み（`npx tsc --noEmit` エラーなし）
- 全修正は既存の `specs/` 仕様書・`_design_handoff/` デザイン仕様に準拠
- SPEC「賭博非該当の生命線」に抵触する変更は含まれていない
