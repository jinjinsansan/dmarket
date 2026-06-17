// ============================================================
// resolve-markets（SupabaseダッシュボードUI貼り付け用・単一ファイル版）
// 5分ごとに auto市場（resolve_time到来）を機械判定し、
// resolved→resolve_market / pending→再試行 / error→解決キュー。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Supabase が自動注入。
// 外部feed（FEED_*_URL / DLOGIC_BASE_URL）未設定の間は pending（無理に確定しない）。
// ============================================================
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const PENDING_RETRY_CAP = 12;
const GAMMA_BASE = "https://gamma-api.polymarket.com";

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定");
  return createClient(url, key, { auth: { persistSession: false } });
}
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}
async function gammaFetch(path: string) {
  const url = new URL(GAMMA_BASE + path);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`Gamma ${path} ${res.status}`);
    return await res.json();
  }
  throw new Error(`Gamma ${path} rate-limited`);
}
async function fetchPolyResolution(polyId: string) {
  const raw = await gammaFetch(`/markets/${polyId}`);
  const m = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>;
  const closed = Boolean(m?.closed);
  const prices = asArray<string>(m?.outcomePrices).map(Number);
  const outcomes = asArray<string>(m?.outcomes);
  const sourceUrl = `https://polymarket.com/market/${polyId}`;
  if (!closed || prices.length === 0) return { resolved: false, winningLabel: null, sourceUrl };
  const wi = prices.findIndex((p) => p >= 0.99);
  if (wi < 0) return { resolved: false, winningLabel: null, sourceUrl };
  return { resolved: true, winningLabel: outcomes[wi] ?? null, sourceUrl };
}

interface OutcomeRow { id: string; label: string; display_order: number }
type ResolveResult =
  | { status: "resolved"; winningOutcomeId: string; sourceUrl: string; raw: unknown }
  | { status: "pending"; raw?: unknown }
  | { status: "error"; error: string; raw?: unknown };

