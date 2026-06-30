"use client";
// ゴリラの線画フェイス（マスコット）。表情を expr で切替。stroke は currentColor 連動。
// 空/ローディング/エラー状態・コメントアバター・スプラッシュ等で再利用。
import type { CSSProperties } from "react";

export type GorillaExpr = "neutral" | "win" | "thinking" | "surprised" | "sad";

export function GorillaFace({
  size = 78,
  expr = "neutral",
  color = "currentColor",
  eyeColor,
  style,
}: {
  size?: number;
  expr?: GorillaExpr;
  color?: string;
  eyeColor?: string;
  style?: CSSProperties;
}) {
  const ec = eyeColor ?? color;
  // 顔の輪郭・耳・鼻・眉は共通。目と口だけ表情で差し替える。
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={4.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden
    >
      <circle cx="16" cy="50" r="9" />
      <circle cx="84" cy="50" r="9" />
      <path d="M50 14 C30 14 18 27 18 47 C18 71 32 88 50 88 C68 88 82 71 82 47 C82 27 70 14 50 14 Z" />
      <path d="M39 64 Q50 59 61 64 Q66 70 60 75 Q50 79 40 75 Q34 70 39 64 Z" />

      {expr === "neutral" && (
        <>
          <path d="M30 45 Q50 37 70 45" />
          <circle cx="40" cy="52.5" r="2.7" fill={ec} stroke="none" />
          <circle cx="60" cy="52.5" r="2.7" fill={ec} stroke="none" />
          <path d="M50 56 L50 61" />
          <path d="M43 83 Q50 86.5 57 83" />
        </>
      )}
      {expr === "win" && (
        <>
          <path d="M30 46 Q50 38 70 46" />
          <path d="M35 53 Q40 48 45 53" />
          <path d="M55 53 Q60 48 65 53" />
          <path d="M40 80 Q50 90 60 80" />
        </>
      )}
      {expr === "thinking" && (
        <>
          <path d="M30 42 Q40 38 48 43" />
          <path d="M55 45 Q63 43 70 46" />
          <circle cx="40" cy="52.5" r="2.7" fill={ec} stroke="none" />
          <circle cx="60" cy="53.5" r="2.7" fill={ec} stroke="none" />
          <path d="M44 84 L56 82" />
        </>
      )}
      {expr === "surprised" && (
        <>
          <path d="M30 44 Q50 36 70 44" />
          <circle cx="40" cy="53" r="4" />
          <circle cx="60" cy="53" r="4" />
          <ellipse cx="50" cy="84" rx="4" ry="5" />
        </>
      )}
      {expr === "sad" && (
        <>
          <path d="M30 41 L46 47" />
          <path d="M54 47 L70 41" />
          <circle cx="40" cy="54" r="2.7" fill={ec} stroke="none" />
          <circle cx="60" cy="54" r="2.7" fill={ec} stroke="none" />
          <path d="M43 86 Q50 80 57 86" />
        </>
      )}
    </svg>
  );
}
