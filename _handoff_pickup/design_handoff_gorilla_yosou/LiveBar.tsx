"use client";
// トップ「ピックアップ1本集中」型の最上部 LiveBar。
// スポーツ進行中: 🔴 LIVE 試合中（脈動）／それ以外: ⏳ 締切まで hh:mm:ss。右に参加人数。
import { useEffect, useState } from "react";

export function LiveBar({
  mode, closesAt, liveLabel, participants,
}: {
  mode: "countdown" | "live";
  closesAt?: string | number | Date; // countdown 用
  liveLabel?: string;                // 例 "6回裏"
  participants: number;
}) {
  const live = mode === "live";
  const remain = useCountdown(closesAt);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 14px", borderRadius: 12,
        background: live ? "var(--neg-weak)" : "var(--primary-weak)",
        border: `1px solid ${live ? "#F5C9C0" : "#E0D2FA"}`,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: live ? "var(--neg)" : "var(--primary)" }}>
        {live ? (
          <>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--neg)", animation: "gpBlink 1.1s infinite" }} />
            🔴 LIVE 試合中{liveLabel && <span className="mono" style={{ opacity: 0.8 }}> {liveLabel}</span>}
          </>
        ) : (
          <>⏳ 締切まで <span className="mono">{remain}</span></>
        )}
      </span>
      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--dim)" }}>
        👥 今 <span className="mono" style={{ color: "var(--text)" }}>{participants.toLocaleString()}</span>人
      </span>
    </div>
  );
}

// hh:mm:ss カウントダウン
export function useCountdown(target?: string | number | Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!target) return "--:--:--";
  const ms = Math.max(0, new Date(target).getTime() - now);
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
