"use client";
// 管理: 景品マスタ CRUD ＋ 交換申込の発送ステータス管理（二層ポイント制 Phase C / 0024）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { formatPoints } from "@/lib/format";
import type { Prize, AdminRedemption } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  requested: "申込", approved: "承認済", shipped: "発送済", cancelled: "取消",
};
const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "すべて" }, { key: "requested", label: "申込" },
  { key: "approved", label: "承認済" }, { key: "shipped", label: "発送済" },
  { key: "cancelled", label: "取消" },
];

const EMPTY: Omit<Prize, "id" | "created_at"> = {
  name: "", description: "", image_url: "", cost_points: 100, stock: null, is_active: true, display_order: 0,
};

export default function AdminPrizesPage() {
  const notify = useAdminToast();
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Prize, "id" | "created_at">>(EMPTY);
  const [reds, setReds] = useState<AdminRedemption[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const loadPrizes = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_list_prizes");
    if (error) { notify(`景品取得失敗: ${error.message}`); return; }
    setPrizes((data as Prize[]) ?? []);
  }, [notify]);

  const loadReds = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_list_redemptions", { p_status: filter || null });
    if (error) { notify(`申込取得失敗: ${error.message}`); return; }
    setReds((data as AdminRedemption[]) ?? []);
  }, [notify, filter]);

  useEffect(() => { loadPrizes(); }, [loadPrizes]);
  useEffect(() => { loadReds(); }, [loadReds]);

  function startNew() { setEditId(null); setForm(EMPTY); }
  function startEdit(p: Prize) {
    setEditId(p.id);
    setForm({ name: p.name, description: p.description ?? "", image_url: p.image_url ?? "",
      cost_points: p.cost_points, stock: p.stock, is_active: p.is_active, display_order: p.display_order });
  }

  async function save() {
    setBusy(true);
    const { error } = await createClient().rpc("admin_upsert_prize", {
      p_id: editId, p_name: form.name, p_description: form.description || null,
      p_image_url: form.image_url || null, p_cost_points: form.cost_points,
      p_stock: form.stock, p_is_active: form.is_active, p_display_order: form.display_order,
    });
    setBusy(false);
    if (error) { notify(`保存失敗: ${error.message}`); return; }
    notify(editId ? "景品を更新しました" : "景品を追加しました");
    startNew(); loadPrizes();
  }

  async function toggleActive(p: Prize) {
    const { error } = await createClient().rpc("admin_set_prize_active", { p_id: p.id, p_active: !p.is_active });
    notify(error ? `失敗: ${error.message}` : (p.is_active ? "非公開にしました" : "公開しました"));
    if (!error) loadPrizes();
  }

  async function setStatus(r: AdminRedemption, status: string) {
    if (status === "cancelled" && !confirm(`「${r.prize_name}」の申込を取消します。未発送ならゴリラコインを返金し在庫を戻します。よろしいですか？`)) return;
    setBusy(true);
    const { error } = await createClient().rpc("admin_set_redemption_status", { p_id: r.id, p_status: status });
    setBusy(false);
    notify(error ? `失敗: ${error.message}` : `${STATUS_LABEL[status]}に更新しました`);
    if (!error) { loadReds(); loadPrizes(); }
  }

  return (
    <div className="space-y-8">
      {/* ── 景品マスタ ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">景品マスタ / Prizes</h2>
          <button onClick={startNew} className="text-sm rounded-sm border border-border px-3 py-1.5 text-dim hover:text-text">＋ 新規</button>
        </div>

        {/* 作成・編集フォーム */}
        <div className="rounded-[var(--radius)] border border-border bg-surface p-4 space-y-2 max-w-2xl" style={{ boxShadow: "var(--shadow)" }}>
          <div className="text-xs font-bold text-dim">{editId ? "景品を編集" : "新しい景品を追加"}</div>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="景品名（例: Amazonギフト券 500円分）"
            className="w-full rounded-sm bg-surface2 border border-border px-2 py-1.5 text-sm" />
          <input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="説明（任意）"
            className="w-full rounded-sm bg-surface2 border border-border px-2 py-1.5 text-sm" />
          <div>
            <div className="text-[11px] text-dim font-semibold mb-1">景品の写真・イラスト</div>
            <ImageUpload value={form.image_url ?? ""} onChange={(url) => setForm({ ...form, image_url: url })} />
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-xs text-dim flex items-center gap-1">必要ゴリラコイン
              <input type="number" min={1} value={form.cost_points} onChange={(e) => setForm({ ...form, cost_points: Math.max(1, Math.floor(Number(e.target.value))) })}
                className="num w-24 rounded-sm bg-surface2 border border-border px-2 py-1" />
              <span className="text-faint">1コイン=1円 / 10,000〜100,000</span>
            </label>
            <label className="text-xs text-dim flex items-center gap-1">在庫
              <input type="number" min={0} value={form.stock ?? ""} placeholder="∞"
                onChange={(e) => setForm({ ...form, stock: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
                className="num w-20 rounded-sm bg-surface2 border border-border px-2 py-1" />
              <span className="text-faint">空=無制限</span>
            </label>
            <label className="text-xs text-dim flex items-center gap-1">表示順
              <input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Math.floor(Number(e.target.value)) })}
                className="num w-16 rounded-sm bg-surface2 border border-border px-2 py-1" />
            </label>
            <label className="text-xs text-dim flex items-center gap-1.5">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              公開する
            </label>
          </div>
          {form.cost_points > 100000 && (
            <p className="text-[11.5px] text-neg bg-neg/10 rounded-sm px-2.5 py-1.5">
              ⚠️ 景品表示法（一般懸賞）の上限は <b>10万円（=100,000コイン）</b>です。これを超える景品は提供できません。
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !form.name || form.cost_points > 100000} className="rounded-sm bg-primary text-white px-4 py-1.5 text-sm disabled:opacity-50">
              {editId ? "更新" : "追加"}
            </button>
            {editId && <button onClick={startNew} className="rounded-sm border border-border text-dim px-4 py-1.5 text-sm">キャンセル</button>}
          </div>
        </div>

        {/* 一覧 */}
        <div className="rounded-[var(--radius)] border border-border bg-surface divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
          {prizes.length === 0 ? <p className="p-4 text-dim text-sm">景品がありません。上のフォームから追加してください。</p> :
            prizes.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 min-w-0 truncate font-semibold">{p.name}</span>
                <span className="num text-primary font-bold">{formatPoints(p.cost_points)} コイン</span>
                <span className="num text-dim w-16 text-right">在庫 {p.stock ?? "∞"}</span>
                <span className={`text-xs w-14 text-center rounded-full px-2 py-0.5 ${p.is_active ? "text-pos bg-pos/10" : "text-faint bg-surface2"}`}>
                  {p.is_active ? "公開" : "非公開"}
                </span>
                <button onClick={() => startEdit(p)} className="text-xs text-dim hover:text-text underline">編集</button>
                <button onClick={() => toggleActive(p)} className="text-xs text-dim hover:text-text underline">{p.is_active ? "非公開に" : "公開に"}</button>
              </div>
            ))}
        </div>
      </section>

      {/* ── 交換申込 ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-[16px] font-bold">交換申込 / Redemptions</h2>
          <div className="flex gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`text-xs rounded-full px-2.5 py-1 border ${filter === f.key ? "bg-primary text-white border-primary" : "border-border text-dim hover:text-text"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-border bg-surface divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
          {reds.length === 0 ? <p className="p-4 text-dim text-sm">該当する申込はありません。</p> :
            reds.map((r) => (
              <div key={r.id} className="px-4 py-3 text-sm space-y-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-dim text-xs w-28 shrink-0">{new Date(r.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="font-semibold">{r.prize_name}</span>
                  <span className="num text-primary">{formatPoints(r.cost_points)} コイン</span>
                  <span className="text-dim text-xs">申込者: {r.display_name}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ml-auto ${r.status === "shipped" ? "text-pos bg-pos/10" : r.status === "cancelled" ? "text-faint bg-surface2" : "text-primary bg-primary/10"}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                {r.shipping && (
                  <div className="text-xs text-dim bg-surface2 rounded-[8px] px-2.5 py-1.5">
                    配送先: {r.shipping.name ?? "—"} / {r.shipping.postal ?? ""} {r.shipping.addr ?? "—"} {r.shipping.tel ? `/ ${r.shipping.tel}` : ""}
                    {r.shipping.note ? <div>備考: {r.shipping.note}</div> : null}
                  </div>
                )}
                {r.status !== "shipped" && r.status !== "cancelled" && (
                  <div className="flex gap-2">
                    {r.status === "requested" && <button onClick={() => setStatus(r, "approved")} disabled={busy} className="text-xs rounded-sm border border-border px-3 py-1 text-dim hover:text-text">承認</button>}
                    <button onClick={() => setStatus(r, "shipped")} disabled={busy} className="text-xs rounded-sm bg-primary text-white px-3 py-1 disabled:opacity-50">発送済にする</button>
                    <button onClick={() => setStatus(r, "cancelled")} disabled={busy} className="text-xs rounded-sm border border-border px-3 py-1 text-neg">取消（返金）</button>
                  </div>
                )}
              </div>
            ))}
        </div>
        <p className="text-xs text-faint">※ 配送先は個人情報です。発送後は最小限の保持・適切な管理をしてください（プライバシーポリシー）。取消は未発送のときのみゴリラコインを返金し在庫を戻します。</p>
      </section>
    </div>
  );
}
