"use client";
// 市場カード（本家Polymarket風・密集コンパクト）。小サムネ＋確率%＋YES/NO＋フッター。
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

  const Thumb = ({ s }: { s: number }) => (
    <div className="rounded-[9px] grid place-items-center text-white font-extrabold shrink-0 overflow-hidden"
      style={{ width: s, height: s, background: vis.image ? `url(${vis.image}) center/cover` : vis.tint, fontSize: s * 0.4 }}>
      {!vis.image && vis.glyph}
    </div>
  );

  if (variant === "compact") {
    return (
      <div onClick={open}
        className="card-hover flex items-center gap-3 border border-border bg-surface rounded-[12px] px-3.5 py-3 cursor-pointer hover:border-primary/40"
        style={{ boxShadow: "var(--shadow)" }}>
        <Thumb s={36} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{market.question}</p>
          <div className="text-xs text-dim mt-0.5">
            <span className="text-primary font-bold">{market.category?.name ?? "市場"}</span> · {timeRemaining(market.close_time)}
          </div>
        </div>
        {isBinary && (
          <div className="flex gap-2 w-[176px] shrink-0">
            <QuickBtn kind="pos" label="YES" sub={toPct(yes)} onClick={(e) => { e.stopPropagation(); pick(0); }} />
            <QuickBtn kind="neg" label="NO" sub={toPct(1 - yes)} onClick={(e) => { e.stopPropagation(); pick(1); }} />
          </div>
        )}
      </div>
    );
  }

  // ── card（密集コンパクト） ──
  return (
    <div onClick={open}
      className="card-hover flex flex-col gap-2.5 border border-border bg-surface rounded-[13px] p-3.5 cursor-pointer hover:border-primary/40"
      style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-start gap-2.5">
        <Thumb s={38} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-primary truncate">{market.category?.name ?? "市場"}</span>
            {isOpen && (
              <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-bold text-white shrink-0" style={{ background: "var(--pos)" }}>
                <span className="w-1 h-1 rounded-full bg-white animate-pulse" />LIVE
              </span>
            )}
          </div>
          <h3 className="text-[13px] font-bold leading-snug line-clamp-2 mt-0.5">{market.question}</h3>
        </div>
        {isBinary && (
          <div className="text-right shrink-0">
            <div className={`mono text-[20px] font-extrabold leading-none ${flash ? "price-flash" : ""}`} style={{ color: vis.tint }}>{Math.round(yes * 100)}%</div>
            <div className="text-[9px] text-dim font-bold mt-0.5">YES</div>
          </div>
        )}
      </div>

      {isBinary ? (
        <div className="flex gap-1.5 mt-auto">
          <QuickBtn kind="pos" label="YES" sub={toCents(yes)} onClick={(e) => { e.stopPropagation(); pick(0); }} />
          <QuickBtn kind="neg" label="NO" sub={toCents(1 - yes)} onClick={(e) => { e.stopPropagation(); pick(1); }} />
        </div>
      ) : (
        <div className="mt-auto space-y-1">
          {outcomes.map((o, i) => ({ label: o.label, p: prices[i] })).sort((a, b) => b.p - a.p).slice(0, 3).map((o) => (
            <div key={o.label} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-dim">{o.label}</span>
              <div className="w-[60px] h-1.5 rounded bg-surface2 overflow-hidden">
                <div className="h-full bg-primary rounded" style={{ width: `${o.p * 100}%` }} />
              </div>
              <span className="mono w-8 text-right font-bold">{toPct(o.p)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[10.5px] text-dim pt-1.5 border-t border-border">
        {spark && spark.length >= 2 ? <Sparkline data={spark} color={vis.tint} width={56} height={18} /> : <span className="mono">{outcomes.length}択</span>}
        <span>{timeRemaining(market.close_time)}</span>
      </div>
    </div>
  );
});

function QuickBtn({ kind, label, sub, onClick }: { kind: "pos" | "neg"; label: string; sub?: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick}
      className={`btn-press flex-1 font-bold rounded-[9px] flex items-center justify-center gap-1 py-2 ${kind === "pos" ? "bg-pos-weak text-pos hover:bg-pos hover:text-white" : "bg-neg-weak text-neg hover:bg-neg hover:text-white"} transition-colors`}>
      <span className="text-[12.5px]">{label}</span>
      {sub && <span className="mono text-[11px] opacity-80">{sub}</span>}
    </button>
  );
}