function findByLabel(outcomes: OutcomeRow[], label: string) {
  const t = label.trim().toLowerCase();
  return outcomes.find((o) => o.label.trim().toLowerCase() === t);
}
function compare(op: string, a: number, b: number): boolean {
  switch (op) {
    case ">=": return a >= b; case ">": return a > b;
    case "<=": return a <= b; case "<": return a < b;
    case "==": return a === b; default: throw new Error(`unknown operator ${op}`);
  }
}
async function fetchReferencePrice(feed: string, symbol: string, atIso: string) {
  const base = Deno.env.get(`FEED_${feed.toUpperCase()}_URL`);
  if (!base) return null;
  const url = `${base}?symbol=${encodeURIComponent(symbol)}&at=${encodeURIComponent(atIso)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const j = await res.json();
  if (typeof j?.price !== "number") return null;
  return { value: j.price, sourceUrl: j.source_url ?? url };
}
async function resolvePriceThreshold(b: Record<string, unknown>, outcomes: OutcomeRow[]): Promise<ResolveResult> {
  const at = String(b.at);
  if (new Date(at).getTime() > Date.now()) return { status: "pending" };
  const ref = await fetchReferencePrice(String(b.feed), String(b.symbol), at);
  if (!ref) return { status: "pending" };
  const isTrue = compare(String(b.operator), ref.value, Number(b.threshold));
  const wantYes = isTrue === (b.yes_if_true !== false);
  const yes = findByLabel(outcomes, "YES"); const no = findByLabel(outcomes, "NO");
  if (!yes || !no) return { status: "error", error: "binary YES/NO not found", raw: ref };
  return { status: "resolved", winningOutcomeId: wantYes ? yes.id : no.id, sourceUrl: ref.sourceUrl,
    raw: { price: ref.value, threshold: b.threshold, operator: b.operator } };
}
async function resolveRaceResult(b: Record<string, unknown>, outcomes: OutcomeRow[]): Promise<ResolveResult> {
  const base = Deno.env.get("DLOGIC_BASE_URL");
  if (!base) return { status: "pending" };
  const raceId = String(b.race_id);
  const res = await fetch(`${base}/result?race_id=${encodeURIComponent(raceId)}`, { headers: { accept: "application/json" } });
  if (res.status === 404 || res.status === 425) return { status: "pending" };
  if (!res.ok) return { status: "error", error: `dlogic ${res.status}` };
  const j = await res.json();
  if (!j?.confirmed) return { status: "pending" };
  const map = (b.outcome_map ?? {}) as Record<string, string>;
  const winnerKey = String(j.winner_key ?? j.win ?? "");
  const o = map[winnerKey] ? findByLabel(outcomes, map[winnerKey]) : undefined;
  if (!o) return { status: "error", error: `no outcome for ${winnerKey}`, raw: j };
  return { status: "resolved", winningOutcomeId: o.id, sourceUrl: j.source_url ?? `${base}/race/${raceId}`, raw: j };
}
async function resolvePoly(b: Record<string, unknown>, outcomes: OutcomeRow[]): Promise<ResolveResult> {
  const r = await fetchPolyResolution(String(b.poly_id));
  if (!r.resolved || !r.winningLabel) return { status: "pending", raw: r };
  const map = (b.outcome_map ?? {}) as Record<string, string>;
  const o = findByLabel(outcomes, map[r.winningLabel] ?? r.winningLabel);
  if (!o) return { status: "error", error: `no local outcome for ${r.winningLabel}`, raw: r };
  return { status: "resolved", winningOutcomeId: o.id, sourceUrl: r.sourceUrl, raw: r };
}
async function resolveBinding(binding: Record<string, unknown>, outcomes: OutcomeRow[]): Promise<ResolveResult> {
  try {
    switch (binding.kind) {
      case "price_threshold": case "numeric_feed": return await resolvePriceThreshold(binding, outcomes);
      case "race_result": return await resolveRaceResult(binding, outcomes);
      case "poly": return await resolvePoly(binding, outcomes);
      default: return { status: "error", error: `unsupported binding kind: ${binding.kind}` };
    }
  } catch (e) { return { status: "error", error: e instanceof Error ? e.message : String(e) }; }
}

Deno.serve(async () => {
  const sb = serviceClient();
  const result = { resolved: 0, pending: 0, error: 0 };
  const { data: due, error } = await sb.from("markets")
    .select("id, resolution_binding, status").eq("resolution_kind", "auto")
    .in("status", ["open", "closed", "resolving"]).lte("resolve_time", new Date().toISOString()).limit(100);
  if (error) return json({ error: error.message }, 500);

  for (const m of due ?? []) {
    const { data: claimed } = await sb.from("markets").update({ status: "resolving" })
      .eq("id", m.id).in("status", ["open", "closed", "resolving"]).select("id").maybeSingle();
    if (!claimed) continue;

    const { data: outcomes } = await sb.from("outcomes").select("id, label, display_order").eq("market_id", m.id);
    const r = await resolveBinding((m.resolution_binding ?? {}) as Record<string, unknown>, (outcomes ?? []) as OutcomeRow[]);

    await sb.from("resolution_audit").insert({
      market_id: m.id, feed: String((m.resolution_binding as Record<string, unknown>)?.kind ?? "unknown"),
      raw_value: "raw" in r ? r.raw ?? null : null, decided: r.status,
      source_url: r.status === "resolved" ? r.sourceUrl : null,
    });

    if (r.status === "resolved") {
      const { error: rErr } = await sb.rpc("resolve_market", { p_market_id: m.id, p_winning_outcome_id: r.winningOutcomeId, p_source_url: r.sourceUrl });
      if (rErr) { await pushQueue(sb, m.id, `resolve_market failed: ${rErr.message}`); result.error++; }
      else result.resolved++;
    } else if (r.status === "pending") {
      await sb.from("markets").update({ status: "closed" }).eq("id", m.id);
      const { count } = await sb.from("resolution_audit").select("id", { count: "exact", head: true }).eq("market_id", m.id).eq("decided", "pending");
      if ((count ?? 0) >= PENDING_RETRY_CAP) { await pushQueue(sb, m.id, "pending retry cap exceeded"); result.error++; }
      else result.pending++;
    } else {
      await sb.from("markets").update({ status: "closed" }).eq("id", m.id);
      await pushQueue(sb, m.id, r.error); result.error++;
    }
  }
  return json({ ok: true, ...result });
});

async function pushQueue(sb: SupabaseClient, marketId: string, reason: string) {
  await sb.from("resolution_queue").upsert({ market_id: marketId, reason, created_at: new Date().toISOString() }, { onConflict: "market_id" });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
