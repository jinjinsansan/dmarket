"use client";
// 起動スプラッシュ（B案）。初回アクセス時に一瞬だけグレープ全面＋ゴリラを表示し、フェードアウト。
// layout.tsx の <body> 先頭にマウント。セッション内では再表示しない。
import { useEffect, useState } from "react";

export function Splash() {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // 同一セッションで再表示しない（初回ロードのみ）
    if (sessionStorage.getItem("gp-splash")) {
      setGone(true);
      return;
    }
    const t1 = setTimeout(() => setFading(true), 900); // フェード開始
    const t2 = setTimeout(() => {
      setGone(true);
      sessionStorage.setItem("gp-splash", "1");
    }, 1320);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "var(--primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        transition: "opacity .4s ease",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(420px 420px at 50% 38%, rgba(255,255,255,.14), rgba(255,255,255,0) 70%)",
        }}
      />
      <svg
        viewBox="0 0 100 100"
        width="132"
        height="132"
        fill="none"
        stroke="#fff"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: "relative" }}
      >
        <circle cx="16" cy="50" r="9" />
        <circle cx="84" cy="50" r="9" />
        <path d="M50 14 C30 14 18 27 18 47 C18 71 32 88 50 88 C68 88 82 71 82 47 C82 27 70 14 50 14 Z" />
        <path d="M30 45 Q50 37 70 45" />
        <circle cx="40" cy="52.5" r="2.7" fill="#fff" stroke="none" />
        <circle cx="60" cy="52.5" r="2.7" fill="#fff" stroke="none" />
        <path d="M50 56 L50 61" />
        <path d="M39 64 Q50 59 61 64 Q66 70 60 75 Q50 79 40 75 Q34 70 39 64 Z" />
        <path d="M43 83 Q50 86.5 57 83" />
      </svg>
      <div style={{ position: "relative", textAlign: "center" }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", letterSpacing: "-.5px" }}>
          ゴリラ予想
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.85)", marginTop: 10 }}>
          換金不可ポイントで遊ぶ予測市場
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 54, display: "flex", gap: 8 }}>
        <span className="gp-dot" />
        <span className="gp-dot" style={{ animationDelay: ".18s" }} />
        <span className="gp-dot" style={{ animationDelay: ".36s" }} />
      </div>
    </div>
  );
}
