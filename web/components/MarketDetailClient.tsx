"use client";
// 市場詳細（handoff §2）。左=ヘッダー＋チャート＋アウトカム＋ルール、右=トレードパネル(sticky)。
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lmsrPrices } from "@/lib/lmsr";
import { toPct, toCents, timeRemaining, statusLabel } from "@/lib/format";
import { marketVisual } from "@/lib/market-visual";
import type { MarketWithOutcomes, PricePoint, Resolution } from "@/lib/types";
import { ProbabilityChart } from "./ProbabilityChart";
import { TradePanel } from "./TradePanel";

export function MarketDetailClient({
  market, resolution, history, initialPick,
}: {
  market: MarketWithOutcomes; resolution: Resolution | null; history: PricePoint[]; initialPick: number;
}) {
  const router = useRouter();
  const [outcomes, setOutcomes] = useState([...market.outcomes].sort((a, b) => a.display_order - b.display_order));
  const [livePoints, setLivePoints] = useState<PricePoint[]>([]);
  const [pickIdx, setPickIdx] = useState(initialPick);
  const vis = marketVisual({ id: market.id, slug: market.category?.slug, image_url: market.image_url });

  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`market-${market.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "outcomes", filter: `market_id=eq.${market.id}` },
        (p) => { const n = p.new as { id: string; q: number }; setOutcomes((prev) => prev.map((o) => (o.id === n.id ? { ...o, q: n.q } : o))); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "market_price_history", filter: `market_id=eq.${market.id}` },
        (p) => setLivePoints((prev) => [...prev, p.new as PricePoint]))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [market.id]);

  const prices = useMemo(() => lmsrPrices(outcomes.map((o) => o.q), market.b_param), [outcomes, market.b_param]);
  const allHistory = useMemo(() => [...history, ...livePoints], [history, livePoints]);
  const isOpen = market.status === "open" && new Date(market.close_time).getTime() > Date.now();

  // チャート用: 先頭アウトカムの確率変化
  const yesPct = prices[0] * 100;

  return (
    <div className="max-w-[1240px] mx-auto px-[22px] py-6 pb-20 dm-in">
      <button onClick={() => router.push("/")} className="flex items-center gap-1.5 text-[13px] font-semibold text-dim hover:text-text pb-3.5">
        ← マーケット一覧へ戻る
      </button>

      <div className="flex flex-wrap gap-6 items-start">
        {/* 左カラム */}
        <div className="flex-[1_1_460px] flex flex-col gap-[18px] min-w-0">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-[14px] grid place-items-center text-white text-2xl font-extrabold shrink-0"
              style={{ background: vis.image ? `url(${vis.image}) center/cover` : vis.tint }}>{!vis.image && vis.glyph}</div>
            <div>
              <div className="text-[12.5px] text-dim mb-1.5">
                <span className="text-primary font-bold">{market.category?.name ?? "市場"}</span> · 状態 {statusLabel(market.status)}
                {isOpen && <> · {timeRemaining(market.close_time)}</>}
              </div>
              <h1 className="text-[23px] font-extrabold leading-snug">{market.question}</h1>
            </div>
          </div>

          {/* 確率＋チャート */}
          <div className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
            <div className="flex items-end justify-between mb-3">
              <div>
                <span className="mono text-[38px] font-bold leading-none" style={{ color: vis.tint }}>{Math.round(yesPct)}%</span>
                <span className="text-[13px] text-dim ml-2">{outcomes[0]?.label} の確率</span>
              </div>
            </div>
            <ProbabilityChart outcomes={outcomes} history={allHistory} color={vis.tint} />
          </div>

          {/* アウトカム */}
          <div className="border border-border bg-surface rounded-[var(--radius)] p-2" style={{ boxShadow: "var(--shadow)" }}>
            {outcomes.map((o, i) => (
              <button key={o.id} onClick={() => setPickIdx(i)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-[14px] ${i === pickIdx ? "bg-primary-weak" : ""}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: i === 0 ? "var(--pos)" : i === 1 ? "var(--neg)" : "var(--primary)" }} />
                <span className="flex-1 text-left text-sm font-bold">{o.label}</span>
                <div className="w-40 h-[7px] rounded-[5px] bg-surface2 overflow-hidden">
                  <div className="h-full rounded-[5px]" style={{ width: `${prices[i] * 100}%`, background: i === 0 ? "var(--pos)" : i === 1 ? "var(--neg)" : "var(--primary)" }} />
                </div>
                <span className="mono text-sm w-12 text-right">{toCents(prices[i])}</span>
              </button>
            ))}
          </div>

          {/* ルール */}
          <div className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
            <h2 className="text-[15px] font-bold mb-2">解決ルール / Rules</h2>
            <p className="text-[13.5px] text-dim leading-relaxed">
              {market.description ? market.description + " " : ""}
              価格は LMSR により取引で変動し、確率＝価格として表示されます。獲得できるのは称号とランキング順位のみで、ポイントは換金できません。
            </p>
            {resolution && (
              <div className="mt-3 text-[12.5px] text-dim">
                確定: {new Date(resolution.resolved_at).toLocaleString("ja-JP")} · {resolution.resolution_kind}
                {resolution.source_url && <> · <a href={resolution.source_url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">根拠</a></>}
              </div>
            )}
          </div>
        </div>

        {/* 右カラム = トレードパネル */}
        <div className="flex-[1_1_320px] max-w-[392px] lg:sticky lg:top-[88px] w-full">
          <TradePanel market={market} outcomes={outcomes} prices={prices} resolution={resolution}
            pickIdx={pickIdx} setPickIdx={setPickIdx}
            onTraded={(id, q) => setOutcomes((prev) => prev.map((o) => (o.id === id ? { ...o, q } : o)))} />
        </div>
      </div>
    </div>
  );
}
