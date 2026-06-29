// 市場ごとの動的OGP画像（X/SNSシェア用）。題名＋現在のYES%＋ゴリラ予想ブランド。
// 日本語は Google Fonts から該当テキストのTTF部分集合を取得して埋め込む（Satoriはwoff2不可）。
import { ImageResponse } from "next/og";
import { lmsrPrice } from "@/lib/lmsr";

export const alt = "ゴリラ予想 — 予測市場";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// B案パレット（リテラル指定。SatoriはCSS変数を解さない）
const C = {
  bg: "#FAF6EF", surface: "#FFFFFF", text: "#2A2018", dim: "#8B8073", faint: "#C2B7A7",
  border: "#EBE3D6", primary: "#7B46E3", primaryWeak: "#EFE8FC", banana: "#F4BE1F",
  pos: "#15B877", posWeak: "#E5F7EF", neg: "#F2604C", negWeak: "#FCEAE6",
};

async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@800&text=${encodeURIComponent(text)}`;
    // 旧UAにするとGoogleがttf(truetype)を返す（Satoriはttf/otf/woffのみ対応）
    const css = await (await fetch(api, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 5.1)" } })).text();
    const m = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?truetype['"]?\)/);
    if (!m) return null;
    return await (await fetch(m[1])).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let question = "ゴリラ予想";
  let category = "";
  let yesPct = 50;
  try {
    if (SB && KEY) {
      const res = await fetch(
        `${SB}/rest/v1/markets?id=eq.${id}&select=question,b_param,categories(name),outcomes(q,display_order)`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store" }
      );
      const rows = (await res.json()) as Array<{ question: string; b_param: number; categories?: { name?: string } | null; outcomes: { q: number; display_order: number }[] }>;
      const m = rows?.[0];
      if (m) {
        question = m.question;
        category = m.categories?.name ?? "";
        const os = [...(m.outcomes ?? [])].sort((a, b) => a.display_order - b.display_order);
        if (os.length >= 2) yesPct = Math.round(lmsrPrice(os.map((o) => o.q), m.b_param, 0) * 100);
      }
    }
  } catch { /* フォールバック表示 */ }

  const fontText = question + category + "ゴリラ予想が「起きる」と予想YESNO換金不可ポイントで遊ぶ予測市場0123456789%・";
  const font = await loadFont(fontText);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.bg, padding: "64px 72px", fontFamily: "NotoJP" }}>
        {/* ヘッダー */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="44" height="44" viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="16" cy="50" r="9" /><circle cx="84" cy="50" r="9" />
              <path d="M50 14 C30 14 18 27 18 47 C18 71 32 88 50 88 C68 88 82 71 82 47 C82 27 70 14 50 14 Z" />
              <path d="M30 45 Q50 37 70 45" />
              <circle cx="40" cy="52.5" r="3" fill="#fff" stroke="none" /><circle cx="60" cy="52.5" r="3" fill="#fff" stroke="none" />
              <path d="M39 64 Q50 59 61 64 Q66 70 60 75 Q50 79 40 75 Q34 70 39 64 Z" />
            </svg>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, color: C.text }}>ゴリラ予想</div>
          {category ? (
            <div style={{ marginLeft: 8, fontSize: 22, fontWeight: 800, color: C.primary, background: C.primaryWeak, padding: "8px 20px", borderRadius: 999 }}>{category}</div>
          ) : null}
        </div>

        {/* 本文：質問＋大きなYES% */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40 }}>
          <div style={{ display: "flex", maxWidth: 720, fontSize: 52, fontWeight: 800, color: C.text, lineHeight: 1.35 }}>{question}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-end", fontSize: 150, fontWeight: 800, color: C.primary, lineHeight: 1 }}>
              {yesPct}<span style={{ fontSize: 64 }}>%</span>
            </div>
            <div style={{ fontSize: 24, color: C.dim }}>が「起きる」と予想</div>
          </div>
        </div>

        {/* フッター：YES/NOチップ＋タグライン */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: C.pos, background: C.posWeak, padding: "12px 28px", borderRadius: 14 }}>YES {yesPct}¢</div>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: C.neg, background: C.negWeak, padding: "12px 28px", borderRadius: 14 }}>NO {100 - yesPct}¢</div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: C.faint }}>換金不可ポイントで遊ぶ予測市場</div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "NotoJP", data: font, weight: 800 as const, style: "normal" as const }] : [] }
  );
}
