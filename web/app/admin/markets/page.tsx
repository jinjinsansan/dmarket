"use client";
// 管理: 市場マネージャ（全市場一覧・b調整・締切編集・非表示/表示・中止）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { formatPoints } from "@/lib/format";
import { statusLabel } from "@/lib/format";

interface MktRow {
  id: string; question: string; category: string | null; source: string; status: string;
  b_param: number; close_time: string; resolve_time: string; outcome_count: number;
  volume: number; holders: number; created_at: string;
}
const STATUSES = ["", "open", "closed", "resolved", "void", "draft"];
const maxSubsidy = (b: number) => Math.round(b * Math.log(2) * 100);

export default function AdminMarketsPage() {
  const notify = useAdminToast();
  const [rows, setRows] = useState<MktRow[]>([]);
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_list_markets", { p_status: status || null });
    if (error) { notify(`取得失敗: ${error.message}`); return; }
    setRows((data as MktRow[]) ?? []);
  }, [status, notify]);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`text-sm rounded-full px-3 py-1.5 border ${status === s ? "border-primary bg-primary/10 text-text" : "border-border text-dim hover:text-text"}`}>
            {s === "" ? "すべて" : statusLabel(s)}
          </button>
        ))}
        <span className="text-xs text-dim ml-auto">{rows.length}件</span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border" style={{ boxShadow: "var(--shadow)" }}>
        <table className="w-full text-sm">
          <thead className="text-dim text-xs">
            <tr className="border-b border-border">
              <th className="text-left p-3">市場</th>
              <th className="p-3">源</th>
              <th className="p-3">状態</th>
              <th className="num p-3 text-right">b</th>
              <th className="num p-3 text-right">出来高</th>
              <th className="num p-3 text-right">保有者</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <MarketRow key={m.id} m={m} open={openId === m.id}
                onToggle={() => setOpenId(openId === m.id ? null : m.id)} onChanged={load} notify={notify} />
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-dim">市場がありません</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MarketRow({ m, open, onToggle, onChanged, notify }: {
  m: MktRow; open: boolean; onToggle: () => void; onChanged: () => void; notify: (msg: string) => void;
}) {
  const [b, setB] = useState(m.b_param);
  const [close, setClose] = useState(m.close_time.slice(0, 16));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await createClient().rpc("admin_update_market", {
      p_market_id: m.id, p_b: b, p_close_time: new Date(close).toISOString(),
      p_resolve_time: new Date(close).toISOString(), p_question: null, p_image_url: null,
    });
    setBusy(false);
    notify(error ? `保存失敗: ${error.message}` : "保存しました（価格に即反映）"); onChanged();
  }
  async function act(kind: "hide" | "show" | "void") {
    if (kind === "void" && !confirm(`「${m.question}」を中止しますか？保有者には取得pt返金されます。`)) return;
    setBusy(true);
    const sb = createClient();
    const { error } = kind === "void"
      ? await sb.rpc("admin_void", { p_market_id: m.id, p_reason: "管理者による中止" })
      : await sb.rpc("admin_set_market_status", { p_market_id: m.id, p_status: kind === "hide" ? "draft" : "open" });
    setBusy(false);
    notify(error ? `失敗: ${error.message}` : kind === "void" ? "中止しました" : kind === "hide" ? "非表示にしました" : "表示にしました");
    onChanged();
  }

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-surface2 cursor-pointer" onClick={onToggle}>
        <td className="p-3 max-w-0"><div className="truncate font-medium">{m.question}</div><div className="text-[11px] text-dim">{m.category ?? "—"}</div></td>
        <td className="p-3 text-center text-xs text-dim">{m.source}</td>
        <td className="p-3 text-center text-xs">{statusLabel(m.status)}</td>
        <td className="num p-3 text-right">{m.b_param}</td>
        <td className="num p-3 text-right text-dim">{formatPoints(Math.round(m.volume))}</td>
        <td className="num p-3 text-right text-dim">{m.holders}</td>
        <td className="p-3 text-dim text-xs">{open ? "▲" : "▼"}</td>
      </tr>
      {open && (
        <tr><td colSpan={7} className="bg-surface2 p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-3 items-end">
                <label className="text-xs text-dim flex flex-col gap-1">流動性 b（小=価格が動きやすい/補助金小）
                  <input type="number" value={b} onChange={(e) => setB(Number(e.target.value))} className="num w-24 rounded-sm border border-border bg-surface px-2 py-1.5" />
                </label>
                <label className="text-xs text-dim flex flex-col gap-1">締切
                  <input type="datetime-local" value={close} onChange={(e) => setClose(e.target.value)} className="rounded-sm border border-border bg-surface px-2 py-1.5 text-sm" />
                </label>
                <button onClick={save} disabled={busy} className="rounded-sm bg-primary text-white px-4 py-2 text-sm font-bold">保存</button>
              </div>
              <p className="text-[11px] text-faint">最大補助金（インフレ上限）= b×ln(2)×100 ≈ <b className="num">{formatPoints(maxSubsidy(b))}</b> pt。薄商い期は b を下げると健全。</p>
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <button onClick={() => act("hide")} disabled={busy} className="rounded-sm border border-border px-3 py-1.5 text-sm text-dim hover:text-text">非表示（下書きへ）</button>
              <button onClick={() => act("show")} disabled={busy} className="rounded-sm border border-border px-3 py-1.5 text-sm text-dim hover:text-text">表示（公開へ）</button>
              <button onClick={() => act("void")} disabled={busy} className="rounded-sm border border-neg/50 text-neg px-3 py-1.5 text-sm">中止（返金）</button>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}
