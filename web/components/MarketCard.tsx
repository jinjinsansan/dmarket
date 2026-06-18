"use client";
// 市場カード（handoff §1 ＋ 改善§3.2/3.6/3.7）。大判画像ヘッダー・確率%大型・LIVE・リフトホバー。
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { lmsrPrices } from "@/lib/lmsr";
import { toCents, toPct, timeRemaining } from "@/lib/format";
import { marketVisual } from "@/lib/market-visual";
import { Sparkline } from "./Sparkline";
import type { MarketWithOutcomes } from "@/lib/types";

export const MarketCard = memo(function MarketCard({ market, variant = "card", spark }: { market: MarketWithOutcomes; variant?: "card" | "compact"; spark?: number[] }) {
  const router = useRouter();
  const outcomes = useMemo(() => [...market.outcomes].sort((a, b) => a.display_order - b.display_order), [market.outcomes]);
  const prices = useMemo(() => lmsrPrices(outcomes.map((o) => o.q), market.b_param), [outcomes, market.b_param]);
  const isBinary = outcomes.length === 2;
  const yes = prices[0] ?? 0.5;
  const vis = marketVisual({ id: market.id, slug: market.category?.slug, image_url: market.image_url });
  const open = () => router.push(`/market/${market.id}`);
  const pick = (i: number) => router.push(`/market/${market.id}?pick=${i}`);
  const isOpen = market.status === "open" && new Date(market.close_time).getTime() > Date.now();

  // Realtime 価格更新フラッシュ
  const [flash, setFlash] = useState(false);
  const prevYes = useRef(yes);
  useEffect(() => {
    if (Math.round(prevYes.current * 100) !== Math.round(yes * 100)) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      prevYes.current = yes;
      return () => clearTimeout(t);
    }
    prevYes.current = yes;
  }, [yes]);

  if (variant === "compact") {
    return (
      <div onClick={open}
        className="card-hover flex items-center gap-4 border border-border bg-surface rounded-[var(--radius-sm)] px-[18px] py-3.5 cursor-pointer hover:border-primary/40"
        style={{ boxShadow: "var(--shadow)" }}>
        <div className="w-9 h-9 rounded-[10px] grid place-items-center text-white font-extrabold shrink-0 text-sm"
          style={{ background: vis.image ? `url(${vis.image}) center/cover` : vis.tint }}>{!vis.image && vis.glyph}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{market.question}</p>
          <div className="text-xs text-dim mt-0.5">
            <span className="text-primary font-bold">{market.category?.name ?? "市場"}</span> · {timeRemaining(market.close_time)}
          </div>
        </div>
        {isBinary && (
          <div className="flex gap-2 w-[180px] shrink-0">
            <QuickBtn kind="pos" label="YES" sub={toPct(yes)} onClick={(e) => { e.stopPropagation(); pick(0); }} />
            <QuickBtn kind="neg" label="NO" sub={toPct(1 - yes)} onClick={(e) => { e.stopPropagation(); pick(1); }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div onClick={open}
      className="card-hover flex flex-col border border-border bg-surface rounded-[var(--radius)] cursor-pointer hover:border-primary/40 overflow-hidden group"
      style={{ boxShadow: "var(--shadow)" }}>
      {/* ヘッダー画像エリア */}
      <div className="relative h-[140px] w-full overflow-hidden"
        style={{ background: vis.image ? `url(${vis.image}) center/cover` : vis.tint }}>
        {!vis.image && <div className="absolute inset-0 grid place-items-center text-white font-extrabold text-5xl opacity-30">{vis.glyph}</div>}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/50 text-white backdrop-blur-sm">
          {market.category?.name ?? "市場"}
        </span>
        {isOpen && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ background: "var(--pos)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE
          </span>
        )}
        {isBinary && (
          <div className="absolute bottom-2 right-2 flex flex-col items-end">
            <span className={`mono text-[30px] font-extrabold leading-none text-white ${flash ? "price-flash" : ""}`} style={{ textShadow: "0 1px 5px rgba(0,0,0,0.6)" }}>
              {Math.round(yes * 100)}%
            </span>
            <span className="text-[10px] text-white/85 font-bold">YES</span>
          </div>
        )}
      </div>

      {/* 本体 */}
      <div className="flex flex-col gap-3 p-4 flex-1">
        <h3 className="text-[14px] font-bold leading-snug line-clamp-2 min-h-9">{market.question}</h3>
        {isBinary ? (
          <div className="flex gap-2 mt-auto">
            <QuickBtn kind="pos" label="YES" sub={toCents(yes)} onClick={(e) => { e.stopPropagation(); pick(0); }} big />
            <QuickBtn kind="neg" label="NO" sub={toCents(1 - yes)} onClick={(e) => { e.stopPropagation(); pick(1); }} big />
          </div>
        ) : (
          <div className="mt-auto space-y-1.5">
            {outcomes.map((o, i) => ({ label: o.label, p: prices[i] })).sort((a, b) => b.p - a.p).slice(0, 3).map((o) => (
              <div key={o.label} className="flex items-center gap-2 text-xs">
                <span className="flex-1 truncate text-dim">{o.label}</span>
                <div className="w-[74px] h-1.5 rounded bg-surface2 overflow-hidden">
                  <div className="h-full bg-primary rounded" style={{ width: `${o.p * 100}%` }} />
                </div>
                <span className="mono w-8 text-right font-bold">{toPct(o.p)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-[11px] text-dim pt-2 border-t border-border">
          {spark && spark.length >= 2 ? <Sparkline data={spark} color={vis.tint} /> : <span className="mono">{outcomes.length}択</span>}
          <span>{timeRemaining(market.close_time)}</span>
        </div>
      </div>
    </div>
  );
});

function QuickBtn({ kind, label, sub, onClick, big }: { kind: "pos" | "neg"; label: string; sub?: string; onClick: (e: React.MouseEvent) => void; big?: boolean }) {
  return (
    <button onClick={onClick}
      className={`btn-press flex-1 font-bold rounded-[10px] flex flex-col items-center justify-center ${big ? "py-2.5" : "py-2"} ${kind === "pos" ? "bg-pos-weak text-pos hover:bg-pos hover:text-white" : "bg-neg-weak text-neg hover:bg-neg hover:text-white"} transition-colors`}>
      <span className={big ? "text-[13.5px]" : "text-[13px]"}>{label}</span>
      {sub && <span className="mono text-[11px] opacity-80 font-semibold">{sub}</span>}
    </button>
  );
}
