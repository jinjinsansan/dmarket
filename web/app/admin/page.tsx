"use client";
// 管理コンソール（SPEC-07）。is_admin で保護。解決キュー＋市場作成（最頻出操作を優先）。
// 認証(LINEログイン)は後回しのため、管理者セッションが入るまでは閲覧/操作不可。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, MarketWithOutcomes } from "@/lib/types";

export default function AdminPage() {
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [queue, setQueue] = useState<MarketWithOutcomes[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    const { data: admin } = await sb.rpc("is_admin");
    setIsAdmin(Boolean(admin));
    setChecked(true);
    if (!admin) return;
    const nowIso = new Date().toISOString();
    const [{ data: q }, { data: cats }] = await Promise.all([
      sb
        .from("markets")
        .select("*, outcomes(*)")
        .eq("resolution_kind", "manual")
        .in("status", ["open", "closed"])
        .lte("resolve_time", nowIso),
      sb.from("categories").select("*").order("display_order"),
    ]);
    setQueue((q as MarketWithOutcomes[]) ?? []);
    setCategories((cats as Category[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!checked) return <p className="text-dim text-sm py-16 text-center">確認中…</p>;
  if (!isAdmin) {
    return (
      <div className="py-16 text-center text-dim">
        <p>管理者専用ページです。</p>
        <p className="text-xs mt-2">管理者ログイン（LINEログイン実装後）が必要です。</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">管理コンソール</h1>
      {msg && <p className="text-sm text-primary">{msg}</p>}

      <section>
        <h2 className="text-sm font-medium mb-2">解決キュー（{queue.length}）</h2>
        {queue.length === 0 ? (
          <p className="text-dim text-sm">解決待ちの市場はありません。</p>
        ) : (
          <div className="space-y-2">
            {queue.map((m) => (
              <ResolveRow key={m.id} market={m} onDone={(t) => { setMsg(t); load(); }} />
            ))}
          </div>
        )}
      </section>

      <CreateMarket categories={categories} onDone={(t) => { setMsg(t); load(); }} />
    </div>
  );
}

function ResolveRow({ market, onDone }: { market: MarketWithOutcomes; onDone: (msg: string) => void }) {
  const outcomes = [...market.outcomes].sort((a, b) => a.display_order - b.display_order);
  const [winner, setWinner] = useState(outcomes[0]?.id ?? "");
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const sb = createClient();
    const { error } = await sb.rpc("admin_resolve", { p_market_id: market.id, p_winning_outcome_id: winner, p_source_url: src });
    setBusy(false);
    onDone(error ? `解決失敗: ${error.message}` : `「${market.question}」を解決しました`);
  }
  async function voidMarket() {
    setBusy(true);
    const sb = createClient();
    const { error } = await sb.rpc("admin_void", { p_market_id: market.id, p_reason: src || "中止" });
    setBusy(false);
    onDone(error ? `中止失敗: ${error.message}` : `「${market.question}」を中止しました`);
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-3 space-y-2">
      <p className="text-sm">{market.question}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={winner} onChange={(e) => setWinner(e.target.value)} className="rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm">
          {outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="根拠ソースURL"
          className="flex-1 min-w-40 rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm" />
        <button onClick={resolve} disabled={busy} className="rounded-sm bg-primary text-white px-3 py-1 text-sm disabled:opacity-50">確定</button>
        <button onClick={voidMarket} disabled={busy} className="rounded-sm border border-border text-dim px-3 py-1 text-sm">中止</button>
      </div>
    </div>
  );
}

function CreateMarket({ categories, onDone }: { categories: Category[]; onDone: (msg: string) => void }) {
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState("");
  const [yesPrice, setYesPrice] = useState(0.5);
  const [b, setB] = useState(200);
  const [close, setClose] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const sb = createClient();
    const closeIso = close ? new Date(close).toISOString() : new Date(Date.now() + 86400000).toISOString();
    const { error } = await sb.rpc("create_admin_market", {
      p_question: q,
      p_description: null,
      p_image_url: null,
      p_category_id: catId || null,
      p_market_kind: "binary",
      p_outcomes: [{ label: "YES", display_order: 0 }, { label: "NO", display_order: 1 }],
      p_b: b,
      p_close_time: closeIso,
      p_resolve_time: closeIso,
      p_initial_yes_price: yesPrice,
    });
    setBusy(false);
    onDone(error ? `作成失敗: ${error.message}` : `市場「${q}」を作成しました`);
    if (!error) setQ("");
  }

  return (
    <section>
      <h2 className="text-sm font-medium mb-2">市場作成（二択）</h2>
      <div className="rounded-[var(--radius)] border border-border bg-surface p-3 space-y-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="質問（例: BTCは6/30に7万ドルを超えるか？）"
          className="w-full rounded-sm bg-surface-2 border border-border px-2 py-1.5 text-sm" />
        <div className="flex flex-wrap gap-2">
          <select value={catId} onChange={(e) => setCatId(e.target.value)} className="rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm">
            <option value="">カテゴリ</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="text-xs text-dim flex items-center gap-1">初期YES確率
            <input type="number" step="0.01" min={0.01} max={0.99} value={yesPrice}
              onChange={(e) => setYesPrice(Number(e.target.value))}
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
    </section>
  );
}
