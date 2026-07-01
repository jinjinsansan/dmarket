// 的中シェア用の動的OGP画像。市場名＋受取pt＋ゴリラ（笑顔）。B案・緑グラデ。
// 日本語は Google Fonts のTTF部分集合を埋め込む（Satoriはwoff2不可）。
import { ImageResponse } from "next/og";

export const alt = "ゴリラ予想 — 的中！";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@800&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(api, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 5.1)" } })).text();
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?truetype['"]?\)/);
    if (!m) return null;
    return await (await fetch(m[1])).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string; pt: string }> }) {
  const { id, pt } = await params;
  const payout = Math.max(0, parseInt(pt, 10) || 0);
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let question = "ゴリラ予想";
  try {
    if (SB && KEY) {
      const res = await fetch(`${SB}/rest/v1/markets?id=eq.${id}&select=question`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store" });
      const rows = (await res.json()) as Array<{ question: string }>;
      if (rows?.[0]?.question) question = rows[0].question;
    }
  } catch { /* フォールバック */ }

  const domain = (process.env.NEXT_PUBLIC_SITE_URL || "https://g-yoso.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const fontText = question + "的中！受取ptあなたも予想に乗ろうゴリラ予想0123456789+, " + domain;
  const font = await loadFont(fontText);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "linear-gradient(135deg,#2FD18C,#0E8E58)", padding: "60px 68px", fontFamily: "NotoJP", position: "relative" }}>
        {/* 背景のゴリラ（笑顔・薄く） */}
        <svg width="440" height="440" viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: -20, top: 95, opacity: 0.16 }}>
          <circle cx="16" cy="50" r="9" /><circle cx="84" cy="50" r="9" />
          <path d="M50 14 C30 14 18 27 18 47 C18 71 32 88 50 88 C68 88 82 71 82 47 C82 27 70 14 50 14 Z" />
          <path d="M30 46 Q50 38 70 46" />
          <path d="M35 53 Q40 48 45 53" /><path d="M55 53 Q60 48 65 53" />
          <path d="M40 80 Q50 90 60 80" />
        </svg>

        {/* ヘッダー */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 58, height: 58, borderRadius: 16, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="16" cy="50" r="9" /><circle cx="84" cy="50" r="9" />
              <path d="M50 14 C30 14 18 27 18 47 C18 71 32 88 50 88 C68 88 82 71 82 47 C82 27 70 14 50 14 Z" />
              <path d="M30 45 Q50 37 70 45" />
              <circle cx="40" cy="52.5" r="3" fill="#fff" stroke="none" /><circle cx="60" cy="52.5" r="3" fill="#fff" stroke="none" />
              <path d="M39 64 Q50 59 61 64 Q66 70 60 75 Q50 79 40 75 Q34 70 39 64 Z" />
            </svg>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#fff" }}>ゴリラ予想</div>
        </div>

        {/* 本文：的中！＋質問 */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 820 }}>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 800, color: "#fff", lineHeight: 1 }}>的中！</div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "rgba(255,255,255,0.95)", lineHeight: 1.35, marginTop: 18 }}>{question}</div>
        </div>

        {/* フッター：受取ptピル＋タグライン */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 800, color: "#fff", background: "rgba(255,255,255,0.18)", padding: "14px 30px", borderRadius: 16, alignSelf: "flex-start" }}>
            受取 +{payout.toLocaleString()} pt
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "rgba(255,255,255,0.85)" }}>あなたも予想に乗ろう ・ {domain}</div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "NotoJP", data: font, weight: 800 as const, style: "normal" as const }] : [] }
  );
}
