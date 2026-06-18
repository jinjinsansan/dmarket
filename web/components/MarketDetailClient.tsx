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
import { MarketTabs } from "./MarketTabs";
import { MarketCard } from "./MarketCard";
import { useAnimatedValue } from "@/lib/useAnimatedValue";

export function MarketDetailClient({
  market, resolution, history, related, initialPick,
}: {
  market: MarketWithOutcomes; resolution: Resolution | null; history: PricePoint[]; related: MarketWithOutcomes[]; initialPick: number;
}) {
  const router = useRouter();
  const [outcomes, setOutcomes] = useState([...market.outcomes].sort((a, b) => a.display_order - b.display_order));
  const [livePoints, setLivePoints] = useState<PricePoint[]>([]);
  const [pickIdx, setPickIdx] = useState(initialPick);
  const [sheetOpen, setSheetOpen] = useState(false);
  const vis = marketVisual({ id: market.id, slug: market.category?.slug, image_url: market.image_url });
  const applyTraded = (id: string, q: number) => setOutcomes((prev) => prev.map((o) => (o.id === id ? { ...o, q } : o)));

  useEffect(() => {
    const sb = createClient();
    let pendingQ: Record<string, { id: string; q: number }> = {};
    let pendingPts: PricePoint[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const ch = sb.channel(`market-${market.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "outcomes", filter: `market_id=eq.${market.id}` },
        (p) => { const n = p.new as { id: string; q: number }; pendingQ[n.id] = n; scheduleFlush(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "market_price_history", filter: `market_id=eq.${market.id}` },
        (p) => { pendingPts.push(p.new as PricePoint); scheduleFlush(); })
      .subscribe();

    function scheduleFlush() {
      if (!timer) {
        timer = setTimeout(() => {
          const qUpdates = Object.values(pendingQ);
          const ptUpdates = pendingPts;
          pendingQ = {};
          pendingPts = [];
          timer = null;
          if (qUpdates.length > 0) setOutcomes((prev) => prev.map((o) => { const u = qUpdates.find((up) => up.id === o.id); return u ? { ...o, q: u.q } : o; }));
          if (ptUpdates.length > 0) setLivePoints((prev) => [...prev, ...ptUpdates]);
        }, 100);
      }
    }
    return () => { sb.removeChannel(ch); if (timer) clearTimeout(timer); };
  }, [market.id]);

  const prices = useMemo(() => lmsrPrices(outcomes.map((o) => o.q), market.b_param), [outcomes, market.b_param]);
  const allHistory = useMemo(() => [...history, ...livePoints], [history, livePoints]);
  const isOpen = market.status === "open" && new Date(market.close_time).getTime() > Date.now();

  // チャート用: 先頭アウトカムの確率変化
  const yesPct = prices[0] * 100;
  const animatedPct = useAnimatedValue(Math.round(yesPct));
  // 直近の履歴点との差分（▲▼）
  const yesHist = allHistory.filter((p) => p.outcome_id === outcomes[0]?.id);
  const prevPct = yesHist.length >= 1 ? Math.round((yesHist[yesHist.length - 1]?.price ?? prices[0]) * 100) : Math.round(yesPct);
  const delta = Math.round(yesPct) - prevPct;

  return (
    <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-6 pb-32 lg:pb-20 dm-in">
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
            <div className="flex items-end gap-3 mb-3">
              <span className="mono text-[42px] font-bold leading-none" style={{ color: vis.tint }}>{animatedPct}%</span>
              <div className="pb-1.5">
                {delta !== 0 && (
                  <span className={`text-[13px] font-bold ${delta >= 0 ? "text-pos" : "text-neg"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}pt</span>
                )}
                <p className="text-[12px] text-dim">{outcomes[0]?.label} の確率</p>
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

          {/* タブ: 注文板 / 保有者 / 取引履歴 / コメント */}
          <MarketTabs marketId={market.id} outcomes={outcomes} bParam={market.b_param} prices={prices} />

          {/* ルール */}
          <div className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
            <h2 className="text-[15px] font-bold mb-2">解決ルール / Rules</h2>
            <p className="text-[13.5px] text-dim leading-relaxed">
              {market.description ? market.description + " " : ""}
              価格は参加者の取引で動き、その価格がそのまま「予想される確率」を表します（例: YES 64% = 当たる見込み 64%）。得られるのは称号とランキング順位だけで、ポイントは換金できません。
            </p>
            {resolution && (
              <div className="mt-3 text-[12.5px] text-dim">
                確定: {new Date(resolution.resolved_at).toLocaleString("ja-JP")} · {resolution.resolution_kind}
                {resolution.source_url && <> · <a href={resolution.source_url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">根拠</a></>}
              </div>
            )}
          </div>

          {/* 関連マーケット（§3.1C） */}
          {related.length > 0 && (
            <div>
              <h2 className="text-[15px] font-bold mb-2">関連マーケット</h2>
              <div className="flex flex-col gap-2">
                {related.slice(0, 4).map((m) => <MarketCard key={m.id} market={m} variant="compact" />)}
              </div>
            </div>
          )}
        </div>

        {/* 右カラム = トレードパネル（デスクトップのみ） */}
        <div className="hidden lg:block flex-[1_1_320px] max-w-[392px] lg:sticky lg:top-[88px] w-full">
          <TradePanel market={market} outcomes={outcomes} prices={prices} resolution={resolution}
            pickIdx={pickIdx} setPickIdx={setPickIdx} onTraded={applyTraded} />
        </div>
      </div>

      {/* モバイル: 下部固定バー → ボトムシート（Polymarket流） */}
      <div className="lg:hidden fixed left-0 right-0 bottom-16 z-50 bg-surface/95 backdrop-blur border-t border-border px-4 py-3">
        <button onClick={() => setSheetOpen(true)} className="w-full py-3 rounded-[12px] font-extrabold text-white"
          style={{ background: isOpen ? "var(--grad)" : "var(--faint)" }}>
          {isOpen ? "取引する / Trade" : "結果・詳細を見る"}
        </button>
      </div>

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 dm-fade" onClick={() => setSheetOpen(false)} />
          <div className="absolute left-0 right-0 bottom-0 bg-bg rounded-t-[20px] p-4 max-h-[88vh] overflow-y-auto dm-sheet">
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-3" />
            <TradePanel market={market} outcomes={outcomes} prices={prices} resolution={resolution}
              pickIdx={pickIdx} setPickIdx={setPickIdx} onTraded={applyTraded} />
            <button onClick={() => setSheetOpen(false)} className="w-full mt-3 py-2 text-dim text-sm">閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
