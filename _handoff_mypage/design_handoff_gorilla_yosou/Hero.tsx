"use client";
// トップのヒーロー。アクセスのたびに A案（ようこそ型）↔ B案（今日のお題型）を交互表示。
// localStorage 'gp-hero' に前回値を保存し、毎回反転。現在のカルーセル枠に差し替えて使用。
import { useEffect, useState } from "react";

type Market = { id: string; question: string; yesPct: number; flag?: string };
type Props = { featured: Market; daily: Market };

export function Hero({ featured, daily }: Props) {
  // SSRと初回CSRはAで安定描画 → マウント後に交互切替（チラつき最小）
  const [variant, setVariant] = useState<"A" | "B">("A");
  useEffect(() => {
    const last = localStorage.getItem("gp-hero");
    const next = last === "A" ? "B" : "A";
    localStorage.setItem("gp-hero", next);
    setVariant(next);
  }, []);

  return variant === "A" ? <HeroWelcome m={featured} /> : <HeroDaily m={daily} />;
}

/* ── A案：ようこそ型 ── */
function HeroWelcome({ m }: { m: Market }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 24, boxShadow: "var(--shadow)", overflow: "hidden", display: "grid", gridTemplateColumns: "1.3fr 1fr", minHeight: 380 }}>
      <div style={{ position: "relative", padding: "44px 46px", background: "linear-gradient(135deg,var(--primary-weak),#fff 70%)", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)" }}>ゴリラ予想へようこそ</span>
        <h1 style={{ fontSize: 34, fontWeight: 900, color: "var(--text)", lineHeight: 1.32, margin: "12px 0 0", letterSpacing: "-.5px" }}>むずかしくない。<br />世界の「これ、起きる？」に<br />乗るだけ。</h1>
        <p style={{ fontSize: 14.5, color: "var(--dim)", margin: "16px 0 26px", lineHeight: 1.7, maxWidth: 440 }}>換金不可ポイントで遊ぶ予測市場。賭けじゃなくて、みんなで当てる遊び。</p>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="/" style={{ background: "var(--primary)", color: "#fff", fontSize: 15, fontWeight: 800, padding: "13px 26px", borderRadius: 13, boxShadow: "var(--cta-glow)", textDecoration: "none" }}>市場を見る →</a>
          <a href="/legal/no-gambling" style={{ border: "1.5px solid var(--border)", color: "var(--text)", fontSize: 15, fontWeight: 800, padding: "13px 24px", borderRadius: 13, background: "#fff", textDecoration: "none" }}>あそび方</a>
        </div>
        <GorillaFace size={220} style={{ position: "absolute", right: -30, bottom: -46, opacity: 0.13 }} stroke="var(--primary)" eyeFill="var(--primary)" />
      </div>
      <a href={`/market/${m.id}`} style={{ padding: "28px 30px", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "center", textDecoration: "none", color: "inherit" }}>
        <div style={{ marginBottom: 12 }}><span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent2)", background: "var(--banana-weak)", padding: "3px 10px", borderRadius: 999 }}>★ 今日の注目</span></div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--surface2)", display: "grid", placeItems: "center", fontSize: 22, flexShrink: 0 }}>{m.flag ?? "🌍"}</div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: 0, lineHeight: 1.4 }}>{m.question}</h3>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, margin: "18px 0 14px" }}>
          <div className="mono" style={{ fontSize: 44, fontWeight: 800, color: "var(--primary)", lineHeight: 0.85 }}>{m.yesPct}<span style={{ fontSize: 22 }}>%</span></div>
          <span style={{ fontSize: 12, color: "var(--dim)", fontWeight: 700, paddingBottom: 6 }}>が「はい」</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, background: "var(--pos-weak)", color: "var(--pos)", borderRadius: 11, padding: "11px 0", textAlign: "center", fontWeight: 800, fontSize: 14 }}>はい</div>
          <div style={{ flex: 1, background: "var(--neg-weak)", color: "var(--neg)", borderRadius: 11, padding: "11px 0", textAlign: "center", fontWeight: 800, fontSize: 14 }}>いいえ</div>
        </div>
      </a>
    </div>
  );
}

/* ── B案：今日のお題型 ── */
function HeroDaily({ m }: { m: Market }) {
  const no = 100 - m.yesPct;
  return (
    <div style={{ background: "var(--primary)", borderRadius: 24, boxShadow: "var(--shadow)", overflow: "hidden", position: "relative", display: "flex", alignItems: "center", gap: 36, padding: "40px 46px", minHeight: 300 }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(520px 420px at 80% 10%,rgba(255,255,255,.14),rgba(255,255,255,0) 70%)" }} />
      <div style={{ position: "relative", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ background: "#fff", color: "var(--text)", fontSize: 13, fontWeight: 800, padding: "8px 16px", borderRadius: 14 }}>今日のお題はこれ！🍌</div>
        <div style={{ width: 128, height: 128, borderRadius: 999, background: "rgba(255,255,255,.14)", display: "grid", placeItems: "center" }}>
          <GorillaFace size={96} stroke="#fff" eyeFill="#fff" />
        </div>
      </div>
      <div style={{ position: "relative", flex: 1 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1.4, margin: "0 0 8px" }}>{m.question}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 18px" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.85)" }}>みんなの予想</span>
          <div style={{ flex: 1, maxWidth: 360, height: 12, borderRadius: 999, background: "rgba(255,255,255,.25)", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${m.yesPct}%`, background: "var(--pos)" }} />
            <div style={{ flex: 1, background: "var(--neg)" }} />
          </div>
          <span className="mono" style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>YES {m.yesPct}%</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href={`/market/${m.id}?pick=0`} style={{ background: "var(--pos)", color: "#fff", fontSize: 15, fontWeight: 800, padding: "13px 30px", borderRadius: 13, textDecoration: "none" }}>起きる（YES）</a>
          <a href={`/market/${m.id}?pick=1`} style={{ background: "var(--neg)", color: "#fff", fontSize: 15, fontWeight: 800, padding: "13px 30px", borderRadius: 13, textDecoration: "none" }}>起きない（NO）</a>
        </div>
      </div>
    </div>
  );
}

function GorillaFace({ size, stroke, eyeFill, style }: { size: number; stroke: string; eyeFill: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill="none" stroke={stroke} strokeWidth={4.4} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <circle cx="16" cy="50" r="9" /><circle cx="84" cy="50" r="9" />
      <path d="M50 14 C30 14 18 27 18 47 C18 71 32 88 50 88 C68 88 82 71 82 47 C82 27 70 14 50 14 Z" />
      <path d="M30 45 Q50 37 70 45" />
      <circle cx="40" cy="52.5" r="2.7" fill={eyeFill} stroke="none" /><circle cx="60" cy="52.5" r="2.7" fill={eyeFill} stroke="none" />
      <path d="M39 64 Q50 59 61 64 Q66 70 60 75 Q50 79 40 75 Q34 70 39 64 Z" />
      <path d="M43 83 Q50 86.5 57 83" />
    </svg>
  );
}
