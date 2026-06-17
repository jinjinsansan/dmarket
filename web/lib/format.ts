// 表示整形（SPEC-05 §2・§9）。数値・確率・損益は等幅・色分けで読みやすく。
export function formatPoints(n: number): string {
  return n.toLocaleString("ja-JP");
}

// 確率(0..1) → ¢表記（×100）
export function toCents(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

export function toPct(price: number): string {
  return `${Math.round(price * 100)}%`;
}

// 締切までの残り（簡易・日本語）
export function timeRemaining(closeIso: string): string {
  const ms = new Date(closeIso).getTime() - Date.now();
  if (ms <= 0) return "締切";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `残り${min}分`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `残り${hr}時間`;
  return `残り${Math.floor(hr / 24)}日`;
}

// 損益の符号付き表記＋色クラス（--pos / --neg）
export function pnlText(n: number): { text: string; cls: string } {
  const sign = n > 0 ? "+" : "";
  const cls = n > 0 ? "text-[var(--pos)]" : n < 0 ? "text-[var(--neg)]" : "text-[var(--brand-text-dim)]";
  return { text: `${sign}${n.toLocaleString("ja-JP")}`, cls };
}

export function statusLabel(status: string): string {
  switch (status) {
    case "open": return "取引中";
    case "closed": return "解決待ち";
    case "resolving": return "解決処理中";
    case "resolved": return "解決済み";
    case "void": return "中止";
    default: return status;
  }
}
