"use client";
// 管理: クリエイター審査（0038）。申請の承認/拒否/却下＋承認済みクリエイター一覧。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";

type Application = {
  user_id: string; display_name: string; status: string;
  sns_url: string | null; genres: string | null; bio: string | null;
  reviewer_note: string | null; created_at: string; reviewed_at: string | null;
};
type Creator = {
  user_id: string; display_name: string; sns_url: string | null; genres: string | null;
  market_count: number; approved_at: string | null;
};

const STATUS_LABEL: Record<string, string> = { pending: "審査中", approved: "承認済", rejected: "拒否", dismissed: "却下" };
const FILTERS = [
  { key: "pending", label: "審査中" }, { key: "", label: "すべて" },
  { key: "approved", label: "承認済" }, { key: "rejected", label: "拒否" }, { key: "dismissed", label: "却下" },
];

export default function AdminCreatorsPage() {
  const notify = useAdminToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [filter, setFilter] = useState("pending");
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const loadApps = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_list_creator_applications", { p_status: filter || null });
    if (error) { notify(`取得失敗: ${error.message}`); return; }
    setApps((data as Application[]) ?? []);
  }, [notify, filter]);

  const loadCreators = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_list_creators");
    if (error) { notify(`取得失敗: ${error.message}`); return; }
    setCreators((data as Creator[]) ?? []);
  }, [notify]);

  useEffect(() => { loadApps(); }, [loadApps]);
  useEffect(() => { loadCreators(); }, [loadCreators]);

  async function setStatus(a: Application, status: string) {
    const noteVal = noteFor === a.user_id ? note : a.reviewer_note ?? "";
    if (status !== "approved" && !confirm(`「${a.display_name}」を${STATUS_LABEL[status]}にします。よろしいですか？`)) return;
    setBusy(true);
    const { error } = await createClient().rpc("admin_set_creator_status", { p_user_id: a.user_id, p_status: status, p_note: noteVal || null });
    setBusy(false);
    notify(error ? `失敗: ${error.message}` : `${STATUS_LABEL[status]}にしました`);
    if (!error) { setNoteFor(null); setNote(""); loadApps(); loadCreators(); }
  }

  return (
    <div className="space-y-8">
      {/* ── 審査 ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-[16px] font-bold">クリエイター審査 / Applications</h2>
          <div className="flex gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`text-xs rounded-full px-2.5 py-1 border ${filter === f.key ? "bg-primary text-white border-primary" : "border-border text-dim hover:text-text"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          {apps.length === 0 ? <p className="p-4 text-dim text-sm border border-border bg-surface rounded-[var(--radius)]">該当する申請はありません。</p> :
            apps.map((a) => (
              <div key={a.user_id} className="border border-border bg-surface rounded-[var(--radius)] p-4 space-y-2" style={{ boxShadow: "var(--shadow)" }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold text-sm">{a.display_name}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${a.status === "approved" ? "text-pos bg-pos/10" : a.status === "pending" ? "text-primary bg-primary/10" : "text-faint bg-surface2"}`}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  <span className="text-xs text-faint ml-auto">{new Date(a.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="text-[13px] space-y-1">
                  <div><span className="text-dim text-xs">SNS媒体: </span>
                    {a.sns_url ? <a href={a.sns_url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{a.sns_url}</a> : <span className="text-faint">—</span>}
                  </div>
                  <div><span className="text-dim text-xs">ジャンル: </span>{a.genres || <span className="text-faint">—</span>}</div>
                  {a.bio && <div className="text-dim text-[12.5px] bg-surface2 rounded-[8px] px-2.5 py-1.5 whitespace-pre-wrap">{a.bio}</div>}
                  {a.reviewer_note && <div className="text-[11.5px] text-faint">メモ: {a.reviewer_note}</div>}
                </div>

                {noteFor === a.user_id && (
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="管理メモ（任意・申請者には非表示）"
                    className="w-full rounded-sm bg-surface2 border border-border px-2 py-1.5 text-xs" />
                )}
                <div className="flex gap-2 flex-wrap">
                  {a.status !== "approved" && <button onClick={() => setStatus(a, "approved")} disabled={busy} className="text-xs rounded-sm bg-primary text-white px-3 py-1 disabled:opacity-50">承認</button>}
                  {a.status !== "rejected" && <button onClick={() => setStatus(a, "rejected")} disabled={busy} className="text-xs rounded-sm border border-border px-3 py-1 text-neg">拒否</button>}
                  {a.status !== "dismissed" && <button onClick={() => setStatus(a, "dismissed")} disabled={busy} className="text-xs rounded-sm border border-border px-3 py-1 text-dim">却下</button>}
                  <button onClick={() => { setNoteFor(noteFor === a.user_id ? null : a.user_id); setNote(a.reviewer_note ?? ""); }} className="text-xs rounded-sm border border-border px-3 py-1 text-dim hover:text-text ml-auto">
                    {noteFor === a.user_id ? "メモを閉じる" : "メモ"}
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* ── 承認済みクリエイター一覧 ── */}
      <section className="space-y-3">
        <h2 className="text-[16px] font-bold">承認済みクリエイター / Creators（{creators.length}）</h2>
        <div className="rounded-[var(--radius)] border border-border bg-surface divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
          {creators.length === 0 ? <p className="p-4 text-dim text-sm">承認済みのクリエイターはまだいません。</p> :
            creators.map((c) => (
              <div key={c.user_id} className="px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
                <span className="font-semibold">{c.display_name}</span>
                {c.sns_url && <a href={c.sns_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline break-all">SNS</a>}
                {c.genres && <span className="text-xs text-dim truncate max-w-[280px]">{c.genres}</span>}
                <span className="text-xs text-dim ml-auto">作成市場 {c.market_count}</span>
                <span className="text-xs text-faint">{c.approved_at ? new Date(c.approved_at).toLocaleDateString("ja-JP") : "—"}</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
