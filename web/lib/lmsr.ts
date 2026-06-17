// クライアントLMSR（プレビュー専用・SPEC-05 §8）。
// DB(SPEC-02 §2)と同一の数式（log-sum-exp 安定版）。確定値は必ずRPC戻り値を使う。
import { POINTS_PER_SHARE } from "./constants";

const UNDERFLOW = -700; // exp の負側アンダーフロー閾値（DBの safe_exp と一致）

function safeExp(x: number): number {
  return x < UNDERFLOW ? 0 : Math.exp(x);
}

export function lmsrCost(q: number[], b: number): number {
  const m = Math.max(...q.map((x) => x / b));
  const s = q.reduce((acc, x) => acc + safeExp(x / b - m), 0);
  return b * (m + Math.log(s));
}

export function lmsrPrice(q: number[], b: number, k: number): number {
  const m = Math.max(...q.map((x) => x / b));
  const s = q.reduce((acc, x) => acc + safeExp(x / b - m), 0);
  return safeExp(q[k] / b - m) / s;
}

// 全アウトカムの価格ベクトル
export function lmsrPrices(q: number[], b: number): number[] {
  return q.map((_, k) => lmsrPrice(q, b, k));
}

// 注文プレビュー（買い切り上げ / 売り切り捨て）。"予想"であり実約定は端数でズレうる。
export function buyCostPreview(q: number[], b: number, k: number, shares: number): number {
  const q2 = q.slice();
  q2[k] += shares;
  return Math.ceil((lmsrCost(q2, b) - lmsrCost(q, b)) * POINTS_PER_SHARE);
}

export function sellRecvPreview(q: number[], b: number, k: number, shares: number): number {
  const q2 = q.slice();
  q2[k] -= shares;
  return Math.floor((lmsrCost(q, b) - lmsrCost(q2, b)) * POINTS_PER_SHARE);
}
