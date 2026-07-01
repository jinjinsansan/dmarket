"use client";
// トースト（約定・受け取り・エラー）。下中央からスライドイン。
// 参照: reference/proposal.html ⑤ 内「Toast」。globals.css の @keyframes dmToast を使用。
import { useEffect } from "react";
import { GorillaFace, type GorillaExpr } from "./GorillaFace";

export type ToastKind = "success" | "info" | "error";

export function Toast({
  title,
  sub,
  kind = "success",
  duration = 2600,
  onClose,
}: {
  title: string;
  sub?: string;
  kind?: ToastKind;
  duration?: number;
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!onClose) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  const expr: GorillaExpr = kind === "error" ? "sad" : kind === "success" ? "win" : "neutral";
  const accent = kind === "error" ? "var(--neg)" : kind === "success" ? "var(--pos)" : "var(--accent2)";

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 84, // BottomNav の上
        transform: "translateX(-50%)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        gap: 11,
        background: "var(--text)",
        color: "var(--surface)",
        borderRadius: 14,
        padding: "13px 18px",
        boxShadow: "0 10px 30px -10px rgba(0,0,0,.4)",
        animation: "dmToast .26s cubic-bezier(.32,.72,0,1)",
        maxWidth: "calc(100% - 32px)",
      }}
    >
      <GorillaFace size={26} expr={expr} color={accent} style={{ flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--dim)" }}>{sub}</div>}
      </div>
    </div>
  );
}

// 使用例:
// <Toast title="起きる方に乗りました" sub="100 pt ・ 137株" kind="success" onClose={() => setToast(null)} />
