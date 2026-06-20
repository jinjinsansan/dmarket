"use client";
// 管理: 提携案件マスタ CRUD ＋ 成果の手動消し込み（参加ポイント獲得 Phase 1 / 0026）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminToast } from "@/components/admin/AdminToast";
import { formatPoints } from "@/lib/format";
import type { AffiliateOffer, AdminConversion, AdminClick } from "@/lib/types";

const EMPTY: Omit<AffiliateOffer, "id" | "created_at"> = {
  name: "", description: "", image_url: "", reward_points: 100, asp: "", click_url: "", incentive_ok: false, is_active: true, display_order: 0,
};

export default function AdminAffiliatePage() {
  const notify = useAdminToast();
  const [offers, setOffers] = useState<AffiliateOffer[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<AffiliateOffer, "id" | "created_at">>(EMPTY);
  const [clicks, setClicks] = useState<AdminClick[]>([]);
  const [convs, setConvs] = useState<AdminConversion[]>([]);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const loadOffers = useCallback(async () => {
    const { data, error } = await createClient().rpc("admin_list_offers");
    if (error) { notify(`案件取得失敗: ${error.message}`); return; }
    setOffers((data as AffiliateOffer[]) ?? []);
  }, [notify]);
  const loadClicks = useCallback(async () => {
    const { data } = await createClient().rpc("admin_recent_clicks");
    setClicks((data as AdminClick[]) ?? []);
  }, []);
  const loadConvs = useCallback(async () => {
    const { data } = await createClient().rpc("admin_list_conversions");
    setConvs((data as AdminConversion[]) ?? []);
  }, []);

  useEffect(() => { loadOffers(); loadClicks(); loadConvs(); }, [loadOffers, loadClicks, loadConvs]);

  function startNew() { setEditId(null); setForm(EMPTY); }
  function startEdit(o: AffiliateOffer) {
    setEditId(o.id);
    setForm({ name: o.name, description: o.description ?? "", image_url: o.image_url ?? "", reward_points: o.reward_points,
      asp: o.asp ?? "", click_url: o.click_url, incentive_ok: o.incentive_ok, is_active: o.is_active, display_order: o.display_order });
  }

  async function save() {
    setBusy(true);
    const { error } = await createClient().rpc("admin_upsert_offer", {
      p_id: editId, p_name: form.name, p_description: form.description || null, p_image_url: form.image_url || null,
      p_reward_points: form.reward_points, p_asp: form.asp || null, p_click_url: form.click_url,
      p_incentive_ok: form.incentive_ok, p_is_active: form.is_active, p_display_order: form.display_order,
    });
    setBusy(false);
    if (error) { notify(`保存失敗: ${error.message}`); return; }
    notify(editId ? "案件を更新しました" : "案件を追加しました");
    startNew(); loadOffers();
  }

  async function toggleActive(o: AffiliateOffer) {
    const { error } = await createClient().rpc("admin_set_offer_active", { p_id: o.id, p_active: !o.is_active });
    notify(error ? `失敗: ${error.message}` : (o.is_active ? "非公開にしました" : "公開しました"));
    if (!error) loadOffers();
  }

  async function approve(t: string) {
    if (!t.trim()) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("admin_approve_conversion", { p_token: t.trim() });
    setBusy(false);
    if (error) { notify(`承認失敗: ${error.message}`); return; }
    notify(`承認: +${formatPoints(data?.granted ?? 0)} 参加pt を付与`);
    setToken(""); loadClicks(); loadConvs();
  }

  return (
    <div className="space-y-8">
      {/* ── 提携案件マスタ ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold">提携案件 / Offers</h2>
          <button onClick={startNew} className="text-sm rounded-sm border border-border px-3 py-1.5 text-dim hover:text-text">＋ 新規</button>
        </div>

        <div className="rounded-[var(--radius)] border border-border bg-surface p-4 space-y-2 max-w-2xl" style={{ boxShadow: "var(--shadow)" }}>
          <div className="text-xs font-bold text-dim">{editId ? "案件を編集" : "新しい案件を追加"}</div>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="案件名（例: ○○カード新規発行）"
            className="w-full rounded-sm bg-surface2 border border-border px-2 py-1.5 text-sm" />
          <input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="説明・成果条件（任意）"
            className="w-full rounded-sm bg-surface2 border border-border px-2 py-1.5 text-sm" />
          <input value={form.click_url} onChange={(e) => setForm({ ...form, click_url: e.target.value })} placeholder="計測リンク（sub-id 位置に {TOKEN} を入れる）"
            className="w-full rounded-sm bg-surface2 border border-border px-2 py-1.5 text-sm font-mono text-[12px]" />
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-xs text-dim flex items-center gap-1">付与 参加pt
              <input type="number" min={1} value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: Math.max(1, Math.floor(Number(e.target.value))) })}
                className="num w-24 rounded-sm bg-surface2 border border-border px-2 py-1" />
            </label>
            <label className="text-xs text-dim flex items-center gap-1">ASP
              <input value={form.asp ?? ""} onChange={(e) => setForm({ ...form, asp: e.target.value })} placeholder="a8 / afb…"
                className="w-24 rounded-sm bg-surface2 border border-border px-2 py-1" />
            </label>
            <label className="text-xs text-dim flex items-center gap-1">表示順
              <input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Math.floor(Number(e.target.value)) })}
                className="num w-16 rounded-sm bg-surface2 border border-border px-2 py-1" />
            </label>
            <label className="text-xs text-dim flex items-center gap-1.5">
              <input type="checkbox" checked={form.incentive_ok} onChange={(e) => setForm({ ...form, incentive_ok: e.target.checked })} />
              インセンティブ可（規約確認済）
            </label>
            <label className="text-xs text-dim flex items-center gap-1.5">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              公開する
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !form.name || !form.click_url} className="rounded-sm bg-primary text-white px-4 py-1.5 text-sm disabled:opacity-50">
              {editId ? "更新" : "追加"}
            </button>
            {editId && <button onClick={startNew} className="rounded-sm border border-border text-dim px-4 py-1.5 text-sm">キャンセル</button>}
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-border bg-surface divide-y divide-border" style={{ boxShadow: "var(--shadow)" }}>
          {offers.length === 0 ? <p className="p-4 text-dim text-sm">案件がありません。</p> :
            offers.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 min-w-0 truncate font-semibold">{o.name}</span>
                {!o.incentive_ok && <span className="text-[10px] text-neg" title="インセンティブ可否未確認">規約要確認</span>}
                <span className="num text-pos font-bold">+{formatPoints(o.reward_points)}</span>
                <span className="text-[11px] text-dim">{o.asp ?? "—"}</span>
                <span className={`text-xs w-14 text-center rounded-full px-2 py-0.5 ${o.is_active ? "text-pos bg-pos/10" : "text-faint bg-surface2"}`}>{o.is_active ? "公開" : "非公開"}</span>
                <button onClick={() => startEdit(o)} className="text-xs text-dim hover:text-text underline">編集</button>
                <button onClick={() => toggleActive(o)} className="text-xs text-dim hover:text-text underline">{o.is_active ? "非公開に" : "公開に"}</button>
              </div>
            ))}
        </div>
      </section>

      {/* ── 成果の手動消し込み ── */}
      <section className="space-y-3">
        <h2 className="text-[16px] font-bold">成果の消し込み / Approve</h2>
        <div className="rounded-[var(--radius)] border border-border bg-surface p-4 space-y-2" style={{ boxShadow: "var(--shadow)" }}>
          <div className="text-xs text-dim">ASPの成果レポートの <b className="text-text">sub-id（トークン）</b> を貼り付けて承認すると、該当ユーザーに参加ポイントを付与します。</div>
          <div className="flex gap-2">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="成果トークン（sub-id）を貼り付け"
              className="flex-1 rounded-sm bg-surface2 border border-border px-2 py-1.5 text-sm font-mono text-[12px]" />
            <button onClick={() => approve(token)} disabled={busy || !token.trim()} className="rounded-sm bg-pos text-white px-4 py-1.5 text-sm font-bold disabled:opacity-50">承認して付与</button>
          </div>
        </div>

        {/* 消し込み待ちクリック */}
        <div>
          <div className="text-xs font-bold text-dim mb-1.5">消し込み待ちクリック（{clicks.length}）</div>
          <div className="max-h-72 overflow-y-auto rounded-[var(--radius)] border border-border bg-surface divide-y divide-border">
            {clicks.length === 0 ? <p className="p-3 text-xs text-dim">なし</p> :
              clicks.map((c) => (
                <div key={c.token} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="text-dim w-24 shrink-0">{new Date(c.clicked_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="flex-1 min-w-0 truncate">{c.offer_name} · {c.display_name}</span>
                  <code className="text-[10px] text-faint truncate max-w-[140px]">{c.token}</code>
                  <button onClick={() => approve(c.token)} disabled={busy} className="text-xs text-pos hover:underline shrink-0">承認</button>
                </div>
              ))}
          </div>
        </div>

        {/* 成果履歴 */}
        <div>
          <div className="text-xs font-bold text-dim mb-1.5">承認済み履歴</div>
          <div className="max-h-72 overflow-y-auto rounded-[var(--radius)] border border-border bg-surface divide-y divide-border">
            {convs.length === 0 ? <p className="p-3 text-xs text-dim">なし</p> :
              convs.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="text-dim w-24 shrink-0">{new Date(c.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="flex-1 min-w-0 truncate">{c.offer_name} · {c.display_name}</span>
                  <span className="num text-pos font-bold">+{formatPoints(c.reward_points)}</span>
                </div>
              ))}
          </div>
        </div>
        <p className="text-[11px] text-faint">※ 付与は参加ポイント（無償発行・換金不可）。AdSense等のインセンティブクリックは不採用。インセンティブ可否は案件ごとに各広告主の規約を確認すること。</p>
      </section>
    </div>
  );
}
