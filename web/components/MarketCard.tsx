"use client";
// 市場カード（SPEC-05 §4）。二択は YES%緑 / NO%赤の確率バー、¢クイック表示。
import Link from "next/link";
import { lmsrPrices } from "@/lib/lmsr";
import { toCents, toPct, timeRemaining } from "@/lib/format";
import type { MarketWithOutcomes, Outcome } from "@/lib/types";

export function MarketCard({ market }: { market: MarketWithOutcomes }) {
  const outcomes = [...market.outcomes].sort((a, b) => a.display_order - b.display_order);
  const prices = lmsrPrices(outcomes.map((o) => o.q), market.b_param);
  const isBinary = outcomes.length === 2;
  const yesPrice = prices[0] ?? 0.5;

  return (
    <Link
      href={`/market/${market.id}`}
      className="block rounded-[var(--radius)] border border-border bg-surface p-4 hover:border-primary/60 transition-colors"
    >
      <div className="flex items-center justify-between text-xs text-dim mb-2">
        <span className="rounded-sm bg-surface-2 px-2 py-0.5">{market.category?.name ?? "市場"}</span>
        <span>{timeRemaining(market.close_time)}</span>
      </div>

      <h3 className="text-sm font-medium leading-snug line-clamp-2 min-h-10">{market.question}</h3>

      {isBinary ? (
        <BinaryBar yes={yesPrice} />
      ) : (
        <MultiBars outcomes={outcomes} prices={prices} />
      )}
    </Link>
  );
}

function BinaryBar({ yes }: { yes: number }) {
  const no = 1 - yes;
  return (
    <div className="mt-3">
      <div className="flex h-2 rounded-full overflow-hidden bg-surface-2">
        <div style={{ width: `${yes * 100}%` }} className="bg-[var(--pos)]" />
        <div style={{ width: `${no * 100}%` }} className="bg-[var(--neg)]" />
      </div>
      <div className="mt-2 flex gap-2">
        <span className="num flex-1 text-center rounded-sm py-1.5 text-sm bg-[var(--pos)]/15 text-[var(--pos)]">
          YES {toCents(yes)}
        </span>
        <span className="num flex-1 text-center rounded-sm py-1.5 text-sm bg-[var(--neg)]/15 text-[var(--neg)]">
          NO {toCents(no)}
        </span>
      </div>
    </div>
  );
}

function MultiBars({ outcomes, prices }: { outcomes: Outcome[]; prices: number[] }) {
  const top = outcomes
    .map((o, i) => ({ label: o.label, price: prices[i] }))
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);
  return (
    <div className="mt-3 space-y-1.5">
      {top.map((o) => (
        <div key={o.label} className="flex items-center gap-2 text-xs">
          <span className="flex-1 truncate text-dim">{o.label}</span>
          <span className="num">{toPct(o.price)}</span>
        </div>
      ))}
    </div>
  );
}
