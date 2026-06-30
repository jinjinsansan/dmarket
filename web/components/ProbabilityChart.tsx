"use client";
// 確率チャート（handoff §2）。Recharts エリアで先頭アウトカムの確率推移。時間軸タブ。
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Outcome, PricePoint } from "@/lib/types";

type Range = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";
const WINDOW_MS: Record<Range, number> = {
  "1H": 3.6e6, "6H": 2.16e7, "1D": 8.64e7, "1W": 6.048e8, "1M": 2.592e9, ALL: Infinity,
};

export function ProbabilityChart({ outcomes, history, color, currentPct }: { outcomes: Outcome[]; history: PricePoint[]; color: string; currentPct?: number }) {
  const [range, setRange] = useState<Range>("ALL");
  const yesId = outcomes[0]?.id;

  const data = useMemo(() => {
    const now = Date.now();
    const cutoff = now - WINDOW_MS[range];
    const pts = history
      .filter((p) => p.outcome_id === yesId && new Date(p.recorded_at).getTime() >= cutoff)
      .map((p) => ({ t: new Date(p.recorded_at).getTime(), pct: Math.round(p.price * 100) }));
    // 取引が無い市場は履歴点が1個以下＝線が描けない。現在価格で水平のベースラインを補う。
    if (currentPct != null && pts.length < 2) {
      const cur = Math.round(currentPct);
      const last = pts[pts.length - 1];
      if (!last) return [{ t: now - 36e5, pct: cur }, { t: now, pct: cur }];
      if (last.t < now) return [...pts, { t: now, pct: cur }];
      return [{ t: last.t - 36e5, pct: last.pct }, ...pts];
    }
    return pts;
  }, [history, yesId, range, currentPct]);

  return (
    <div>
      <div className="flex justify-end gap-0.5 p-[3px] bg-surface2 rounded-[9px] w-fit ml-auto mb-3 scrollx">
        {(Object.keys(WINDOW_MS) as Range[]).map((r) => (
          <button key={r} onClick={() => setRange(r)}
            className={`text-xs font-bold px-2.5 py-1 rounded-md ${range === r ? "bg-surface text-text shadow-sm" : "text-dim"}`}>{r}</button>
        ))}
      </div>
      <div className="h-72 md:h-80">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-dim text-sm">まだ価格履歴がありません</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="dmFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} stroke="var(--faint)" fontSize={11}
                tickFormatter={(t) => new Date(t).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })} />
              <YAxis domain={[0, 100]} stroke="var(--faint)" fontSize={11} width={34} />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                labelFormatter={(t) => new Date(t as number).toLocaleString("ja-JP")}
                formatter={(v) => [`${v}%`, outcomes[0]?.label ?? "YES"]} />
              <Area type="monotone" dataKey="pct" stroke={color} fill="url(#dmFill)" strokeWidth={2.4} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
