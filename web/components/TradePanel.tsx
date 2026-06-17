"use client";
// トレードパネル（SPEC-05 §5）。プレビューはクライアントLMSR、確定値はRPC戻り値。
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buyCostPreview, sellRecvPreview, lmsrPrice } from "@/lib/lmsr";
import { formatPoints, toPct, statusLabel } from "@/lib/format";
import type { MarketWithOutcomes, Outcome, Resolution } from "@/lib/types";

const ERROR_JA: Record<string, string> = {
  insufficient_balance: "ポイントが足りません。デイリーボーナスを受け取れます。",
  market_closed: "この市場は締め切られました。",
  insufficient_shares: "売却できる株数が足りません。",
  trade_too_small: "取引量が小さすぎます。",
  not_authenticated: "ログインが必要です（LINEログインは準備中）。",
};

export function TradePanel({
  market,
  outcomes,
  prices,
  resolution,
  onTraded,
}: {
  market: MarketWithOutcomes;
  outcomes: Outcome[];
  prices: number[];
  resolution: Resolution | null;
  onTraded: (newQById: Record<string, number>) => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [idx, setIdx] = useState(0);
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isOpen = market.status === "open" && new Date(market.close_time).getTime() > Date.now();
  const q = useMemo(() => outcomes.map((o) => o.q), [outcomes]);

  const preview = useMemo(() => {
    if (!qty || qty <= 0) return null;
    const points = side === "buy" ? buyCostPreview(q, market.b_param, idx, qty) : sellRecvPreview(q, market.b_param, idx, qty);
    const q2 = q.slice();
    q2[idx] += side === "buy" ? qty : -qty;
    const after = lmsrPrice(q2, market.b_param, idx);
    return { points, before: prices[idx], after };
  }, [q, qty, idx, side, market.b_param, prices]);

  async function submit() {
    if (!qty || qty <= 0) return;
    setBusy(true);
    setMsg(null);
    const sb = createClient();
    const fn = side === "buy" ? "buy_shares" : "sell_shares";
    const { data, error } = await sb.rpc(fn, { p_outcome_id: outcomes[idx].id, p_shares: qty });
    setBusy(false);
    if (error) {
      const key = (error.message || "").trim();
      setMsg(ERROR_JA[key] ?? "エラーが発生しました。時間をおいて再度お試しください。");
      return;
    }
    if (data?.ok) {
      const newQ = q[idx] + (side === "buy" ? qty : -qty);
      onTraded({ [outcomes[idx].id]: newQ });
      window.dispatchEvent(new Event("wallet:refresh"));
      const label = outcomes[idx].label;
      setMsg(side === "buy" ? `${label}を${qty}株購入しました` : `${label}を${qty}株売却しました`);
    }
  }

  // ── 解決済み: 結果カード ──
  if (market.status === "resolved" || market.status === "void") {
    const winner = outcomes.find((o) => o.is_winner);
    return (
      <div className="rounded-[var(--radius)] border border-border bg-surface p-4">
        <h3 className="font-medium mb-2">結果</h3>
        {market.status === "void" ? (
          <p className="text-sm text-dim">この市場は中止され、取得ポイントは返金されました。</p>
        ) : (
          <p className="text-sm">
            勝ち: <b className="text-[var(--pos)]">{winner?.label ?? "—"}</b>
          </p>
        )}
        {resolution?.source_url && (
          <a href={resolution.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline break-all">
            根拠を見る
          </a>
        )}
      </div>
    );
  }

  // ── 取引停止中 ──
  if (!isOpen) {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-surface p-4 text-sm text-dim">
        {statusLabel(market.status)}です。解決をお待ちください。
      </div>
    );
  }

  // ── 取引中 ──
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4 space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-sm bg-surface-2 p-1 text-sm">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`rounded-sm py-1.5 ${side === s ? "bg-primary text-white" : "text-dim"}`}
          >
            {s === "buy" ? "買う" : "売る"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {outcomes.map((o, i) => (
          <button
            key={o.id}
            onClick={() => setIdx(i)}
            className={`num rounded-sm px-3 py-1.5 text-sm border ${
              idx === i ? "border-primary text-text" : "border-border text-dim"
            }`}
          >
            {o.label} {toPct(prices[i])}
          </button>
        ))}
      </div>

      <label className="block text-xs text-dim">
        数量（株）
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value))))}
          className="num mt-1 w-full rounded-sm border border-border bg-surface-2 px-3 py-2 text-text outline-none focus:border-primary"
        />
      </label>

      {preview && (
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-dim">{side === "buy" ? "予想コスト" : "予想受取"}</span>
            <span className="num">{formatPoints(preview.points)} pt</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dim">約定後{outcomes[idx].label}</span>
            <span className="num">{toPct(preview.before)} → {toPct(preview.after)}</span>
          </div>
          <p className="text-[11px] text-dim">※「予想」値です。確定値は約定後に確定します。</p>
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !qty}
        className="w-full rounded-[var(--radius)] bg-primary py-2.5 text-white font-medium disabled:opacity-50"
      >
        {busy ? "処理中…" : `${outcomes[idx].label}を${side === "buy" ? "買う" : "売る"}`}
      </button>

      {msg && <p className="text-sm text-center text-dim">{msg}</p>}
    </div>
  );
}
