# マイページ改善 — 実装メモ

## 現状の評価
`/mypage` は **B案トークン・コンポーネントを正しく使用済み**（StatCard・グラデアバター・RideStats・称号タイルなど）。ただし、合言葉／市場づくり／乗っかり／景品配送／配送先／称号／保有／コイン／履歴…と**同じ白ボーダーカードが等間隔で縦積み**になっており、視覚的な抑揚・優先順位が無く「単調」に見える。＝デザイン未適用ではなく**情報設計（階層）の問題**。

## 方針：上半分を「見る」ゾーンに、下半分を「操作」ゾーンに
**識別 → お金 → 成績 → 称号** の順に重みを変え、上部にヒーローを作る。色・トークンは変えない。

1. **プロフィールヒーロー**（グレープ地）… 一番上で"自分"を主役化。白カードの平坦さを解消。
2. **2大通貨ウォレット**… 参加pt／ゴリラコインを大きな数字＋アイコンで並置（最も知りたい情報を最上段）。
3. **副次スタットを軽量化**… 評価額/損益/的中率/連勝は小さめチップへ格下げ（情報量は維持）。
4. **セクション見出しにアクセント**… バナナの縦バーで白カードの連続を分節。
5. **称号は横スクロールの見せ場**に（グリッドの単調さ解消）。
6. フォーム系（合言葉/市場づくり/配送先/景品配送/履歴）は**下半分にグルーピング**。

## 実装
`MyPageHero.tsx`（提供）を `/mypage` 冒頭の「プロフィールカード＋ステータスgrid」と差し替え。`BadgeShowcase` は既存 `badges` をそのまま渡せる。

```tsx
import { MyPageHero, BadgeShowcase } from "@/components/MyPageHero";

<MyPageHero
  name={name}
  title={title}                 // 既存の title 変数
  streak={stats?.current_streak ?? 0}
  hitRate={hitRate}             // 既存の hitRate
  avatarUrl={avatarUrl}
  balance={balance}
  prizeBalance={prizeBalance}
  positionsValue={holdValue}
  pnl={unrealized}
  onClaim={claim}
  onEdit={() => setEditProfile(true)}
/>
// …（合言葉・市場づくり・乗っかり・景品配送・配送先 は下に続ける）
<BadgeShowcase badges={badges} />
```

- 既存の `editProfile` 展開フォーム・`claim()`・各RPCはそのまま流用（ヒーローの「編集」「デイリー受取」から呼ぶ）。
- レスポンシブ：ヒーローは `flex-wrap`、ウォレット/スタットは grid。モバイルでウォレットを1列にしたい場合は `gridTemplateColumns` をブレークポイントで `1fr` に。
- 依存：`GorillaFace.tsx`、`globals.css` の `.hide-scrollbar`（既存）。

## トークン厳守
直値の色・フォントは増やさない。ヒーローの濃いグレープは既存 `--hero-grad` 相当（`#2A1B4D→#5a37a8`）。バナナは `--accent2`。数値は `.mono`。

## reference
`reference/proposal.html`「12 — マイページ改善」に改善版（ヒーロー＋ウォレット＋スタット＋称号）と変更点リストを掲載。
