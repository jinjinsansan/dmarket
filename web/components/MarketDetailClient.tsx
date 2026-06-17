"use client";
// 市場詳細の心臓部（SPEC-05 §5）。左=情報+チャート、右=トレードパネル。
// outcomes の q を Realtime で更新し、価格は lmsr_price で導出。
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lmsrPrices } from "@/lib/lmsr";
import { toPct, timeRemaining, statusLabel } from "@/lib/format";
import type { MarketWithOutcomes, PricePoint, Resolution } from "@/lib/types";
import { ProbabilityChart } from "./ProbabilityChart";
import { TradePanel } from "./TradePanel";

export function MarketDetailClient({
  market,
  resolution,
  history,
}: {
  market: MarketWithOutcomes;
  resolution: Resolution | null;
  history: PricePoint[];
}) {
  const [outcomes, setOutcomes] = useState(
    [...market.outcomes].sort((a, b) => a.display_order - b.display_order),
  );
  const [livePoints, setLivePoints] = useState<PricePoint[]>([]);

  // Realtime: この市場の outcomes(q) と price_history を購読
  useEffect(() => {
    const sb = createClient();
    const ch = sb
      .channel(`market-${market.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "outcomes", filter: `market_id=eq.${market.id}` },
        (payload) => {
          const next = payload.new as { id: string; q: number };
          setOutcomes((prev) => prev.map((o) => (o.id === next.id ? { ...o, q: next.q } : o)));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "market_price_history", filter: `market_id=eq.${market.id}` },
        (payload) => {
          const p = payload.new as PricePoint;
          setLivePoints((prev) => [...prev, p]);
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [market.id]);

  const prices = useMemo(() => lmsrPrices(outcomes.map((o) => o.q), market.b_param), [outcomes, market.b_param]);
  const allHistory = useMemo(() => [...history, ...livePoints], [history, livePoints]);
  const isOpen = market.status === "open" && new Date(market.close_time).getTime() > Date.now();

  // q をローカル更新（トレード成功時に TradePanel から呼ぶ）
  function applyNewPrices(newQById: Record<string, number>) {
    setOutcomes((prev) => prev.map((o) => (o.id in newQById ? { ...o, q: newQById[o.id] } : o)));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-dim mb-2">
          <span className="rounded-sm bg-surface-2 px-2 py-0.5">{market.category?.name ?? "市場"}</span>
          <span>状態: {statusLabel(market.status)}</span>
          {isOpen && <span>· {timeRemaining(market.close_time)}</span>}
        </div>
        <h1 className="text-xl font-semibold leading-snug mb-3">{market.question}</h1>

        <div className="flex gap-4 mb-4 text-sm">
          {outcomes.map((o, i) => (
            <span key={o.id} className="num">
              {o.label} <b className={i === 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}>{toPct(prices[i])}</b>
            </span>
          ))}
        </div>

        <ProbabilityChart outcomes={outcomes} history={allHistory} bParam={market.b_param} />

        {market.description && (
          <section className="mt-5">
            <h2 className="text-sm font-medium mb-1">説明 / 解決ルール</h2>
            <p className="text-sm text-dim whitespace-pre-wrap">{market.description}</p>
          </section>
        )}

        {resolution && (
          <section className="mt-5 text-sm">
            <h2 className="font-medium mb-1">解決の根拠</h2>
            <p className="text-dim">
              確定日時: {new Date(resolution.resolved_at).toLocaleString("ja-JP")} · 方式: {resolution.resolution_kind}
            </p>
            {resolution.source_url && (
              <a href={resolution.source_url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
                {resolution.source_url}
              </a>
            )}
          </section>
        )}
      </div>

      <div className="lg:sticky lg:top-20 h-fit">
        <TradePanel
          market={market}
          outcomes={outcomes}
          prices={prices}
          resolution={resolution}
          onTraded={applyNewPrices}
        />
      </div>
    </div>
  );
}
