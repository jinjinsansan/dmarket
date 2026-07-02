"use client";
// 管理: /admin/pickup — 24hスロットに市場を割り当てる。自動候補（出来高順・まもなく開始）を提示。
import { useState } from "react";

export type Slot = {
  hour: number;                 // 0..23
  market?: { title: string; meta: string; status: "live" | "public" | "next"; sport?: boolean };
};
export type Candidate = { id: string; emoji: string; title: string; badge: string; badgeTone?: "pos" | "dim" };

export function PickupSchedule({
  dateLabel, slots, candidates, autoAssign, onToggleAuto, onAssign,
}: {
  dateLabel: string;
  slots: Slot[];
  candidates: Candidate[];
  autoAssign: boolean;
  onToggleAuto?: (v: boolean) => void;
  onAssign?: (hour: number, candidateId: string) => void;
}) {
  const [target, setTarget] = useState<number | null>(null);

  return (
    <div className="admin-scope" style={{ background: "var(--bg)", padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--text)", margin: 0 }}>ピックアップ枠 スケジュール</h3>
        <span className="mono" style={{ fontSize: 12, color: "var(--dim)" }}>{dateLabel}</span>
        <button onClick={() => onToggleAuto?.(!autoAssign)} style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: autoAssign ? "var(--pos)" : "var(--dim)", background: autoAssign ? "var(--pos-weak)" : "var(--surface2)", padding: "4px 11px", borderRadius: 999, border: "none", cursor: "pointer" }}>
          自動割当{autoAssign ? "ON" : "OFF"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        {/* slots */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {slots.map((s) => {
            const m = s.market;
            const selected = target === s.hour;
            const filled = !!m;
            const borderColor = m?.status === "next" ? "var(--primary)" : selected ? "var(--primary)" : "var(--border)";
            return (
              <button
                key={s.hour}
                onClick={() => !filled && setTarget(selected ? null : s.hour)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: filled ? "default" : "pointer",
                  background: "var(--surface)", borderRadius: 12, padding: "11px 14px",
                  border: `${m?.status === "next" || selected ? 2 : 1}px ${filled ? "solid" : "dashed"} ${borderColor}`,
                }}
              >
                <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: m?.status === "next" ? "var(--primary)" : filled ? "var(--dim)" : "var(--faint)", width: 44 }}>
                  {String(s.hour).padStart(2, "0")}:00
                </span>
                <div style={{ flex: 1 }}>
                  {filled ? (
                    <>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{m!.sport ? "⚾️ " : ""}{m!.title}</div>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>{m!.meta}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--faint)" }}>{selected ? "右の候補から選択…" : "未割当 — タップで候補を選ぶ"}</div>
                  )}
                </div>
                {filled ? <StatusPill status={m!.status} /> : <span style={{ fontSize: 15, color: "var(--primary)" }}>＋</span>}
              </button>
            );
          })}
        </div>

        {/* candidates */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, boxShadow: "var(--shadow)", alignSelf: "start" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>自動候補</div>
          <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 11 }}>出来高順・まもなく開始</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {candidates.map((c) => (
              <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "9px 11px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12 }}>{c.emoji}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text)", flex: 1 }}>{c.title}</span>
                <span className="mono" style={{ fontSize: 10, fontWeight: 800, color: c.badgeTone === "pos" ? "var(--pos)" : "var(--dim)" }}>{c.badge}</span>
              </div>
            ))}
          </div>
          <button
            disabled={target === null}
            onClick={() => target !== null && candidates[0] && onAssign?.(target, candidates[0].id)}
            style={{ width: "100%", background: target === null ? "var(--surface2)" : "var(--primary)", color: target === null ? "var(--faint)" : "#fff", textAlign: "center", fontSize: 12, fontWeight: 800, padding: 10, borderRadius: 10, marginTop: 12, border: "none", cursor: target === null ? "default" : "pointer" }}
          >
            {target === null ? "スロットを選択" : `${String(target).padStart(2, "0")}:00 に割り当て`}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "live" | "public" | "next" }) {
  const map = {
    live: ["LIVE", "var(--neg)", "var(--neg-weak)"],
    public: ["公開中", "var(--pos)", "var(--pos-weak)"],
    next: ["次の枠", "var(--primary)", "var(--primary-weak)"],
  } as const;
  const [label, color, bg] = map[status];
  return <span style={{ fontSize: 10, fontWeight: 800, color, background: bg, padding: "2px 8px", borderRadius: 6 }}>{label}</span>;
}
