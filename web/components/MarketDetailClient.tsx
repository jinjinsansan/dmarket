"use client";
// 市場詳細（handoff §2）。左=ヘッダー＋チャート＋アウトカム＋ルール、右=トレードパネル(sticky)。
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lmsrPrices } from "@/lib/lmsr";
import { setRefCode, withRef } from "@/lib/ref";
import { toCents, timeRemaining, statusLabel } from "@/lib/format";
import type { MarketWithOutcomes, PricePoint, Resolution } from "@/lib/types";
import { ProbabilityChart } from "./ProbabilityChart";
import { RideBanner } from "./RideBanner";
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
  const [myCode, setMyCode] = useState<string | null>(null);
  const [ride, setRide] = useState<{ active: boolean; referrerName: string | null } | null>(null);
  const [rideCount, setRideCount] = useState(0);
  const [myWin, setMyWin] = useState(0);   // この市場での自分の的中受取pt（解決済み）
  const shareWin = () => {
    const url = withRef(`${window.location.origin}/win/${market.id}/${myWin}`);
    const text = `🎉 的中！「${market.question}」で +${myWin}pt もらいました！\nゴリラ予想で予想中🦍`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
  };
  const applyTraded = (id: string, q: number) => setOutcomes((prev) => prev.map((o) => (o.id === id ? { ...o, q } : o)));
  const shareMarket = () => {
    const ref = myCode ? `?ref=${myCode}` : "";
    const url = `${window.location.origin}/market/${market.id}${ref}`;
    const text = `${market.question}\nゴリラ予想で予想中🦍`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
  };

  // シェアから参加した人数（社会的証明・ログイン不要で全員に表示）
  useEffect(() => {
    createClient().rpc("market_ride_count", { p_market_id: market.id }).then(({ data }) => {
      if (typeof data === "number") setRideCount(data);
    });
  }, [market.id]);

  // 自分の紹介コード取得＋「乗っかり」帰属の記録（?ref= 経由の来訪）
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user) return;
      const { data: rc } = await sb.rpc("my_referral_code");
      if (rc?.code) { setMyCode(rc.code as string); setRefCode(rc.code as string); }
      if (market.status === "resolved") {
        const { data: pw } = await sb.from("pending_winnings").select("amount").eq("market_id", market.id).maybeSingle();
        if (pw?.amount && pw.amount > 0) setMyWin(pw.amount as number);
      }
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) {
        const { data: rr } = await sb.rpc("record_ride", { p_market_id: market.id, p_sharer_code: ref });
        if (rr?.ok) setRide({ active: true, referrerName: (rr.referrer_name as string) ?? null });
      }
    })();
  }, [market.id]);

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

  // シート表示中はスクロール領域(#app-scroll)をロック（裏スクロール防止）
  useEffect(() => {
    if (!sheetOpen) return;
    const scroller = document.getElementById("app-scroll");
    if (!scroller) return;
    const prev = scroller.style.overflow;
    scroller.style.overflow = "hidden";
    return () => { scroller.style.overflow = prev; };
  }, [sheetOpen]);

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
    <div className="max-w-[1240px] mx-auto px-4 md:px-[22px] py-6 pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pb-20 dm-in">
      <button onClick={() => router.push("/")} className="flex items-center gap-1.5 text-[13px] font-semibold text-dim hover:text-text pb-3.5">
        ← マーケット一覧へ戻る
      </button>

      <div className="flex flex-wrap gap-6 items-start">
        {/* 左カラム */}
        <div className="flex-[1_1_460px] flex flex-col gap-[18px] min-w-0">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[12px] font-extrabold text-primary">{market.category?.name ?? "市場"}</span>
              <span className="text-[11px] text-dim">· {statusLabel(market.status)}{isOpen ? ` · ${timeRemaining(market.close_time)}` : ""}</span>
              <button onClick={shareMarket} className="btn-press ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary-weak px-3 py-1.5 rounded-full hover:opacity-80">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M18.9 1.6h3.7l-8.1 9.2L24 22.4h-7.4l-5.8-7.6-6.7 7.6H.5l8.6-9.9L0 1.6h7.6l5.2 6.9 6.1-6.9Zm-1.3 18.6h2L6.5 3.7H4.3l13.3 16.5Z" /></svg>シェア
              </button>
            </div>
            <h1 className="text-[23px] font-extrabold leading-snug">{market.question}</h1>
            {rideCount >= 2 && (
              <span className="inline-flex items-center gap-1 mt-2 text-[11.5px] font-bold text-primary bg-primary-weak px-2.5 py-1 rounded-full">🔥 {rideCount}人がシェアから参加</span>
            )}
          </div>

          {ride?.active && <RideBanner marketId={market.id} referrerName={ride.referrerName} />}

          {myWin > 0 && (
            <div className="flex items-center gap-3 rounded-[14px] px-4 py-3 text-white" style={{ background: "linear-gradient(135deg,#2FD18C,#0E8E58)" }}>
              <span className="text-[15px] font-extrabold">🎉 的中！受取 +{myWin.toLocaleString()} pt</span>
              <button onClick={shareWin} className="btn-press ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-[#0E8E58] bg-white px-3.5 py-1.5 rounded-full shrink-0">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M18.9 1.6h3.7l-8.1 9.2L24 22.4h-7.4l-5.8-7.6-6.7 7.6H.5l8.6-9.9L0 1.6h7.6l5.2 6.9 6.1-6.9Zm-1.3 18.6h2L6.5 3.7H4.3l13.3 16.5Z" /></svg>
                的中をシェア
              </button>
            </div>
          )}

          {/* 確率＋チャート */}
          <div className="border border-border bg-surface rounded-[var(--radius)] p-5" style={{ boxShadow: "var(--shadow)" }}>
            <div className="flex items-end gap-3 mb-3">
              <span className="mono text-[46px] font-extrabold leading-none text-primary">{animatedPct}%</span>
              <div className="pb-1.5">
                {delta !== 0 && (
                  <span className={`text-[13px] font-bold ${delta >= 0 ? "text-pos" : "text-neg"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}pt</span>
                )}
                <p className="text-[12px] text-dim">{outcomes[0]?.label} の確率</p>
              </div>
            </div>
            <ProbabilityChart outcomes={outcomes} history={allHistory} color="var(--primary)" currentPct={yesPct} />
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
              価格は参加者の取引で動き、その価格がそのまま「予想される確率」を表します（例: YES 64% = 当たる見込み 64%）。当たると参加ポイントが払い戻され、予想の的中に応じて景品と交換できるゴリラコインが貯まります。参加ポイントは換金できません。
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
        <div className="hidden lg:block flex-[1_1_320px] max-w-[392px] lg:sticky lg:top-4 w-full">
          <TradePanel market={market} outcomes={outcomes} prices={prices} resolution={resolution}
            pickIdx={pickIdx} setPickIdx={setPickIdx} onTraded={applyTraded}
            rideActive={ride?.active} rideReferrer={ride?.referrerName ?? null} />
        </div>
      </div>

      {/* モバイル: 下部固定バー → ボトムシート（Polymarket流）。
          BottomNav（safe-area 含む）の上に配置し被りを防止。シート表示中は隠して
          backdrop-filter の再合成によるがくつきを避ける。 */}
      {!sheetOpen && (
        <div className="lg:hidden fixed left-0 right-0 z-40 bg-surface border-t border-border px-4 py-3"
          style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}>
          <button onClick={() => setSheetOpen(true)} className="w-full py-3 rounded-[12px] font-extrabold text-white"
            style={{ background: isOpen ? "var(--grad)" : "var(--faint)" }}>
            {isOpen ? "取引する / Trade" : "結果・詳細を見る"}
          </button>
        </div>
      )}

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 dm-fade" onClick={() => setSheetOpen(false)} />
          {/* 外側=transform アニメ専用 / 内側=スクロール。レイヤーを分けてがくつきを防止 */}
          <div className="absolute left-0 right-0 bottom-0 dm-sheet">
            <div className="bg-bg rounded-t-[20px] p-4 max-h-[88vh] overflow-y-auto overscroll-contain"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
              <div className="w-10 h-1 bg-border rounded-full mx-auto mb-3" />
              <TradePanel market={market} outcomes={outcomes} prices={prices} resolution={resolution}
                pickIdx={pickIdx} setPickIdx={setPickIdx} onTraded={applyTraded}
                rideActive={ride?.active} rideReferrer={ride?.referrerName ?? null} />
              <button onClick={() => setSheetOpen(false)} className="w-full mt-3 py-2 text-dim text-sm">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
