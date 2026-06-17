"use client";
// 市場作成（SPEC-07 §3）。二択・初期YES確率でqシード。
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

export function CreateMarket({ notify }: { notify: (m: string) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState("");
  const [yesPrice, setYesPrice] = useState(0.5);
  const [b, setB] = useState(200);
  const [close, setClose] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createClient().from("categories").select("*").order("display_order").then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);

  async function create() {
    setBusy(true);
    const closeIso = close ? new Date(close).toISOString() : new Date(Date.now() + 86400000).toISOString();
    const { error } = await createClient().rpc("create_admin_market", {
      p_question: q, p_description: null, p_image_url: null, p_category_id: catId || null,
      p_market_kind: "binary",
      p_outcomes: [{ label: "YES", display_order: 0 }, { label: "NO", display_order: 1 }],
      p_b: b, p_close_time: closeIso, p_resolve_time: closeIso, p_initial_yes_price: yesPrice,
    });
    setBusy(false);
    notify(error ? `作成失敗: ${error.message}` : `市場「${q}」を作成しました`);
    if (!error) setQ("");
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4 space-y-2 max-w-2xl">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="質問（例: BTCは6/30に7万ドルを超えるか？）"
        className="w-full rounded-sm bg-surface-2 border border-border px-2 py-1.5 text-sm" />
      <div className="flex flex-wrap gap-2">
        <select value={catId} onChange={(e) => setCatId(e.target.value)} className="rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm">
          <option value="">カテゴリ</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="text-xs text-dim flex items-center gap-1">初期YES確率
          <input type="number" step="0.01" min={0.01} max={0.99} value={yesPrice} onChange={(e) => setYesPrice(Number(e.target.value))}
            className="num w-20 rounded-sm bg-surface-2 border border-border px-2 py-1" />
        </label>
        <label className="text-xs text-dim flex items-center gap-1">b
          <input type="number" value={b} onChange={(e) => setB(Number(e.target.value))}
            className="num w-20 rounded-sm bg-surface-2 border border-border px-2 py-1" />
        </label>
        <label className="text-xs text-dim flex items-center gap-1">締切
          <input type="datetime-local" value={close} onChange={(e) => setClose(e.target.value)}
            className="rounded-sm bg-surface-2 border border-border px-2 py-1" />
        </label>
      </div>
      <button onClick={create} disabled={busy || !q} className="rounded-sm bg-primary text-white px-4 py-1.5 text-sm disabled:opacity-50">作成</button>
    </div>
  );
}
