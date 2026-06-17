"use client";
// ランキング（handoff §4）。総資産/的中率 切替、表彰台、一覧。
import { useMemo, useState } from "react";
import { formatPoints } from "@/lib/format";
import type { RankRow } from "@/lib/queries";

const MEDAL = ["#eab308", "#94a3b8", "#cd7f32"];

export function LeaderboardView({ rows }: { rows: RankRow[] }) {
  const [mode, setMode] = useState<"networth" | "accuracy">("networth");

  const sorted = useMemo(() => {
    const acc = (r: RankRow) => (r.resolved_count > 0 ? r.win_count / r.resolved_count : 0);
    return [...rows].sort((a, b) => (mode === "networth" ? b.net_worth - a.net_worth : acc(b) - acc(a)));
  }, [rows, mode]);

  const valueOf = (r: RankRow) =>
    mode === "networth" ? `${formatPoints(r.net_worth)} pt`
      : r.resolved_count > 0 ? `${Math.round((r.win_count / r.resolved_count) * 100)}%` : "—";

  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    <div className="max-w-[880px] mx-auto px-[22px] py-6 pb-20 dm-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[23px] font-extrabold">ランキング / Leaderboard</h1>
        <div className="flex gap-1 p-[3px] bg-surface2 border border-border rounded-[11px]">
          <Seg active={mode === "networth"} onClick={() => setMode("networth")}>総資産</Seg>
          <Seg active={mode === "accuracy"} onClick={() => setMode("accuracy")}>的中率</Seg>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-dim text-sm py-20 text-center border border-dashed border-border rounded-[var(--radius)]">
          まだランキングがありません。
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6 items-end">
            {podium.map((r, i) => (
              <div key={r.user_id}
                className="border border-border bg-surface rounded-[var(--radius)] p-4 text-center"
                style={{ boxShadow: "var(--shadow)", transform: i === 0 ? "translateY(-8px)" : undefined }}>
                <div className="mono w-7 h-7 mx-auto rounded-full grid place-items-center text-white text-sm font-bold mb-2" style={{ background: MEDAL[i] }}>{i + 1}</div>
                <div className="w-12 h-12 mx-auto rounded-full grid place-items-center text-white font-extrabold mb-2" style={{ background: "var(--grad)" }}>
                  {r.display_name.slice(0, 1)}
                </div>
                <div className="text-sm font-bold truncate">{r.display_name}</div>
                <div className="mono text-[15px] font-bold text-primary mt-1">{valueOf(r)}</div>
              </div>
            ))}
          </div>

          <div className="border border-border bg-surface rounded-[var(--radius)] divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
            {rest.map((r, i) => (
              <div key={r.user_id} className="flex items-center gap-3 px-4 py-3">
                <span className="mono w-6 text-center text-dim">{i + 4}</span>
                <div className="w-8 h-8 rounded-full grid place-items-center text-white text-xs font-bold" style={{ background: "var(--grad)" }}>{r.display_name.slice(0, 1)}</div>
                <span className="flex-1 truncate text-sm">{r.display_name}</span>
                <span className="mono text-sm font-bold">{valueOf(r)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`text-[12.5px] font-bold px-3 py-1.5 rounded-lg ${active ? "bg-surface text-text shadow-sm" : "text-dim"}`}>{children}</button>
  );
}
