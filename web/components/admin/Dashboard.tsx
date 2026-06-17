"use client";
// 管理ダッシュボード（SPEC-07 §2）。KPI＋カテゴリ別フィード現況（gap可視化）。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPoints } from "@/lib/format";

interface Kpis {
  active_markets: number; trades_today: number; users_count: number;
  pending_manual: number; queue_count: number; resolved_total: number;
}
interface FeedRow {
  category_id: string; slug: string; name: string; is_active: boolean;
  target_active: number; poly_max: number; admin_active: number;
  template_active: number; mirror_active: number; to_generate: number;
}

export function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [rows, setRows] = useState<FeedRow[]>([]);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const [{ data: k }, { data: ov }] = await Promise.all([
        sb.rpc("admin_kpis"),
        sb.rpc("admin_feed_overview"),
      ]);
      setKpis((k as Kpis) ?? null);
      setRows((ov as FeedRow[]) ?? []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="アクティブ市場" v={kpis?.active_markets} />
        <Kpi label="本日の取引" v={kpis?.trades_today} />
        <Kpi label="登録者数" v={kpis?.users_count} />
        <Kpi label="手動解決待ち" v={kpis?.pending_manual} alert={(kpis?.pending_manual ?? 0) > 0} />
        <Kpi label="解決失敗キュー" v={kpis?.queue_count} alert={(kpis?.queue_count ?? 0) > 0} />
        <Kpi label="解決済み累計" v={kpis?.resolved_total} />
      </div>

      <section>
        <h2 className="text-sm font-medium mb-2">カテゴリ別フィード現況</h2>
        <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
          <table className="w-full text-sm">
            <thead className="text-dim text-xs">
              <tr className="border-b border-border">
                <th className="text-left p-2">カテゴリ</th>
                <th className="num p-2">目標</th>
                <th className="num p-2">admin</th>
                <th className="num p-2">template</th>
                <th className="num p-2">mirror</th>
                <th className="num p-2">次回Poly生成</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.category_id} className="border-b border-border last:border-0">
                  <td className="p-2">{r.name}{!r.is_active && <span className="text-dim text-xs">（無効）</span>}</td>
                  <td className="num p-2 text-center">{r.target_active}</td>
                  <td className="num p-2 text-center">{r.admin_active}</td>
                  <td className="num p-2 text-center">{r.template_active}</td>
                  <td className="num p-2 text-center">{r.mirror_active}</td>
                  <td className="num p-2 text-center text-primary">{r.to_generate}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-dim">カテゴリがありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-dim mt-2">「次回Poly生成」= gap。管理者市場を増やすと自動で縮みます（走行中の市場は消えません）。</p>
      </section>
    </div>
  );
}

function Kpi({ label, v, alert }: { label: string; v?: number; alert?: boolean }) {
  return (
    <div className={`rounded-[var(--radius)] border p-3 ${alert ? "border-[var(--neg)]/50" : "border-border"} bg-surface`}>
      <div className="text-xs text-dim">{label}</div>
      <div className={`num text-lg mt-1 ${alert ? "text-[var(--neg)]" : ""}`}>
        {v === undefined ? "—" : formatPoints(v)}
      </div>
    </div>
  );
}
