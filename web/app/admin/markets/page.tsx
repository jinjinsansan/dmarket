"use client";
// 管理: 市場マネージャ（テーブル型）。状態/源フィルタ＋一覧＋展開（解決・b調整・締切・非表示/中止）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { formatPoints, statusLabel } from "@/lib/format";

interface MktRow {
  id: string; question: string; category: string | null; source: string; status: string;
  b_param: number; close_time: string; resolve_time: string; outcome_count: number;
  volume: number; holders: number; is_featured: boolean; is_hero: boolean; created_at: string;
}
const STATUSES = ["", "open", "closed", "resolved", "void", "draft"];
const SOURCES: [string, string][] = [["", "すべての源"], ["template", "自動(天気/デイリー)"], ["admin", "手動"], ["mirror", "Poly"]];
const maxSubsidy = (b: number) => Math.round(b * Math.log(2) * 100);

export default function AdminMarketsPage() {
  const notify = useAdminToast();
  const [rows, setRows] = useState<MktRow[]>([]);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_list_markets", { p_status: status || null });
    if (error) { notify(`取得失敗: ${error.message}`); return; }
    setRows((data as MktRow[]) ?? []);
  }, [status, notify]);
  useEffect(() => { load(); }, [load]);

  const shown = source ? rows.filter((r) => r.source === source) : rows;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`text-sm rounded-full px-3 py-1.5 border ${status === s ? "border-primary bg-primary-weak text-primary font-bold" : "border-border text-dim hover:text-text"}`}>
            {s === "" ? "すべて" : statusLabel(s)}
          </button>
        ))}
        <select value={source} onChange={(e) => setSource(e.target.value)} className="ml-auto text-sm rounded-[8px] bg-surface2 border border-border px-2.5 py-1.5">
          {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-xs text-dim">{shown.length}件</span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-surface" style={{ boxShadow: "var(--shadow)" }}>
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
            {shown.map((m) => (
              <MarketRow key={m.id} m={m} open={openId === m.id}
                onToggle={() => setOpenId(openId === m.id ? null : m.id)} onChanged={load} notify={notify} />
            ))}
            {shown.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-dim">市場がありません</td></tr>}
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
  const [outcomes, setOutcomes] = useState<{ id: string; label: string }[]>([]);
  const [winner, setWinner] = useState("");
  const [src, setSrc] = useState("");
  const resolvable = m.status === "open" || m.status === "closed";

  useEffect(() => {
    if (!open || !resolvable || outcomes.length) return;
    createClient().from("outcomes").select("id,label,display_order").eq("market_id", m.id).then(({ data }) => {
      const os = ((data as { id: string; label: string; display_order: number }[]) ?? []).sort((a, c) => a.display_order - c.display_order);
      setOutcomes(os.map((o) => ({ id: o.id, label: o.label }))); setWinner(os[0]?.id ?? "");
    });
  }, [open, resolvable, outcomes.length, m.id]);

  async function save() {
    setBusy(true);
    const { error } = await createClient().rpc("admin_update_market", {
      p_market_id: m.id, p_b: b, p_close_time: new Date(close).toISOString(),
      p_resolve_time: new Date(close).toISOString(), p_question: null, p_image_url: null,
    });
    setBusy(false);
    notify(error ? `保存失敗: ${error.message}` : "保存しました（価格に即反映）"); onChanged();
  }
  async function resolve() {
    if (!winner) return;
    if (!confirm(`「${m.question}」を確定しますか？勝者へ参加ptが償還されます。`)) return;
    setBusy(true);
    const { error } = await createClient().rpc("admin_resolve", { p_market_id: m.id, p_winning_outcome_id: winner, p_source_url: src });
    setBusy(false);
    notify(error ? `解決失敗: ${error.message}` : "解決しました"); onChanged();
  }
  async function toggleFeatured() {
    setBusy(true);
    const { error } = await createClient().rpc("admin_set_featured", { p_market_id: m.id, p_featured: !m.is_featured });
    setBusy(false);
    notify(error ? `失敗: ${error.message}` : m.is_featured ? "注目を解除しました" : "注目に設定しました");
    onChanged();
  }
  async function toggleHero() {
    setBusy(true);
    const { error } = await createClient().rpc("admin_set_hero", { p_market_id: m.id, p_on: !m.is_hero });
    setBusy(false);
    notify(error ? `失敗: ${error.message}` : m.is_hero ? "今日のお題を解除しました" : "今日のお題に設定しました（トップに表示）");
    onChanged();
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
        <td className="p-3 max-w-0">
          <div className="truncate font-medium">
            {m.is_hero && <span className="text-[10px] font-extrabold mr-1.5 px-1 py-px rounded text-white" style={{ background: "var(--primary)" }}>⭐今日のお題</span>}
            {m.is_featured && <span className="text-[10px] font-extrabold mr-1.5 px-1 py-px rounded" style={{ background: "var(--accent2)", color: "#2A2018" }}>🔥注目</span>}
            {m.question}
          </div>
          <div className="text-[11px] text-dim">{m.category ?? "—"}</div>
        </td>
        <td className="p-3 text-center text-xs text-dim">{m.source}</td>
        <td className="p-3 text-center text-xs">{statusLabel(m.status)}</td>
        <td className="num p-3 text-right">{m.b_param}</td>
        <td className="num p-3 text-right text-dim">{formatPoints(Math.round(m.volume))}</td>
        <td className="num p-3 text-right text-dim">{m.holders}</td>
        <td className="p-3 text-dim text-xs">{open ? "▲" : "▼"}</td>
      </tr>
      {open && (
        <tr><td colSpan={7} className="bg-surface2 p-4">
          <div className="space-y-4">
            {resolvable && (
              <div className="rounded-[12px] border border-border bg-surface p-3">
                <div className="text-xs font-bold text-text mb-2">この市場を解決（確定）</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select value={winner} onChange={(e) => setWinner(e.target.value)} className="rounded-[8px] bg-surface2 border border-border px-2.5 py-1.5 text-sm">
                    {outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  <input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="根拠ソースURL（任意）"
                    className="flex-1 min-w-40 rounded-[8px] bg-surface2 border border-border px-2.5 py-1.5 text-sm" />
                  <button onClick={resolve} disabled={busy || !winner} className="rounded-[8px] bg-pos text-white px-4 py-1.5 text-sm font-bold disabled:opacity-50">確定する</button>
                </div>
              </div>
            )}
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
                <button onClick={toggleHero} disabled={busy} className="rounded-sm px-3 py-1.5 text-sm font-bold text-white" style={{ background: m.is_hero ? "var(--primary)" : "var(--grad)", opacity: m.is_hero ? 1 : 0.85 }}>
                  {m.is_hero ? "⭐ 今日のお題を解除" : "⭐ 今日のお題にする"}
                </button>
                <button onClick={toggleFeatured} disabled={busy} className={`rounded-sm px-3 py-1.5 text-sm font-bold ${m.is_featured ? "bg-accent2 text-text" : "border border-border text-dim hover:text-text"}`} style={m.is_featured ? { background: "var(--accent2)", color: "#2A2018" } : undefined}>
                  {m.is_featured ? "🔥 注目を解除" : "🔥 注目にする"}
                </button>
                <button onClick={() => act("hide")} disabled={busy} className="rounded-sm border border-border px-3 py-1.5 text-sm text-dim hover:text-text">非表示（下書きへ）</button>
                <button onClick={() => act("show")} disabled={busy} className="rounded-sm border border-border px-3 py-1.5 text-sm text-dim hover:text-text">表示（公開へ）</button>
                <button onClick={() => act("void")} disabled={busy} className="rounded-sm border border-neg/50 text-neg px-3 py-1.5 text-sm">中止（返金）</button>
              </div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}
