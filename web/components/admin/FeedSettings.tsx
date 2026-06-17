"use client";
// カテゴリ別フィード設定（SPEC-07 §5 / SPEC-04 §8）。プリセット＋生ダイヤル。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

interface Settings {
  target_active: number; poly_min: number; poly_max: number; daily_gen_cap: number;
  poly_sort: string; template_enabled: boolean; mode: string;
}
const DEFAULT: Settings = { target_active: 10, poly_min: 3, poly_max: 12, daily_gen_cap: 20, poly_sort: "volume_24hr", template_enabled: false, mode: "balanced" };

const PRESETS: Record<string, Partial<Settings>> = {
  おまかせ: { target_active: 15, poly_min: 5, poly_max: 20, daily_gen_cap: 30, mode: "busy" },
  バランス: { target_active: 10, poly_min: 3, poly_max: 12, daily_gen_cap: 20, mode: "balanced" },
  自分で回す: { target_active: 10, poly_min: 1, poly_max: 4, daily_gen_cap: 10, mode: "manual" },
};

export function FeedSettings({ notify }: { notify: (m: string) => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [edits, setEdits] = useState<Record<string, Settings>>({});
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const load = useCallback(async () => {
    const sb = createClient();
    const [{ data: c }, { data: s }] = await Promise.all([
      sb.from("categories").select("*").order("display_order"),
      sb.from("category_feed_settings").select("*"),
    ]);
    const sMap = new Map((s ?? []).map((x) => [x.category_id, x]));
    const e: Record<string, Settings> = {};
    for (const cat of (c as Category[]) ?? []) {
      const row = sMap.get(cat.id);
      e[cat.id] = row ? {
        target_active: row.target_active, poly_min: row.poly_min, poly_max: row.poly_max,
        daily_gen_cap: row.daily_gen_cap, poly_sort: row.poly_sort, template_enabled: row.template_enabled, mode: row.mode,
      } : { ...DEFAULT };
    }
    setCats((c as Category[]) ?? []);
    setEdits(e);
  }, []);
  useEffect(() => { load(); }, [load]);

  function set(id: string, patch: Partial<Settings>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function save(id: string) {
    const s = edits[id];
    const { error } = await createClient().rpc("upsert_feed_settings", {
      p_category_id: id, p_target_active: s.target_active, p_poly_min: s.poly_min, p_poly_max: s.poly_max,
      p_daily_gen_cap: s.daily_gen_cap, p_poly_tag_ids: [], p_poly_sort: s.poly_sort,
      p_template_enabled: s.template_enabled, p_mode: s.mode,
    });
    notify(error ? `保存失敗: ${error.message}` : "設定を保存しました");
  }

  async function addCategory() {
    if (!newSlug || !newName) return;
    const { error } = await createClient().rpc("upsert_category", {
      p_id: null, p_slug: newSlug, p_name: newName, p_display_order: cats.length, p_is_active: true,
    });
    notify(error ? `追加失敗: ${error.message}` : `カテゴリ「${newName}」を追加`);
    if (!error) { setNewName(""); setNewSlug(""); load(); }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-dim">
        「目標市場数」を埋めるよう、不足分だけPolyミラーが自動供給されます。poly_max=0 でそのカテゴリはPoly禁止（自分の城）。
        走行中の市場は減らしても消えません。
      </p>

      {cats.map((c) => {
        const s = edits[c.id];
        if (!s) return null;
        return (
          <div key={c.id} className="rounded-[var(--radius)] border border-border bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{c.name}</span>
              <div className="flex gap-1">
                {Object.keys(PRESETS).map((p) => (
                  <button key={p} onClick={() => set(c.id, PRESETS[p])}
                    className="text-xs rounded-sm border border-border text-dim hover:text-text px-2 py-0.5">{p}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Num label="目標" v={s.target_active} on={(v) => set(c.id, { target_active: v })} />
              <Num label="poly下限" v={s.poly_min} on={(v) => set(c.id, { poly_min: v })} />
              <Num label="poly上限" v={s.poly_max} on={(v) => set(c.id, { poly_max: v })} />
              <Num label="1日上限" v={s.daily_gen_cap} on={(v) => set(c.id, { daily_gen_cap: v })} />
            </div>
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={s.template_enabled} onChange={(e) => set(c.id, { template_enabled: e.target.checked })} />
                自前テンプレ有効
              </label>
              <select value={s.poly_sort} onChange={(e) => set(c.id, { poly_sort: e.target.value })}
                className="rounded-sm bg-surface-2 border border-border px-2 py-1">
                <option value="volume_24hr">出来高</option>
                <option value="liquidity">流動性</option>
                <option value="competitive">接戦</option>
              </select>
              <button onClick={() => save(c.id)} className="ml-auto rounded-sm bg-primary text-white px-3 py-1">保存</button>
            </div>
          </div>
        );
      })}

      <div className="rounded-[var(--radius)] border border-dashed border-border p-3 flex flex-wrap gap-2 items-center">
        <span className="text-sm text-dim">カテゴリ追加:</span>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="表示名"
          className="rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm" />
        <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="slug"
          className="rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm" />
        <button onClick={addCategory} className="rounded-sm border border-border px-3 py-1 text-sm">追加</button>
      </div>
    </div>
  );
}

function Num({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <label className="text-dim flex flex-col gap-1">
      {label}
      <input type="number" value={v} onChange={(e) => on(Math.max(0, Math.floor(Number(e.target.value))))}
        className="num rounded-sm bg-surface-2 border border-border px-2 py-1 text-text" />
    </label>
  );
}
