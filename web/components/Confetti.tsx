"use client";
// お祝いの紙吹雪。fire（カウンタ）が変わるたびに一度だけ降らせる。globals.css の @keyframes gpConfetti を使用。
import { useEffect, useState } from "react";

const COLORS = ["#7b46e3", "#f4be1f", "#15b877", "#f2604c", "#9d6bf0", "#6e8bd8"];

export function Confetti({ fire }: { fire: number }) {
  const [pieces, setPieces] = useState<{ id: number; left: number; delay: number; dur: number; bg: string; w: number; h: number }[]>([]);

  useEffect(() => {
    if (!fire) return;
    const ps = Array.from({ length: 90 }, (_, i) => ({
      id: fire * 1000 + i,
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      dur: 1.8 + Math.random() * 1.4,
      bg: COLORS[i % COLORS.length],
      w: 7 + Math.random() * 5,
      h: 10 + Math.random() * 8,
    }));
    setPieces(ps);
    const t = setTimeout(() => setPieces([]), 3600);
    return () => clearTimeout(t);
  }, [fire]);

  if (!pieces.length) return null;
  return (
    <div className="fixed inset-0 z-[200] pointer-events-none overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span key={p.id} style={{
          position: "absolute", top: 0, left: `${p.left}%`, width: p.w, height: p.h,
          background: p.bg, borderRadius: 2,
          animation: `gpConfetti ${p.dur}s ${p.delay}s cubic-bezier(.2,.6,.4,1) forwards`,
        }} />
      ))}
    </div>
  );
}
