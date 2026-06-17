// マーケットサムネのプレースホルダ（tint＋漢字/記号 glyph）。
// 本番では markets.image_url の実画像に差し替え推奨（handoff の方針）。
const TINTS = ["#0284c7", "#f59e0b", "#10b981", "#14b8a6", "#f43f5e", "#0e9488", "#8b5cf6", "#ec4899", "#6366f1"];

// カテゴリ slug → glyph / 専用tint
const BY_SLUG: Record<string, { glyph: string; tint?: string }> = {
  keiba: { glyph: "馬", tint: "#0e9488" },
  fx: { glyph: "¥", tint: "#f59e0b" },
  crypto: { glyph: "₿", tint: "#f59e0b" },
  news: { glyph: "政", tint: "#0284c7" },
  sports: { glyph: "球", tint: "#10b981" },
  weather: { glyph: "天", tint: "#14b8a6" },
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function marketVisual(opts: { id: string; slug?: string | null; image_url?: string | null }): {
  tint: string;
  glyph: string;
  image?: string;
} {
  if (opts.image_url) return { tint: "#0284c7", glyph: "", image: opts.image_url };
  const byslug = opts.slug ? BY_SLUG[opts.slug] : undefined;
  const tint = byslug?.tint ?? TINTS[hash(opts.id) % TINTS.length];
  const glyph = byslug?.glyph ?? "◆";
  return { tint, glyph };
}
