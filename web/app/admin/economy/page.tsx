"use client";
// 管理: 経済モニタ（参加ポイント供給・LMSR補助金・インフレ・台帳監査）＋手動ジョブ。賞品ptは別台帳。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { formatPoints } from "@/lib/format";
import { LEDGER_REASON_LABEL } from "@/lib/constants";

interface Econ {
  total_supply: number; ledger_sum: number; audit_ok: boolean;
  by_reason: Record<string, number>; trading_subsidy: number; issued_free: number;
  inflation_today: number; users: number; markets_open: number; markets_resolved: number;
}
const REASON = { ...LEDGER_REASON_LABEL, admin_grant: "運営付与", admin_burn: "運営消滅" } as Record<string, string>;

export default function AdminEconomyPage() {
  const notify = useAdminToast();
  const [e, setE] = useState<Econ | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_economy");
    if (error) { notify(`取得失敗: ${error.message}`); return; }
    setE(data as Econ);
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  async function runFn(name: "generate-markets" | "resolve-markets") {
    setBusy(name);
    try {
      const sb = createClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
        method: "POST", headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" }, body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      notify(res.ok ? `${name} 実行: ${JSON.stringify(j).slice(0, 80)}` : `失敗(${res.status})`);
    } catch (err) { notify(`失敗: ${err instanceof Error ? err.message : String(err)}`); }
    setBusy(null); load();
  }
  async function refreshStats() {
    setBusy("stats");
    const { error } = await createClient().rpc("admin_refresh_stats");
    setBusy(null);
    notify(error ? `失敗: ${error.message}` : "集計を更新しました");
    load();
  }

  if (!e) return <p className="text-dim text-sm py-10">読み込み中…</p>;
  const reasons = Object.entries(e.by_reason).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  return (
    <div className="space-y-6">
      {/* 監査 */}
      <div className={`rounded-[var(--radius)] border p-4 ${e.audit_ok ? "border-pos/40" : "border-neg/60"} bg-surface`} style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex items-center gap-2 text-sm font-bold">
          台帳監査 {e.audit_ok ? <span className="text-pos">✓ 整合（残高合計 == 台帳合計）</span> : <span className="text-neg">✗ 不整合！要調査</span>}
        </div>
        <div className="num text-xs text-dim mt-1">残高合計 {formatPoints(e.total_supply)} / 台帳合計 {formatPoints(e.ledger_sum)}</div>
      </div>

      {/* KPI */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
        <Stat label="総供給量" value={formatPoints(e.total_supply)} unit="pt" hint="流通している全参加ポイント" />
        <Stat label="本日のインフレ" value={`${e.inflation_today >= 0 ? "+" : ""}${formatPoints(e.inflation_today)}`} unit="pt" alert={e.inflation_today > 0} hint="今日の純増減" />
        <Stat label="LMSR補助金（累計）" value={`${e.trading_subsidy >= 0 ? "+" : ""}${formatPoints(e.trading_subsidy)}`} unit="pt" alert={e.trading_subsidy > 0} hint="取引で純創出された参加ポイント" />
        <Stat label="無償発行（累計）" value={formatPoints(e.issued_free)} unit="pt" hint="登録/デイリー/運営付与" />
        <Stat label="ユーザー数" value={formatPoints(e.users)} />
        <Stat label="開催中 / 解決済" value={`${e.markets_open} / ${e.markets_resolved}`} />
      </div>

      {/* 理由別内訳 */}
      <section>
        <h2 className="text-sm font-bold mb-2">参加ポイント増減の理由別内訳（累計）</h2>
        <div className="rounded-[var(--radius)] border border-border bg-surface divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
          {reasons.map(([r, v]) => (
            <div key={r} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1">{REASON[r] ?? r}</span>
              <span className={`num ${v >= 0 ? "text-pos" : "text-neg"}`}>{v >= 0 ? "+" : ""}{formatPoints(v)}</span>
            </div>
          ))}
          {reasons.length === 0 && <p className="p-4 text-dim text-sm">まだ取引がありません</p>}
        </div>
        <p className="text-xs text-faint mt-2">※「LMSR補助金」が大きく+に振れたら、該当市場の `b` を下げる（市場マネージャ）かインフレ対策を検討。</p>
      </section>

      {/* 手動ジョブ */}
      <section>
        <h2 className="text-sm font-bold mb-2">手動ジョブ（cronを待たず即実行）</h2>
        <div className="flex flex-wrap gap-2">
          <JobBtn onClick={() => runFn("generate-markets")} busy={busy === "generate-markets"}>今すぐ市場生成</JobBtn>
          <JobBtn onClick={() => runFn("resolve-markets")} busy={busy === "resolve-markets"}>今すぐ解決チェック</JobBtn>
          <JobBtn onClick={refreshStats} busy={busy === "stats"}>今すぐ集計（ランキング）</JobBtn>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, unit, alert, hint }: { label: string; value: string; unit?: string; alert?: boolean; hint?: string }) {
  return (
    <div className={`rounded-[var(--radius)] border p-3 ${alert ? "border-amber-400/50" : "border-border"} bg-surface`} style={{ boxShadow: "var(--shadow)" }} title={hint}>
      <div className="text-xs text-dim">{label}</div>
      <div className="num text-lg font-bold mt-1">{value}{unit && <span className="text-xs text-dim"> {unit}</span>}</div>
    </div>
  );
}
function JobBtn({ onClick, busy, children }: { onClick: () => void; busy: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="rounded-[10px] border border-border bg-surface px-4 py-2 text-sm font-bold hover:border-primary/60 disabled:opacity-50">
      {busy ? "実行中…" : children}
    </button>
  );
}
