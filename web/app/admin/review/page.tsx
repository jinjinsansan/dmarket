"use client";
// 管理: ユーザー作成市場の審査キュー（申請の承認/却下）。0033。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";

type Row = { id: string; question: string; category: string | null; display_name: string; close_time: string; created_at: string };

export default function AdminReviewPage() {
  const notify = useAdminToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await createClient().rpc("admin_list_pending_markets");
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, approve: boolean, q: string) {
    if (!approve && !confirm(`「${q}」を却下（削除）しますか？`)) return;
    const { error } = await createClient().rpc(approve ? "admin_approve_market" : "admin_reject_market", { p_market_id: id });
    notify(error ? `失敗: ${error.message}` : approve ? "公開しました" : "却下しました");
    load();
  }

  return (
    <section>
      <h2 className="text-[16px] font-bold mb-1">ユーザー作成市場の審査</h2>
      <p className="text-[12px] text-dim mb-4">ユーザーが申請した市場です。客観的に解決でき、不適切でなければ承認（公開）。承認後の解決は通常どおり解決キュー/市場マネージャで行います。</p>
      {loading ? <p className="text-dim text-sm">読み込み中…</p>
        : rows.length === 0 ? <p className="text-dim text-sm py-8 text-center border border-dashed border-border rounded-[var(--radius)]">審査待ちの申請はありません。</p>
        : (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <div key={r.id} className="border border-border bg-surface rounded-[var(--radius)] p-3.5" style={{ boxShadow: "var(--shadow)" }}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] font-bold text-primary bg-primary-weak px-2 py-0.5 rounded-full">{r.category ?? "未分類"}</span>
                  <span className="text-[11px] text-dim">申請者 {r.display_name}</span>
                  <span className="text-[11px] text-faint ml-auto">締切 {new Date(r.close_time).toLocaleString("ja-JP")}</span>
                </div>
                <p className="text-[14px] font-semibold leading-relaxed">{r.question}</p>
                <div className="flex gap-2 mt-2.5">
                  <button onClick={() => act(r.id, true, r.question)} className="rounded-[9px] bg-pos text-white px-4 py-1.5 text-[12.5px] font-bold">承認して公開</button>
                  <button onClick={() => act(r.id, false, r.question)} className="rounded-[9px] border border-neg/50 text-neg px-4 py-1.5 text-[12.5px] font-bold">却下</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}
