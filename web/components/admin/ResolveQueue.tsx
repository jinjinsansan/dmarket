"use client";
// 解決キュー（SPEC-07 §6）。手動市場(close後)＋自動解決の失敗を確定/中止。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MarketWithOutcomes } from "@/lib/types";

export function ResolveQueue({ notify }: { notify: (m: string) => void }) {
  const [queue, setQueue] = useState<MarketWithOutcomes[]>([]);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data } = await sb
      .from("markets").select("*, outcomes(*)")
      .eq("resolution_kind", "manual").in("status", ["open", "closed"])
      .lte("resolve_time", new Date().toISOString());
    setQueue((data as MarketWithOutcomes[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (queue.length === 0) return <p className="text-dim text-sm">解決待ちの市場はありません。</p>;
  return (
    <div className="space-y-2">
      {queue.map((m) => <Row key={m.id} market={m} done={(t) => { notify(t); load(); }} />)}
    </div>
  );
}

function Row({ market, done }: { market: MarketWithOutcomes; done: (m: string) => void }) {
  const outcomes = [...market.outcomes].sort((a, b) => a.display_order - b.display_order);
  const [winner, setWinner] = useState(outcomes[0]?.id ?? "");
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: "admin_resolve" | "admin_void") {
    setBusy(true);
    const sb = createClient();
    const params = fn === "admin_resolve"
      ? { p_market_id: market.id, p_winning_outcome_id: winner, p_source_url: src }
      : { p_market_id: market.id, p_reason: src || "中止" };
    const { error } = await sb.rpc(fn, params);
    setBusy(false);
    done(error ? `失敗: ${error.message}` : `「${market.question}」を処理しました`);
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-3 space-y-2">
      <p className="text-sm">{market.question}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={winner} onChange={(e) => setWinner(e.target.value)} className="rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm">
          {outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="根拠ソースURL"
          className="flex-1 min-w-40 rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm" />
        <button onClick={() => run("admin_resolve")} disabled={busy} className="rounded-sm bg-primary text-white px-3 py-1 text-sm disabled:opacity-50">確定</button>
        <button onClick={() => run("admin_void")} disabled={busy} className="rounded-sm border border-border text-dim px-3 py-1 text-sm">中止</button>
      </div>
    </div>
  );
}
