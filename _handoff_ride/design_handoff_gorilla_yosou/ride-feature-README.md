# 乗っかり（ride 1%）UI — 実装メモ

「乗っかり」を可視化する3つのUI。既存ハンドオフ（B案・グレープ＋バナナ／温かいオフホワイト／ゴリラ線画）に完全準拠。新規の色・フォントは増やしていません。すべて `var(--…)` トークンと `GorillaFace.tsx` を使用。

## 機能の前提（コピーの根拠）
- 「乗っかり」= ユーザーが市場の【シェア】で広めたリンク（`?ref=自分のコード`）から友達が市場ページに来て予想し、的中すると、友達の的中払戻しの【1%】がシェア元へボーナスで入る。
- ボーナスは**新規発行**。**友達の取り分は1%も減らない**（全UIで必ず明記）。
- もらえるのは**換金不可・無償の参加ポイント**（「賞金」「コイン」ではない／賭けではない）。
- 帰属は「市場×乗った人」で1人＝最初に乗ったリンクが有効。

---

## A. RideBanner（帰属バナー）← 最重要
- **ファイル**: `RideBanner.tsx`
- **配置**: 市場詳細 `/market/[id]` の**質問見出しの直下**。
- **出し分け**: `?ref=` 経由で来訪し、その紹介者が**実在する他ユーザー**のときだけ表示。閉じる(×)でそのセッション内は再表示しない（`sessionStorage`）。
- **Props**: `marketId: string` / `referrerName?: string | null`
- **状態**: ① `referrerName` あり＝通常 ② `null`＝フォールバック（「シェアから来ました！」）。モバイル/デスクトップは文章量で自然に折返し（同一コンポーネント）。
- **確定コピー**:
  - 通常：「**{name}**さんのシェアから来ました！あなたが的中すると、{name}さんにも**応援ボーナス（+1%）**が入ります。 あなたの取り分は減りません。」
  - フォールバック：「シェアから来ました！あなたが的中すると、シェアした人に**応援ボーナス（+1%）**が入ります。 あなたの取り分は減りません。」
- **見た目**: `--primary-weak` 地＋`#D9C7F7` 境界の控えめバナー。先頭に `GorillaFace expr="win" color="var(--primary)"`。
```tsx
<RideBanner marketId={market.id} referrerName={ride?.referrerName ?? null} />
```

## B. RideStats（乗っかり実績）
- **ファイル**: `RideStats.tsx`
- **配置**: 「貯める」/earn の乗っかりカード内（`variant="card"`）／マイページ（`variant="compact"`）。両方に置いてOK。
- **データ**（`my_ride_stats()` 等のRPC前提）: `riderCount`（乗ってくれた人数）/ `totalBonus`（応援ボーナス累計pt）/ `recent?`（直近の発生：任意）。
- **状態**: card で `riderCount===0` のとき**空状態**（`GorillaFace expr="neutral"`＋「まだ乗っかりはありません。市場をシェアして広めよう🦍」＋シェアCTA）。
- **Props**: `riderCount: number` / `totalBonus: number` / `recent?: {marketTitle, bonusPt, agoLabel} | null` / `variant?: "card"|"compact"` / `onShare?: () => void`
- 数値は `.mono`。「換金不可・無償／取り分は減らない」注記を card 下部に表示。
```tsx
<RideStats riderCount={s.riderCount} totalBonus={s.totalBonus} recent={s.recent} onShare={openShare} />
<RideStats variant="compact" riderCount={s.riderCount} totalBonus={s.totalBonus} />
```

## C. RideNudge（取引時ナッジ）
- **ファイル**: `RideNudge.tsx`
- **配置**: 市場詳細の**トレードパネル内・CTAボタンの直前**。
- **出し分け**: `?ref=` 経由で**乗っかり中**（`rideActive`）かつシェア元名があるときだけ。
- **Props**: `referrerName?: string | null` / `variant?: "chip"|"caption"`
- **見た目**: `chip`＝`--pos-weak` の小チップ＋`GorillaFace expr="win" color="var(--pos)"`。`caption`＝ボタン直下の最小テキスト。
- **確定コピー**: 「的中すると **{name}** に **+1%** の応援ボーナス」（caption は「的中で {name} に +1% 応援ボーナス」）。
```tsx
{ride?.active && <RideNudge referrerName={ride.referrerName} />}
```

---

## 実装側で用意するデータ（デザインはこれが来る前提）
| UI | 必要データ |
|---|---|
| A / C | `record_ride` がシェア元の**表示名**を返す（または別途取得）。「**乗っかり中フラグ** ＋ **シェア元名**」を渡せる |
| B | `my_ride_stats()` 的RPCで `{ rider_count, total_bonus, recent? }` |

## トーン厳守
- 「賭ける」表現は使わない（「予想する／乗る」）。絵文字は控えめ（🦍を時々）。
- 必ず含める：「**換金不可の参加ポイント**」「**友達の取り分は減りません**」。
- 主語：A＝乗る人目線／B＝シェアした人目線／C＝乗っている本人へ「あなたが当てると相手に入る」。
- 直値の色・フォント禁止。`var(--…)` と `GorillaFace` のみ。

## ファイル
- `RideBanner.tsx` / `RideStats.tsx` / `RideNudge.tsx`（`GorillaFace.tsx` に依存）
- reference: `reference/proposal.html` の「11 — 乗っかり（ride 1%）」に A/B/C＋各状態（通常/フォールバック/モバイル/空/コンパクト/キャプション）を掲載。
