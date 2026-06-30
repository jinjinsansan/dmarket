"use client";
// トースト（約定・受け取り・エラー）。下中央からスライドイン。
// body へポータルして position:fixed をビューポート基準に固定（transform/will-change を持つ親に潜らない）。
// モバイルは下部ナビ＋セーフエリアの上、デスクトップは画面下に表示。globals.css の @keyframes dmToast を使用。
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!onClose) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  if (!mounted) return null;

  const expr: GorillaExpr = kind === "error" ? "sad" : kind === "success" ? "win" : "neutral";
  const accent = kind === "error" ? "var(--neg)" : kind === "success" ? "var(--pos)" : "var(--accent2)";

  const node = (
    <div
      role="status"
      // 下部ナビ(モバイル md未満)＋セーフエリアの上に出す。デスクトップは画面下24px。
      className="fixed left-1/2 z-[100] bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:bottom-6"
      style={{
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 11,
        background: "var(--text)",
        color: "var(--surface)",
        borderRadius: 14,
        padding: "13px 18px",
        boxShadow: "0 10px 30px -10px rgba(0,0,0,.4)",
        animation: "dmToast .26s cubic-bezier(.32,.72,0,1)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <GorillaFace size={26} expr={expr} color={accent} style={{ flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--dim)" }}>{sub}</div>}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

// 使用例:
// <Toast title="起きる方に乗りました" sub="100 pt ・ 137株" kind="success" onClose={() => setToast(null)} />
