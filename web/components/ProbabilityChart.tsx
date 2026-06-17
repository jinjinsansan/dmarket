"use client";
// 確率チャート（SPEC-05 §5・§13-6）。Recharts で YES(先頭outcome)の確率推移を描画。
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Outcome, PricePoint } from "@/lib/types";

type Range = "1H" | "6H" | "1D" | "1W" | "ALL";
const WINDOW_MS: Record<Range, number> = {
  "1H": 3.6e6,
  "6H": 2.16e7,
  "1D": 8.64e7,
  "1W": 6.048e8,
  ALL: Infinity,
};

export function ProbabilityChart({
  outcomes,
  history,
}: {
  outcomes: Outcome[];
  history: PricePoint[];
  bParam: number;
}) {
  const [range, setRange] = useState<Range>("ALL");
  const yesId = outcomes[0]?.id;

  const data = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MS[range];
    return history
      .filter((p) => p.outcome_id === yesId && new Date(p.recorded_at).getTime() >= cutoff)
      .map((p) => ({ t: new Date(p.recorded_at).getTime(), pct: Math.round(p.price * 100) }));
  }, [history, yesId, range]);

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-3">
      <div className="flex justify-end gap-1 mb-2">
        {(Object.keys(WINDOW_MS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-xs rounded-sm px-2 py-0.5 ${
              range === r ? "bg-primary/15 text-primary" : "text-dim hover:text-text"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="h-56">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-dim text-sm">
            まだ価格履歴がありません
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="yesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--pos)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--pos)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => new Date(t).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                stroke="var(--brand-text-dim)"
                fontSize={11}
              />
              <YAxis domain={[0, 100]} stroke="var(--brand-text-dim)" fontSize={11} width={32} />
              <Tooltip
                contentStyle={{ background: "var(--brand-surface-2)", border: "1px solid var(--brand-border)", borderRadius: 6 }}
                labelFormatter={(t) => new Date(t as number).toLocaleString("ja-JP")}
                formatter={(v) => [`${v}%`, "YES"]}
              />
              <Area type="monotone" dataKey="pct" stroke="var(--pos)" fill="url(#yesFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
