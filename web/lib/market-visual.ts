// マーケットサムネのプレースホルダ（tint＋漢字/記号 glyph）。
// 本番では markets.image_url の実画像に差し替え推奨（handoff の方針）。
// ゴリラ予想 B案（グレープ・ポップ）調和パレット。YES緑(#15B877)・NO赤(#F2604C)と紛れる純緑/純赤は除外。
const TINTS = ["#7b46e3", "#f4be1f", "#e08a2b", "#3fa8b5", "#e0608a", "#6e8bd8", "#8c6fe0", "#d98c5f", "#5bae8a"];

// カテゴリ slug → glyph / 専用tint
const BY_SLUG: Record<string, { glyph: string; tint?: string }> = {
  keiba: { glyph: "馬", tint: "#3fa8b5" },
  fx: { glyph: "¥", tint: "#f4be1f" },
  crypto: { glyph: "₿", tint: "#e08a2b" },
  news: { glyph: "政", tint: "#7b46e3" },
  sports: { glyph: "球", tint: "#6e8bd8" },
  weather: { glyph: "天", tint: "#5bae8a" },
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
  if (opts.image_url) return { tint: "#7b46e3", glyph: "", image: opts.image_url };
  const byslug = opts.slug ? BY_SLUG[opts.slug] : undefined;
  const tint = byslug?.tint ?? TINTS[hash(opts.id) % TINTS.length];
  const glyph = byslug?.glyph ?? "◆";
  return { tint, glyph };
}
