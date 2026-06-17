"use client";
// ポートフォリオ（SPEC-05 §6）。残高・保有（含み損益）・取引履歴。
// 認証は LINEログイン後回しのため、未ログイン時はログイン誘導。
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { lmsrPrice } from "@/lib/lmsr";
import { formatPoints, pnlText } from "@/lib/format";
import { LEDGER_REASON_LABEL } from "@/lib/constants";
import type { LedgerRow } from "@/lib/types";

interface Holding {
  marketId: string;
  question: string;
  label: string;
  shares: number;
  costBasis: number;
  value: number; // 現在価格で売却した場合の概算受取
}

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [balance, setBalance] = useState(0);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }
      setLoggedIn(true);

      const [{ data: wallet }, { data: positions }, { data: led }] = await Promise.all([
        sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        sb.from("positions").select("shares, cost_basis, outcome:outcomes(id, label, market_id)").gt("shares", 0),
        sb.from("point_ledger").select("id, delta, reason, shares, balance_after, created_at").order("created_at", { ascending: false }).limit(50),
      ]);
      setBalance(wallet?.balance ?? 0);
      setLedger((led as LedgerRow[]) ?? []);

      // 含み損益のため、保有市場の全outcomeのqを取得して現在価格を計算
      const posList = (positions ?? []) as unknown as {
        shares: number; cost_basis: number; outcome: { id: string; label: string; market_id: string };
      }[];
      const marketIds = [...new Set(posList.map((p) => p.outcome.market_id))];
      const hs: Holding[] = [];
      if (marketIds.length) {
        const { data: markets } = await sb
          .from("markets").select("id, question, b_param, outcomes(id, q, display_order)").in("id", marketIds);
        const mById = new Map((markets ?? []).map((m) => [m.id, m]));
        for (const p of posList) {
          const m = mById.get(p.outcome.market_id);
          if (!m) continue;
          const os = [...m.outcomes].sort((a, b) => a.display_order - b.display_order);
          const k = os.findIndex((o) => o.id === p.outcome.id);
          const price = lmsrPrice(os.map((o) => o.q), m.b_param, k);
          hs.push({
            marketId: m.id,
            question: m.question,
            label: p.outcome.label,
            shares: p.shares,
            costBasis: p.cost_basis,
            value: Math.floor(price * 100 * p.shares),
          });
        }
      }
      setHoldings(hs);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-dim text-sm py-16 text-center">読み込み中…</p>;

  if (!loggedIn) {
    return (
      <div className="py-16 text-center">
        <p className="text-dim mb-3">ポートフォリオを見るにはログインが必要です。</p>
        <p className="text-xs text-dim">LINEログインは現在準備中です。</p>
      </div>
    );
  }

  const holdValue = holdings.reduce((s, h) => s + h.value, 0);
  const holdCost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const unrealized = holdValue - holdCost;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">ポートフォリオ</h1>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="残高" value={`${formatPoints(balance)} pt`} />
        <Stat label="保有評価" value={`${formatPoints(holdValue)} pt`} />
        <Stat label="含み損益" value={pnlText(unrealized).text} cls={pnlText(unrealized).cls} />
      </div>

      <section>
        <h2 className="text-sm font-medium mb-2">アクティブ保有</h2>
        {holdings.length === 0 ? (
          <p className="text-dim text-sm">
            まだ予想がありません。<Link href="/" className="text-primary underline">市場を見る →</Link>
          </p>
        ) : (
          <div className="divide-y divide-border rounded-[var(--radius)] border border-border">
            {holdings.map((h, i) => {
              const pnl = pnlText(h.value - h.costBasis);
              return (
                <Link key={i} href={`/market/${h.marketId}`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
                  <span className="flex-1 text-sm truncate">{h.question}</span>
                  <span className="num text-xs text-dim">{h.label} {h.shares}株</span>
                  <span className={`num text-sm ${pnl.cls}`}>{pnl.text}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">取引履歴</h2>
        <div className="divide-y divide-border rounded-[var(--radius)] border border-border">
          {ledger.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="text-dim text-xs w-32">{new Date(l.created_at).toLocaleString("ja-JP")}</span>
              <span className="flex-1">{LEDGER_REASON_LABEL[l.reason] ?? l.reason}</span>
              <span className={`num ${l.delta >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}`}>
                {l.delta >= 0 ? "+" : ""}{formatPoints(l.delta)}
              </span>
              <span className="num text-xs text-dim w-20 text-right">{formatPoints(l.balance_after)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-3">
      <div className="text-xs text-dim">{label}</div>
      <div className={`num text-lg mt-1 ${cls ?? ""}`}>{value}</div>
    </div>
  );
}
