"use client";
// ピックアップ1本集中トップの結線。サーバーから現在のピックアップ市場を受け取り、
// PickupTop に整形して渡す。乗る=金額→株数換算で buy_shares、コメントは Realtime 購読。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lmsrPrices } from "@/lib/lmsr";
import { POINTS_PER_SHARE } from "@/lib/constants";
import { withRef } from "@/lib/ref";
import { PickupTop } from "./PickupTop";
import { Toast, type ToastKind } from "./Toast";
import type { LiveComment } from "./LiveComments";
import type { RankLevel } from "./AvatarFrame";
import type { MarketWithOutcomes } from "@/lib/types";

type CommentRow = { id: number; body: string; display_name: string; avatar_url: string | null; rank_level: number; holding: string | null };

function toLive(rows: CommentRow[], newestId?: number): LiveComment[] {
  return rows.map((c) => ({
    id: String(c.id),
    name: c.display_name,
    avatarUrl: c.avatar_url,
    level: (c.rank_level || 1) as RankLevel,
    text: c.body,
    side: c.holding === "YES" ? "yes" : c.holding === "NO" ? "no" : undefined,
    isNew: newestId != null && c.id === newestId,
  }));
}

export function PickupHome({
  market, spark, participants: initialParticipants, next,
  initialComments,
}: {
  market: MarketWithOutcomes | null;
  spark: number[];
  participants: number;
  next: { market_id: string; time_label: string; question: string; slot_start: string } | null;
  initialComments: CommentRow[];
}) {
  const router = useRouter();
  const [outcomesQ, setOutcomesQ] = useState<number[]>(() => (market?.outcomes ?? []).map((o) => o.q));
  const [comments, setComments] = useState<CommentRow[]>(initialComments);
  const [newestId, setNewestId] = useState<number | undefined>(undefined);
  const [participants, setParticipants] = useState(initialParticipants);
  const [holdings, setHoldings] = useState<{ id: string; label: string; side: "yes" | "no"; pnl: number }[]>([]);
  const [holdingCount, setHoldingCount] = useState(0);
  const [toast, setToast] = useState<{ title: string; sub?: string; kind: ToastKind } | null>(null);
  const [busy, setBusy] = useState(false);
  const marketId = market?.id;

  const showToast = (title: string, sub?: string, kind: ToastKind = "success") => {
    setToast({ title, sub, kind }); setTimeout(() => setToast(null), 2600);
  };

  // 現在価格（YES=outcomes[0], NO=outcomes[1]）
  const prices = useMemo(() => (market ? lmsrPrices(outcomesQ, market.b_param) : [0.5, 0.5]), [outcomesQ, market]);
  const yesPct = Math.round((prices[0] ?? 0.5) * 100);
  const deltaPct = spark.length > 1 ? Math.round((spark[spark.length - 1] ?? yesPct) - (spark[0] ?? yesPct)) : 0;

  const pickup = market
    ? {
        kind: "question" as const,
        category: market.category?.name ?? "ピックアップ",
        question: market.question,
        yesPct,
        deltaPct,
        yesPrice: yesPct,
        spark: spark.length > 1 ? spark : [yesPct, yesPct],
      }
    : null;

  // 保有ポジション（控えめ導線）
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user) return;
      const { data } = await sb
        .from("positions")
        .select("shares, cost_basis, outcome:outcomes(id, label, display_order, market_id, market:markets(id, question))")
        .gt("shares", 0);
      type Pos = { shares: number; cost_basis: number; outcome: { display_order: number; market_id: string; market: { id: string; question: string } | null } | null };
      const rows = ((data as unknown as Pos[]) ?? []).filter((p) => p.outcome?.market);
      setHoldingCount(rows.length);
      setHoldings(rows.slice(0, 8).map((p) => ({
        id: p.outcome!.market!.id,
        label: p.outcome!.market!.question,
        side: (p.outcome!.display_order === 0 ? "yes" : "no") as "yes" | "no",
        pnl: Math.round((p.shares * POINTS_PER_SHARE) - p.cost_basis),
      })));
    })();
  }, []);

  // Realtime コメント購読 → market_comments を取り直して整形
  const refetchComments = useCallback(async () => {
    if (!marketId) return;
    const sb = createClient();
    const { data } = await sb.rpc("market_comments", { p_market_id: marketId });
    const rows = (data as CommentRow[]) ?? [];
    setComments(rows);
    setNewestId(rows.length ? rows[rows.length - 1].id : undefined);
  }, [marketId]);

  useEffect(() => {
    if (!marketId) return;
    const sb = createClient();
    const ch = sb
      .channel(`pickup-comments-${marketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `market_id=eq.${marketId}` }, () => { refetchComments(); })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [marketId, refetchComments]);

  // 参加人数を定期更新
  useEffect(() => {
    if (!marketId) return;
    const sb = createClient();
    const id = setInterval(async () => {
      const { data } = await (sb.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>)("pickup_participants", { p_market_id: marketId });
      if (typeof data === "number") setParticipants(data);
    }, 60000);
    return () => clearInterval(id);
  }, [marketId]);

  // 次スロット時刻を過ぎたら現在のピックアップを取り直す（毎時0分切替）
  useEffect(() => {
    if (!next?.slot_start) return;
    const target = new Date(next.slot_start).getTime();
    const id = setInterval(() => { if (Date.now() >= target) router.refresh(); }, 15000);
    return () => clearInterval(id);
  }, [next?.slot_start, router]);

  async function onBet(side: "yes" | "no", amount: number) {
    if (!market || busy) return;
    const idx = side === "yes" ? 0 : 1;
    const outcome = market.outcomes[idx];
    if (!outcome) return;
    if (!amount || amount <= 0) { showToast("金額を入力してください", undefined, "info"); return; }
    const price = prices[idx] ?? 0.5;
    const shares = Math.max(1, Math.round(amount / Math.max(1, price * POINTS_PER_SHARE)));
    setBusy(true);
    const sb = createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) { window.location.href = "/api/auth/line/login"; return; }
    const { data, error } = await sb.rpc("buy_shares", { p_outcome_id: outcome.id, p_shares: shares });
    setBusy(false);
    if (error) {
      const m = (error.message || "").trim();
      showToast(m === "insufficient_balance" ? "参加ポイントが足りません" : m === "market_closed" ? "この市場は締め切られました" : "エラーが発生しました", undefined, "error");
      return;
    }
    if (data?.ok) {
      setOutcomesQ((q) => { const n = q.slice(); n[idx] += shares; return n; });
      window.dispatchEvent(new Event("wallet:refresh"));
      showToast(`${outcome.label}に乗りました`, `${shares}株`, "success");
    }
  }

  function onShare() {
    if (!market) return;
    const url = withRef(`${window.location.origin}/market/${market.id}`);
    const text = `「${market.question}」を予想中🦍 今のピックアップ市場！`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  }

  const liveComments = toLive(comments.slice(-30), newestId);
  const closesAt = market?.close_time;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", height: "calc(100dvh - 60px)" }}>
      <PickupTop
        live={false}
        closesAt={closesAt}
        participants={participants}
        pickup={pickup ? { ...pickup, onBet, onShare } as never : null}
        next={next ? { at: next.slot_start, timeLabel: next.time_label, title: next.question } : null}
        comments={liveComments}
        holdingCount={holdingCount}
        holdings={holdings}
      />
      {toast && <Toast title={toast.title} sub={toast.sub} kind={toast.kind} onClose={() => setToast(null)} />}
    </div>
  );
}
