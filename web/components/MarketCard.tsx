"use client";
// 市場カード（handoff §1）。card / compact の2レイアウト。二択はドーナツ＋YES/NO。
import { useRouter } from "next/navigation";
import { lmsrPrices } from "@/lib/lmsr";
import { toCents, toPct, timeRemaining } from "@/lib/format";
import { marketVisual } from "@/lib/market-visual";
import { Donut } from "./Donut";
import type { MarketWithOutcomes } from "@/lib/types";

export function MarketCard({ market, variant = "card" }: { market: MarketWithOutcomes; variant?: "card" | "compact" }) {
  const router = useRouter();
  const outcomes = [...market.outcomes].sort((a, b) => a.display_order - b.display_order);
  const prices = lmsrPrices(outcomes.map((o) => o.q), market.b_param);
  const isBinary = outcomes.length === 2;
  const yes = prices[0] ?? 0.5;
  const vis = marketVisual({ id: market.id, slug: market.category?.slug, image_url: market.image_url });
  const open = () => router.push(`/market/${market.id}`);
  const pick = (i: number) => router.push(`/market/${market.id}?pick=${i}`);

  const Thumb = ({ s = 42 }: { s?: number }) => (
    <div className="rounded-[11px] grid place-items-center text-white font-extrabold shrink-0"
      style={{ width: s, height: s, background: vis.image ? `url(${vis.image}) center/cover` : vis.tint, fontSize: s * 0.38 }}>
      {!vis.image && vis.glyph}
    </div>
  );

  if (variant === "compact") {
    return (
      <div onClick={open}
        className="flex items-center gap-4 border border-border bg-surface rounded-[var(--radius-sm)] px-[18px] py-3.5 cursor-pointer hover:border-primary/50 transition-colors"
        style={{ boxShadow: "var(--shadow)" }}>
        <Thumb s={38} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{market.question}</p>
          <div className="text-xs text-dim mt-0.5">
            <span className="text-primary font-bold">{market.category?.name ?? "市場"}</span> · {timeRemaining(market.close_time)}
          </div>
        </div>
        {isBinary && (
          <div className="flex gap-2 w-[180px] shrink-0">
            <QuickBtn kind="pos" label={`YES ${toCents(yes)}`} onClick={(e) => { e.stopPropagation(); pick(0); }} />
            <QuickBtn kind="neg" label={`NO ${toCents(1 - yes)}`} onClick={(e) => { e.stopPropagation(); pick(1); }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div onClick={open}
      className="flex flex-col gap-3.5 border border-border bg-surface rounded-[var(--radius)] p-4 cursor-pointer hover:border-primary/50 transition-colors min-h-[184px]"
      style={{ boxShadow: "var(--shadow)" }}>
      <div className="flex items-start gap-3">
        <Thumb />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-primary mb-1">{market.category?.name ?? "市場"}</div>
          <h3 className="text-[14.5px] font-bold leading-snug line-clamp-2">{market.question}</h3>
        </div>
        {isBinary && <Donut pct={yes * 100} color={vis.tint} />}
      </div>

      {isBinary ? (
        <div className="flex gap-2 mt-auto">
          <QuickBtn kind="pos" label={`YES ${toCents(yes)}`} onClick={(e) => { e.stopPropagation(); pick(0); }} big />
          <QuickBtn kind="neg" label={`NO ${toCents(1 - yes)}`} onClick={(e) => { e.stopPropagation(); pick(1); }} big />
        </div>
      ) : (
        <div className="mt-auto space-y-1.5">
          {outcomes.map((o, i) => ({ label: o.label, p: prices[i] })).sort((a, b) => b.p - a.p).slice(0, 3).map((o) => (
            <div key={o.label} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-dim">{o.label}</span>
              <div className="w-[74px] h-1.5 rounded bg-surface2 overflow-hidden">
                <div className="h-full bg-primary rounded" style={{ width: `${o.p * 100}%` }} />
              </div>
              <span className="mono w-8 text-right">{toPct(o.p)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-dim pt-2 border-t border-border">
        <span className="mono">{outcomes.length}択</span>
        <span>{timeRemaining(market.close_time)}</span>
      </div>
    </div>
  );
}

function QuickBtn({ kind, label, onClick, big }: { kind: "pos" | "neg"; label: string; onClick: (e: React.MouseEvent) => void; big?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex-1 font-bold rounded-[10px] ${big ? "py-2.5 text-[13.5px]" : "py-2 text-[13px]"} ${kind === "pos" ? "bg-pos-weak text-pos" : "bg-neg-weak text-neg"}`}>
      {label}
    </button>
  );
}
