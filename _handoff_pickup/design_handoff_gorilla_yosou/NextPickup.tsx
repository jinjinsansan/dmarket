"use client";
// 次のピックアップ予告＋カウントダウン。切替の"儀式感/FOMO"を演出。
import { useCountdown } from "./LiveBar";

export function NextPickup({
  nextAt, timeLabel, title, emoji = "⚡",
}: {
  nextAt: string | number | Date;  // 次の切替時刻
  timeLabel: string;               // "20:00" 等（表示用）
  title: string;                   // "巨人 × 阪神"
  emoji?: string;
}) {
  const remain = useCountdown(nextAt); // hh:mm:ss。mm:ss 表示にしたい場合は slice(3)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", background: "linear-gradient(135deg,#2A1B4D,#5a37a8)", borderRadius: 15 }}>
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,.6)", fontWeight: 700 }}>NEXT</div>
        <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: "var(--accent2)" }}>{remain.slice(3)}</div>
      </div>
      <div style={{ width: 1, height: 28, background: "rgba(255,255,255,.16)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,.55)" }}>次のピックアップ ・ {timeLabel}</div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      </div>
      <span style={{ fontSize: 15 }}>{emoji}</span>
    </div>
  );
}
