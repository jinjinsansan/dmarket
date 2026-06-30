// 紹介コードの共有ユーティリティ。ログイン時に取得したコードを localStorage に保持し、
// シェアURLに ?ref=CODE を自動付与する（市場カード・貯める・市場詳細で共通利用）。
const KEY = "gp-ref";

export function getRefCode(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setRefCode(code: string | null | undefined) {
  try {
    if (code) localStorage.setItem(KEY, code);
  } catch { /* noop */ }
}

// URL に紹介コードを付与（既にクエリがあれば & で連結）
export function withRef(url: string): string {
  const c = getRefCode();
  if (!c) return url;
  return url + (url.includes("?") ? "&" : "?") + "ref=" + encodeURIComponent(c);
}
