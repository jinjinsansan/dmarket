"use client";
// テンプレ管理（ゴリラ予想刷新）。天気/デイリーのプリセット作成＋手動生成＋一覧。上級者向け生JSONも保持。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

interface Template {
  id: string; category_id: string | null; name: string; question_pattern: string;
  schedule_cron: string; resolution_binding: { kind?: string; metric?: string; station?: string; threshold?: number } | null;
  params_source: { offsets?: number[] } | null; initial_q_rule: unknown; is_active: boolean;
}

// 主要都市のAMeDAS地点（東京=44132は検証済み。他は要確認だが編集可）
const CITIES: { area: string; station: string }[] = [
  { area: "東京", station: "44132" }, { area: "大阪", station: "62078" },
  { area: "名古屋", station: "51106" }, { area: "福岡", station: "82182" },
  { area: "札幌", station: "14163" }, { area: "那覇", station: "91197" },
];
const METRICS = [
  { key: "precip", label: "雨が降る", op: ">", needThreshold: false },
  { key: "temp_max", label: "最高気温が◯℃以上", op: ">=", needThreshold: true },
  { key: "temp_min", label: "最低気温が◯℃以下", op: "<=", needThreshold: true },
] as const;

export function Templates({ notify }: { notify: (m: string) => void }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [list, setList] = useState<Template[]>([]);
  const [gen, setGen] = useState(false);
  // 天気プリセット
  const [wx, setWx] = useState({ area: "東京", station: "44132", metric: "precip" as string, threshold: 30, tomorrow: true });
  // 上級（生JSON）
  const [adv, setAdv] = useState(false);
  const [form, setForm] = useState({
    category_id: "", name: "", question_pattern: "", schedule_cron: "daily",
    resolution_binding: '{"kind":"price_threshold","feed":"crypto"}',
    params_source: '{"cadence":"daily","offsets":[0,1]}', initial_q_rule: '{"p":0.5}',
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

  const weatherCat = cats.find((c) => c.slug === "weather");

  async function generateNow() {
    setGen(true);
    const { data, error } = await createClient().functions.invoke("generate-markets", { body: {} });
    setGen(false);
    if (error) { notify(`生成失敗: ${error.message}`); return; }
    const g = (data as { generated?: Record<string, number> })?.generated ?? {};
    const made = Object.entries(g).filter(([k]) => k.endsWith(":tmpl")).reduce((a, [, v]) => a + (v || 0), 0);
    notify(`生成ジョブ実行：テンプレから ${made} 件作成`);
    load();
  }

  async function createWeather() {
    if (!weatherCat) { notify("天気カテゴリがありません（0027/手動作成が必要）"); return; }
    const m = METRICS.find((x) => x.key === wx.metric)!;
    const th = m.needThreshold ? wx.threshold : 0;
    const qp = m.key === "precip" ? `{date} の${wx.area}は雨が降る？`
      : m.key === "temp_max" ? `{date} の${wx.area}は最高気温${th}℃以上？`
      : `{date} の${wx.area}は最低気温${th}℃以下？`;
    const name = `${wx.area}・${m.key === "precip" ? "雨" : m.key === "temp_max" ? `${th}℃以上` : `${th}℃以下`}（デイリー）`;
    const { error } = await createClient().rpc("upsert_template", {
      p_id: null, p_category_id: weatherCat.id, p_name: name, p_question_pattern: qp,
      p_params_source: { station: wx.station, area: wx.area, cadence: "daily", offsets: wx.tomorrow ? [0, 1] : [0] },
      p_schedule_cron: "daily",
      p_resolution_binding: { kind: "weather", station: wx.station, metric: wx.metric, operator: m.op, threshold: th, yes_if_true: true },
      p_initial_q_rule: { p: 0.5 }, p_is_active: true,
    });
    notify(error ? `作成失敗: ${error.message}` : `天気テンプレ「${name}」を作成`);
    if (!error) load();
  }

  async function createAdv() {
    let binding: unknown, params: unknown, qrule: unknown;
    try { binding = JSON.parse(form.resolution_binding); params = JSON.parse(form.params_source); qrule = JSON.parse(form.initial_q_rule); }
    catch { notify("JSON の形式が不正です"); return; }
    const { error } = await createClient().rpc("upsert_template", {
      p_id: null, p_category_id: form.category_id || null, p_name: form.name,
      p_question_pattern: form.question_pattern, p_params_source: params,
      p_schedule_cron: form.schedule_cron, p_resolution_binding: binding, p_initial_q_rule: qrule, p_is_active: true,
    });
    notify(error ? `作成失敗: ${error.message}` : `テンプレ「${form.name}」を作成`);
    if (!error) { setForm({ ...form, name: "", question_pattern: "" }); load(); }
  }

  async function remove(id: string) {
    const { error } = await createClient().rpc("delete_template", { p_id: id });
    notify(error ? `削除失敗: ${error.message}` : "テンプレを削除");
    if (!error) load();
  }

  const sel = METRICS.find((x) => x.key === wx.metric)!;

  return (
    <div className="space-y-5">
      {/* 手動生成 */}
      <div className="rounded-[var(--radius)] border border-border bg-surface p-4 flex items-center gap-3" style={{ boxShadow: "var(--shadow)" }}>
        <div className="flex-1">
          <div className="text-sm font-bold">今すぐ生成</div>
          <div className="text-xs text-dim">アクティブなテンプレから、本日/明日分の市場をすぐ作成（通常は15分ごとに自動実行）。</div>
        </div>
        <button onClick={generateNow} disabled={gen} className="rounded-[10px] text-white font-bold text-sm px-4 py-2 disabled:opacity-50" style={{ background: "var(--grad)" }}>{gen ? "生成中…" : "実行"}</button>
      </div>

      {/* 天気テンプレ プリセット */}
      <div className="rounded-[var(--radius)] border border-border bg-surface p-4 space-y-3" style={{ boxShadow: "var(--shadow)" }}>
        <div className="text-sm font-bold">天気テンプレを作成（デイリー）</div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={wx.area} onChange={(e) => { const c = CITIES.find((x) => x.area === e.target.value); setWx({ ...wx, area: e.target.value, station: c?.station ?? wx.station }); }}
            className="rounded-[8px] bg-surface2 border border-border px-2.5 py-1.5 text-sm">
            {CITIES.map((c) => <option key={c.station} value={c.area}>{c.area}</option>)}
          </select>
          <input value={wx.station} onChange={(e) => setWx({ ...wx, station: e.target.value })} placeholder="AMeDAS地点"
            className="num w-24 rounded-[8px] bg-surface2 border border-border px-2.5 py-1.5 text-sm" />
          <select value={wx.metric} onChange={(e) => setWx({ ...wx, metric: e.target.value })}
            className="rounded-[8px] bg-surface2 border border-border px-2.5 py-1.5 text-sm">
            {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {sel.needThreshold && (
            <input type="number" value={wx.threshold} onChange={(e) => setWx({ ...wx, threshold: Number(e.target.value) })}
              className="num w-20 rounded-[8px] bg-surface2 border border-border px-2.5 py-1.5 text-sm" />
          )}
          <label className="text-xs text-dim flex items-center gap-1.5">
            <input type="checkbox" checked={wx.tomorrow} onChange={(e) => setWx({ ...wx, tomorrow: e.target.checked })} />明日分も
          </label>
          <button onClick={createWeather} className="ml-auto rounded-[10px] bg-primary text-white font-bold text-sm px-4 py-2">作成</button>
        </div>
        <p className="text-[11px] text-faint">解決は気象庁AMeDASの観測で自動。東京(44132)は検証済み。他都市の地点コードは念のためご確認ください。</p>
      </div>

      {/* 一覧 */}
      <div className="space-y-2">
        <div className="text-[13px] font-extrabold text-dim">登録済みテンプレ（{list.length}）</div>
        {list.length === 0 && <p className="text-dim text-sm">テンプレートはありません。</p>}
        {list.map((t) => (
          <div key={t.id} className="rounded-[var(--radius)] border border-border bg-surface p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t.name} {!t.is_active && <span className="text-dim text-xs">（無効）</span>}</p>
              <p className="text-xs text-dim truncate">{t.question_pattern}</p>
              <p className="text-[11px] text-faint">
                {t.resolution_binding?.kind === "weather" ? `天気 / ${t.resolution_binding.metric} / 地点${t.resolution_binding.station}` : t.resolution_binding?.kind ?? "—"}
                {t.params_source?.offsets ? ` · offsets[${t.params_source.offsets.join(",")}]` : ""} · {t.schedule_cron}
              </p>
            </div>
            <button onClick={() => remove(t.id)} className="text-xs text-neg border border-border rounded-[8px] px-2.5 py-1.5">削除</button>
          </div>
        ))}
      </div>

      {/* 上級（生JSON） */}
      <button onClick={() => setAdv(!adv)} className="text-xs text-dim hover:text-text">{adv ? "▾" : "▸"} 上級：生JSONでテンプレ追加</button>
      {adv && (
        <div className="rounded-[var(--radius)] border border-dashed border-border p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="rounded-sm bg-surface2 border border-border px-2 py-1 text-sm">
              <option value="">カテゴリ</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="名前" className="rounded-sm bg-surface2 border border-border px-2 py-1 text-sm" />
            <input value={form.schedule_cron} onChange={(e) => setForm({ ...form, schedule_cron: e.target.value })} placeholder="schedule" className="num rounded-sm bg-surface2 border border-border px-2 py-1 text-sm w-28" />
          </div>
          <input value={form.question_pattern} onChange={(e) => setForm({ ...form, question_pattern: e.target.value })}
            placeholder="質問パターン（{date} を含む）" className="w-full rounded-sm bg-surface2 border border-border px-2 py-1 text-sm" />
          <div className="grid sm:grid-cols-3 gap-2">
            <JsonField label="resolution_binding" v={form.resolution_binding} on={(v) => setForm({ ...form, resolution_binding: v })} />
            <JsonField label="params_source" v={form.params_source} on={(v) => setForm({ ...form, params_source: v })} />
            <JsonField label="initial_q_rule" v={form.initial_q_rule} on={(v) => setForm({ ...form, initial_q_rule: v })} />
          </div>
          <button onClick={createAdv} disabled={!form.name} className="rounded-sm bg-primary text-white px-4 py-1.5 text-sm disabled:opacity-50">作成</button>
        </div>
      )}
    </div>
  );
}

function JsonField({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="text-xs text-dim flex flex-col gap-1">
      {label}
      <textarea value={v} onChange={(e) => on(e.target.value)} rows={2} className="num rounded-sm bg-surface2 border border-border px-2 py-1 text-text text-xs" />
    </label>
  );
}
