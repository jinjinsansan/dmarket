"use client";
// 管理: 通報・コメント管理（通報あり/非表示コメントの一覧→非表示/復帰）。0031 + admin_hide_comment(0029)。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";

type Row = { id: number; market_id: string; question: string; body: string; display_name: string; report_count: number; is_hidden: boolean; created_at: string };

export default function AdminCommentsPage() {
  const notify = useAdminToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await createClient().rpc("admin_list_reported_comments");
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setHidden(id: number, hidden: boolean) {
    const { error } = await createClient().rpc("admin_hide_comment", { p_comment_id: id, p_hidden: hidden });
    notify(error ? `失敗: ${error.message}` : hidden ? "非表示にしました" : "復帰しました");
    load();
  }

  return (
    <section>
      <h2 className="text-[16px] font-bold mb-1">通報・コメント管理</h2>
      <p className="text-[12px] text-dim mb-4">通報されたコメント・非表示中のコメントの一覧です（通報3件で自動非表示）。</p>
      {loading ? <p className="text-dim text-sm">読み込み中…</p>
        : rows.length === 0 ? <p className="text-dim text-sm py-8 text-center border border-dashed border-border rounded-[var(--radius)]">通報・非表示のコメントはありません。</p>
        : (
          <div className="space-y-2.5">
            {rows.map((r) => (
              <div key={r.id} className="border border-border bg-surface rounded-[var(--radius)] p-3.5" style={{ boxShadow: "var(--shadow)" }}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-neg bg-neg-weak px-2 py-0.5 rounded-full">通報 {r.report_count}</span>
                  {r.is_hidden && <span className="text-[11px] font-bold text-faint bg-surface2 px-2 py-0.5 rounded-full">非表示中</span>}
                  <span className="text-[11px] text-dim">by {r.display_name}</span>
                  <a href={`/market/${r.market_id}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary underline ml-auto truncate max-w-[40%]">{r.question}</a>
                </div>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{r.body}</p>
                <div className="flex gap-2 mt-2.5">
                  {r.is_hidden
                    ? <button onClick={() => setHidden(r.id, false)} className="rounded-[9px] border border-border text-dim hover:text-text px-3 py-1.5 text-[12.5px] font-bold">復帰する</button>
                    : <button onClick={() => setHidden(r.id, true)} className="rounded-[9px] bg-neg text-white px-3 py-1.5 text-[12.5px] font-bold">非表示にする</button>}
                </div>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}
