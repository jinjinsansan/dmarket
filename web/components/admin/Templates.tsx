"use client";
// テンプレ管理（SPEC-07 §4）。自前データから市場を自動生成する素のCRUD。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

interface Template {
  id: string; category_id: string | null; name: string; question_pattern: string;
  schedule_cron: string; resolution_binding: unknown; params_source: unknown;
  initial_q_rule: unknown; is_active: boolean;
}

export function Templates({ notify }: { notify: (m: string) => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [list, setList] = useState<Template[]>([]);
  const [form, setForm] = useState({
    category_id: "", name: "", question_pattern: "", schedule_cron: "0 9 * * *",
    resolution_binding: '{"kind":"price_threshold","feed":"crypto"}',
    params_source: '{"date":"today"}', initial_q_rule: '{"source":"flat"}',
  });

  const load = useCallback(async () => {
    const sb = createClient();
    const [{ data: c }, { data: t }] = await Promise.all([
      sb.from("categories").select("*").order("display_order"),
      sb.from("market_templates").select("*").order("name"),
    ]);
    setCats((c as Category[]) ?? []);
    setList((t as Template[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    let binding: unknown, params: unknown, qrule: unknown;
    try {
      binding = JSON.parse(form.resolution_binding);
      params = JSON.parse(form.params_source);
      qrule = JSON.parse(form.initial_q_rule);
    } catch {
      notify("JSON の形式が不正です");
      return;
    }
    const { error } = await createClient().rpc("upsert_template", {
      p_id: null, p_category_id: form.category_id || null, p_name: form.name,
      p_question_pattern: form.question_pattern, p_params_source: params,
      p_schedule_cron: form.schedule_cron, p_resolution_binding: binding,
      p_initial_q_rule: qrule, p_is_active: true,
    });
    notify(error ? `作成失敗: ${error.message}` : `テンプレ「${form.name}」を作成`);
    if (!error) { setForm({ ...form, name: "", question_pattern: "" }); load(); }
  }

  async function remove(id: string) {
    const { error } = await createClient().rpc("delete_template", { p_id: id });
    notify(error ? `削除失敗: ${error.message}` : "テンプレを削除");
    if (!error) load();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {list.length === 0 && <p className="text-dim text-sm">テンプレートはありません。</p>}
        {list.map((t) => (
          <div key={t.id} className="rounded-[var(--radius)] border border-border bg-surface p-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm">{t.name} {!t.is_active && <span className="text-dim text-xs">（無効）</span>}</p>
              <p className="text-xs text-dim num">{t.question_pattern}</p>
              <p className="text-xs text-dim num">cron: {t.schedule_cron}</p>
            </div>
            <button onClick={() => remove(t.id)} className="text-xs text-[var(--neg)] border border-border rounded-sm px-2 py-1">削除</button>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--radius)] border border-dashed border-border p-3 space-y-2">
        <p className="text-sm font-medium">テンプレ追加</p>
        <div className="flex flex-wrap gap-2">
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm">
            <option value="">カテゴリ</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="名前"
            className="rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm" />
          <input value={form.schedule_cron} onChange={(e) => setForm({ ...form, schedule_cron: e.target.value })} placeholder="cron"
            className="num rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm w-32" />
        </div>
        <input value={form.question_pattern} onChange={(e) => setForm({ ...form, question_pattern: e.target.value })}
          placeholder="質問パターン（例: BTCは{date}に{threshold}を超えるか）"
          className="w-full rounded-sm bg-surface-2 border border-border px-2 py-1 text-sm" />
        <div className="grid sm:grid-cols-3 gap-2">
          <JsonField label="resolution_binding" v={form.resolution_binding} on={(v) => setForm({ ...form, resolution_binding: v })} />
          <JsonField label="params_source" v={form.params_source} on={(v) => setForm({ ...form, params_source: v })} />
          <JsonField label="initial_q_rule" v={form.initial_q_rule} on={(v) => setForm({ ...form, initial_q_rule: v })} />
        </div>
        <button onClick={create} disabled={!form.name} className="rounded-sm bg-primary text-white px-4 py-1.5 text-sm disabled:opacity-50">作成</button>
      </div>
    </div>
  );
}

function JsonField({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="text-xs text-dim flex flex-col gap-1">
      {label}
      <textarea value={v} onChange={(e) => on(e.target.value)} rows={2}
        className="num rounded-sm bg-surface-2 border border-border px-2 py-1 text-text text-xs" />
    </label>
  );
}
