"use client";
// トレードパネル（handoff §2 右カラム）。金額(pt)入力→株数換算、クイックチップ、サマリ、CTA。
// プレビューはクライアントLMSR、確定値はRPC戻り値。
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buyCostPreview, sellRecvPreview, lmsrPrice } from "@/lib/lmsr";
import { formatPoints, toCents, statusLabel } from "@/lib/format";
import { POINTS_PER_SHARE } from "@/lib/constants";
import type { MarketWithOutcomes, Outcome, Resolution } from "@/lib/types";

const ERROR_JA: Record<string, string> = {
  insufficient_balance: "ポイントが足りません。デイリーボーナスを受け取れます。",
  market_closed: "この市場は締め切られました。",
  insufficient_shares: "売却できる株数が足りません。",
  trade_too_small: "取引量が小さすぎます。",
  not_authenticated: "ログインが必要です（LINEログインは準備中）。",
};
const CHIPS = [25, 100, 500];

export function TradePanel({
  market, outcomes, prices, resolution, pickIdx, setPickIdx, onTraded,
}: {
  market: MarketWithOutcomes; outcomes: Outcome[]; prices: number[]; resolution: Resolution | null;
  pickIdx: number; setPickIdx: (i: number) => void; onTraded: (outcomeId: string, newQ: number) => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
      setBalance(data?.balance ?? 0);
    })();
  }, []);

  const isOpen = market.status === "open" && new Date(market.close_time).getTime() > Date.now();
  const q = useMemo(() => outcomes.map((o) => o.q), [outcomes]);
  const price = prices[pickIdx] ?? 0.5;

  // 金額(pt) → 株数換算（現在価格基準。最低1株）
  const shares = useMemo(() => Math.max(1, Math.round(amount / Math.max(1, price * POINTS_PER_SHARE))), [amount, price]);

  const preview = useMemo(() => {
    if (shares <= 0) return null;
    const points = side === "buy" ? buyCostPreview(q, market.b_param, pickIdx, shares) : sellRecvPreview(q, market.b_param, pickIdx, shares);
    const q2 = q.slice(); q2[pickIdx] += side === "buy" ? shares : -shares;
    const after = lmsrPrice(q2, market.b_param, pickIdx);
    const avg = points / shares / POINTS_PER_SHARE;
    return { points, after, avg };
  }, [q, shares, pickIdx, side, market.b_param]);

  async function submit() {
    setBusy(true); setMsg(null);
    const sb = createClient();
    const fn = side === "buy" ? "buy_shares" : "sell_shares";
    const { data, error } = await sb.rpc(fn, { p_outcome_id: outcomes[pickIdx].id, p_shares: shares });
    setBusy(false);
    if (error) { setMsg(ERROR_JA[(error.message || "").trim()] ?? "エラーが発生しました。"); return; }
    if (data?.ok) {
      onTraded(outcomes[pickIdx].id, q[pickIdx] + (side === "buy" ? shares : -shares));
      window.dispatchEvent(new Event("wallet:refresh"));
      if (typeof data.balance === "number") setBalance(data.balance);
      setMsg(`${outcomes[pickIdx].label}を${shares}株${side === "buy" ? "購入" : "売却"}しました`);
    }
  }

  // 解決済み / 中止
  if (market.status === "resolved" || market.status === "void") {
    const winner = outcomes.find((o) => o.is_winner);
    return (
      <Panel>
        <h3 className="font-bold mb-2">結果 / Result</h3>
        {market.status === "void"
          ? <p className="text-sm text-dim">この市場は中止され、取得ポイントは返金されました。</p>
          : <p className="text-sm">勝ち: <b className="text-pos">{winner?.label ?? "—"}</b></p>}
        {resolution?.source_url && <a href={resolution.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline break-all">根拠を見る</a>}
      </Panel>
    );
  }
  if (!isOpen) {
    return <Panel><p className="text-sm text-dim">{statusLabel(market.status)}です。解決をお待ちください。</p></Panel>;
  }

  return (
    <Panel>
      <div className="grid grid-cols-2 gap-1 p-1 bg-surface2 rounded-[11px] mb-4">
        <SideBtn active={side === "buy"} kind="pos" onClick={() => setSide("buy")}>買う / Buy</SideBtn>
        <SideBtn active={side === "sell"} kind="neg" onClick={() => setSide("sell")}>売る / Sell</SideBtn>
      </div>

      <div className="space-y-1.5 mb-4">
        {outcomes.map((o, i) => (
          <button key={o.id} onClick={() => setPickIdx(i)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] text-sm font-bold border-[1.5px] ${i === pickIdx ? "border-primary bg-primary-weak" : "border-border bg-surface"}`}>
            <span>{o.label}</span><span className="mono">{toCents(prices[i])}</span>
          </button>
        ))}
      </div>

      <div className="text-[12.5px] font-bold text-dim mb-2">金額 (pt)</div>
      <div className="flex items-center border border-border rounded-[11px] bg-surface2 px-3.5 mb-2">
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))}
          className="mono flex-1 bg-transparent outline-none text-right text-[22px] font-bold py-3" />
        <span className="text-dim text-sm ml-1">pt</span>
      </div>
      <div className="flex gap-1.5 mb-4">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => setAmount((a) => a + c)}
            className="flex-1 text-[12.5px] font-bold py-1.5 border border-border rounded-lg bg-surface text-dim hover:text-text">+{c}</button>
        ))}
        <button onClick={() => setAmount(balance ?? 1000)}
          className="flex-1 text-[12.5px] font-bold py-1.5 border border-border rounded-lg bg-surface text-dim hover:text-text">MAX</button>
      </div>

      {preview && (
        <div className="space-y-1.5 text-[13px] mb-4">
          <Row label="平均価格" value={`${toCents(preview.avg)}`} />
          <Row label="株数" value={`${formatPoints(shares)} 株`} />
          {side === "buy" ? (
            <>
              <Row label="的中時の受取" value={`${formatPoints(shares * POINTS_PER_SHARE)} pt`} />
              <Row label="想定リターン" value={`+${formatPoints(shares * POINTS_PER_SHARE - preview.points)} pt`} pos />
            </>
          ) : (
            <>
              <Row label="受取見込み" value={`${formatPoints(preview.points)} pt`} />
              <Row label="約定後価格" value={toCents(preview.after)} />
            </>
          )}
          <p className="text-[11px] text-faint pt-1">※「予想」値です。確定値は約定時に確定します。</p>
        </div>
      )}

      <button onClick={submit} disabled={busy}
        className="w-full font-extrabold text-[15.5px] py-3.5 rounded-[12px] text-white disabled:opacity-50"
        style={{ background: side === "buy" ? "var(--pos)" : "var(--neg)" }}>
        {busy ? "処理中…" : `${outcomes[pickIdx]?.label}を${side === "buy" ? "買う" : "売る"}`}
      </button>

      {msg && <p className="text-sm text-center text-dim mt-2.5">{msg}</p>}
      <p className="text-[11.5px] text-faint text-center mt-3 leading-relaxed">換金不可・賞品ゼロ / No cash-out — glory only</p>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="border border-border bg-surface rounded-[var(--radius)] p-[18px]" style={{ boxShadow: "var(--shadow)" }}>{children}</div>;
}
function SideBtn({ active, kind, onClick, children }: { active: boolean; kind: "pos" | "neg"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="font-bold text-sm py-2.5 rounded-lg"
      style={active ? { background: kind === "pos" ? "var(--pos)" : "var(--neg)", color: "#fff" } : { color: "var(--dim)" }}>
      {children}
    </button>
  );
}
function Row({ label, value, pos }: { label: string; value: string; pos?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-dim">{label}</span>
      <span className={`mono ${pos ? "text-pos" : ""}`}>{value}</span>
    </div>
  );
}
