"use client";
// 管理: 合言葉キャンペーン（0037）。合言葉を作成→SNS等で配布。ユーザーがマイページで入力すると参加ポイント付与。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { formatPoints } from "@/lib/format";
import type { PromoCode } from "@/lib/types";

type Form = {
  code: string; label: string; reward_points: number;
  max_redemptions: number | null; starts_at: string; expires_at: string; is_active: boolean;
};
const EMPTY: Form = { code: "", label: "", reward_points: 100, max_redemptions: null, starts_at: "", expires_at: "", is_active: true };

// ISO(UTC) <-> datetime-local（ローカル時刻）変換
function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function localToIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

export default function AdminPromosPage() {
  const notify = useAdminToast();
  const [list, setList] = useState<PromoCode[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_list_promo_codes");
    if (error) { notify(`取得失敗: ${error.message}`); return; }
    setList((data as PromoCode[]) ?? []);
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  function startNew() { setEditId(null); setForm(EMPTY); }
  function startEdit(p: PromoCode) {
    setEditId(p.id);
    setForm({
      code: p.code, label: p.label ?? "", reward_points: p.reward_points,
      max_redemptions: p.max_redemptions, starts_at: isoToLocal(p.starts_at),
      expires_at: isoToLocal(p.expires_at), is_active: p.is_active,
    });
  }

  async function save() {
    setBusy(true);
    const { error } = await createClient().rpc("admin_upsert_promo_code", {
      p_id: editId, p_code: form.code, p_label: form.label || null,
      p_reward_points: form.reward_points, p_max_redemptions: form.max_redemptions,
      p_starts_at: localToIso(form.starts_at), p_expires_at: localToIso(form.expires_at),
      p_is_active: form.is_active,
    });
    setBusy(false);
    if (error) {
      notify(error.message.includes("duplicate_code") ? "その合言葉は既に存在します" : `保存失敗: ${error.message}`);
      return;
    }
    notify(editId ? "合言葉を更新しました" : "合言葉を作成しました");
    startNew(); load();
  }

  async function toggle(p: PromoCode) {
    const { error } = await createClient().rpc("admin_set_promo_active", { p_id: p.id, p_active: !p.is_active });
    notify(error ? `失敗: ${error.message}` : (p.is_active ? "停止しました" : "再開しました"));
    if (!error) load();
  }

  const fmtWindow = (p: PromoCode) => {
    const f = (s: string | null) => s ? new Date(s).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
    const a = f(p.starts_at), b = f(p.expires_at);
    if (!a && !b) return "期間制限なし";
    return `${a ?? "〜"} 〜 ${b ?? "無期限"}`;
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">合言葉キャンペーン / Promo codes</h2>
          <button onClick={startNew} className="text-sm rounded-sm border border-border px-3 py-1.5 text-dim hover:text-text">＋ 新規</button>
        </div>
        <p className="text-xs text-dim">SNS等で配った合言葉を、ユーザーがマイページで入力すると<b className="text-text">参加ポイント</b>が付与されます（1人1回）。合言葉は大文字小文字を区別しません。</p>

        {/* 作成・編集フォーム */}
        <div className="rounded-[var(--radius)] border border-border bg-surface p-4 space-y-2 max-w-2xl" style={{ boxShadow: "var(--shadow)" }}>
          <div className="text-xs font-bold text-dim">{editId ? "合言葉を編集" : "新しい合言葉を作成"}</div>
          <div className="flex flex-wrap gap-2">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="合言葉（例: GORILLA2026）"
              className="flex-1 min-w-[180px] rounded-sm bg-surface2 border border-border px-2 py-1.5 text-sm font-bold tracking-wide" />
            <label className="text-xs text-dim flex items-center gap-1">付与pt
              <input type="number" min={1} value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: Math.max(1, Math.floor(Number(e.target.value))) })}
                className="num w-24 rounded-sm bg-surface2 border border-border px-2 py-1" />
            </label>
          </div>
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="キャンペーン名・メモ（任意・ユーザーには表示されません）"
            className="w-full rounded-sm bg-surface2 border border-border px-2 py-1.5 text-sm" />
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-xs text-dim flex items-center gap-1">総回数上限
              <input type="number" min={0} value={form.max_redemptions ?? ""} placeholder="∞"
                onChange={(e) => setForm({ ...form, max_redemptions: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
                className="num w-20 rounded-sm bg-surface2 border border-border px-2 py-1" />
              <span className="text-faint">空=無制限</span>
            </label>
            <label className="text-xs text-dim flex items-center gap-1.5">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              有効
            </label>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-xs text-dim flex items-center gap-1">開始
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="rounded-sm bg-surface2 border border-border px-2 py-1 text-xs" />
            </label>
            <label className="text-xs text-dim flex items-center gap-1">終了
              <input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="rounded-sm bg-surface2 border border-border px-2 py-1 text-xs" />
            </label>
            <span className="text-faint text-xs">空欄で制限なし</span>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !form.code} className="rounded-sm bg-primary text-white px-4 py-1.5 text-sm disabled:opacity-50">
              {editId ? "更新" : "作成"}
            </button>
            {editId && <button onClick={startNew} className="rounded-sm border border-border text-dim px-4 py-1.5 text-sm">キャンセル</button>}
          </div>
        </div>

        {/* 一覧 */}
        <div className="rounded-[var(--radius)] border border-border bg-surface divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
          {list.length === 0 ? <p className="p-4 text-dim text-sm">合言葉がありません。上のフォームから作成してください。</p> :
            list.map((p) => {
              const soldOut = p.max_redemptions !== null && p.used_count >= p.max_redemptions;
              return (
                <div key={p.id} className="px-4 py-3 text-sm flex items-center gap-3 flex-wrap">
                  <span className="font-bold tracking-wide font-mono text-text">{p.code}</span>
                  {p.label && <span className="text-xs text-dim">{p.label}</span>}
                  <span className="num text-primary font-bold">+{formatPoints(p.reward_points)} pt</span>
                  <span className="text-xs text-dim">引換 {p.used_count}{p.max_redemptions !== null ? ` / ${p.max_redemptions}` : ""}</span>
                  <span className="text-xs text-faint">{fmtWindow(p)}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ml-auto ${!p.is_active ? "text-faint bg-surface2" : soldOut ? "text-neg bg-neg/10" : "text-pos bg-pos/10"}`}>
                    {!p.is_active ? "停止中" : soldOut ? "上限到達" : "有効"}
                  </span>
                  <button onClick={() => startEdit(p)} className="text-xs text-dim hover:text-text underline">編集</button>
                  <button onClick={() => toggle(p)} className="text-xs text-dim hover:text-text underline">{p.is_active ? "停止" : "再開"}</button>
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}
