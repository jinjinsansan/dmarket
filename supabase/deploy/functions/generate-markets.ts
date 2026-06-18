// ============================================================
// generate-markets（SupabaseダッシュボードUI貼り付け用・単一ファイル版）
// 15分ごとに各カテゴリの gap を計算し、不足分だけ Polymarket をミラー生成。
// 走行中の市場は消さない。冪等（poly_mirror_cache）。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Supabase が自動注入。
// ============================================================
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const B_DEFAULT = 200;
const MIN_HOURS_TO_CLOSE = 2;
const GAMMA_BASE = "https://gamma-api.polymarket.com";

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定");
  return createClient(url, key, { auth: { persistSession: false } });
}
function seedQBinary(b: number, price: number): number {
  const p = Math.min(Math.max(price, 1e-6), 1 - 1e-6);
  return b * Math.log(p / (1 - p));
}
// 英語→日本語。優先順位 DeepSeek → Claude(haiku) → 無料MyMemory → 原文。
// DEEPSEEK_API_KEY か ANTHROPIC_API_KEY を Secret に設定すれば高品質。
async function toJapanese(text: string): Promise<string> {
  if (!text) return text;
  const SYS = "予測市場の質問文を、自然で簡潔な日本語に翻訳する。出力は訳文のみ。引用符・注釈・前置きは付けない。";
  const deepseek = Deno.env.get("DEEPSEEK_API_KEY");
  const anthropic = Deno.env.get("ANTHROPIC_API_KEY");
  try {
    if (deepseek) {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${deepseek}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "system", content: SYS }, { role: "user", content: text }],
          max_tokens: 300, temperature: 0,
        }),
      });
      if (res.ok) { const j = await res.json(); const out = j?.choices?.[0]?.message?.content?.trim(); if (out) return out; }
    }
    if (anthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001", max_tokens: 300,
          system: SYS, messages: [{ role: "user", content: text }],
        }),
      });
      if (res.ok) { const j = await res.json(); const out = j?.content?.[0]?.text?.trim(); if (out) return out; }
    }
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ja`);
    if (r.ok) { const j = await r.json(); const out = j?.responseData?.translatedText; if (out && typeof out === "string" && !/^PLEASE/i.test(out)) return out; }
  } catch (_e) { /* 原文 */ }
  return text;
}
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}
async function gammaFetch(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(GAMMA_BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`Gamma ${path} ${res.status}`);
    return await res.json();
  }
  throw new Error(`Gamma ${path} rate-limited`);
}

interface GammaMarket {
  id: string; question: string; closed: boolean;
  outcomes: string[]; outcomePrices: number[]; endDate?: string;
  image?: string; groupItemTitle?: string; volume24hr?: number; liquidity?: number;
}

async function fetchPolyCandidates(opts: { tagIds: number[]; sort: string; limit: number }): Promise<GammaMarket[]> {
  const hasTag = opts.tagIds.length > 0 && opts.tagIds[0] > 0;
  const raw = await gammaFetch("/markets", {
    closed: "false", active: "true",
    limit: Math.max(opts.limit * 4, 40),
    tag_id: hasTag ? opts.tagIds[0] : undefined,
  });
  const list = (Array.isArray(raw) ? raw : raw?.data ?? []) as Record<string, unknown>[];
  const mapped = list.map((m) => ({
    id: String(m.id), question: String(m.question ?? ""), closed: Boolean(m.closed),
    outcomes: asArray<string>(m.outcomes), outcomePrices: asArray<string>(m.outcomePrices).map(Number),
    endDate: m.endDate as string | undefined,
    image: (m.image ?? m.icon) as string | undefined,
    groupItemTitle: (m.groupItemTitle as string | undefined) || undefined,
    volume24hr: m.volume24hr ? Number(m.volume24hr) : undefined,
    liquidity: m.liquidity ? Number(m.liquidity) : undefined,
  }));
  const key = opts.sort === "liquidity" ? "liquidity" : "volume24hr";
  return mapped.sort((a, b) => ((b[key] as number) ?? 0) - ((a[key] as number) ?? 0)).slice(0, opts.limit * 3);
}

Deno.serve(async () => {
  const sb = serviceClient();
  const summary: Record<string, number> = {};
  const { data: cats, error } = await sb.from("categories").select("id, slug").eq("is_active", true);
  if (error) return json({ error: error.message }, 500);

  for (const c of cats ?? []) {
    const { data: settings } = await sb.from("category_feed_settings").select("*").eq("category_id", c.id).maybeSingle();
    if (!settings) continue;

    const { data: nData, error: nErr } = await sb.rpc("compute_poly_to_generate", { p_category_id: c.id });
    if (nErr) { summary[`${c.slug}:err`] = 1; continue; }
    const n = Number(nData ?? 0);
    if (n <= 0) { summary[c.slug] = 0; continue; }

    let candidates: GammaMarket[] = [];
    try {
      candidates = await fetchPolyCandidates({ tagIds: settings.poly_tag_ids ?? [], sort: settings.poly_sort, limit: n });
    } catch (_e) { summary[`${c.slug}:gamma_err`] = 1; continue; }

    const ids = candidates.map((m) => m.id);
    const { data: existing } = await sb.from("poly_mirror_cache").select("poly_market_id, local_market_id").in("poly_market_id", ids);
    const mirrored = new Set((existing ?? []).filter((e) => e.local_market_id).map((e) => e.poly_market_id));

    const picked = candidates.filter((m) => {
      if (m.closed || mirrored.has(m.id) || m.outcomes.length !== 2 || !m.endDate) return false;
      const hrs = (new Date(m.endDate).getTime() - Date.now()) / 3.6e6;
      return hrs >= MIN_HOURS_TO_CLOSE;
    }).slice(0, n);

    let made = 0;
    for (const m of picked) {
      const yesPrice = m.outcomePrices[0] ?? 0.5;
      const close = m.endDate!;
      const src = m.groupItemTitle && !m.question.includes(m.groupItemTitle)
        ? `${m.groupItemTitle}: ${m.question}`
        : m.question;
      const question = await toJapanese(src); // 英語→日本語（失敗時は原文）
      const { data: marketId, error: cErr } = await sb.rpc("create_market_internal", {
        p_category_id: c.id, p_question: question, p_description: null, p_image_url: m.image ?? null,
        p_market_kind: "binary", p_b: B_DEFAULT, p_source: "mirror", p_resolution_kind: "auto",
        p_resolution_binding: { kind: "poly", poly_id: m.id, outcome_map: { Yes: "YES", No: "NO" } },
        p_external_ref: m.id, p_close_time: close, p_resolve_time: close,
        p_outcomes: [
          { label: "YES", display_order: 0, q: seedQBinary(B_DEFAULT, yesPrice) },
          { label: "NO", display_order: 1, q: 0 },
        ],
      });
      if (cErr) continue;
      await sb.from("poly_mirror_cache").upsert({
        poly_market_id: m.id, category_id: c.id, question: m.question,
        poly_price_yes: yesPrice, poly_close_time: close, local_market_id: marketId,
        fetched_at: new Date().toISOString(),
      });
      made++;
    }
    summary[c.slug] = made;
  }
  return json({ ok: true, generated: summary });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
