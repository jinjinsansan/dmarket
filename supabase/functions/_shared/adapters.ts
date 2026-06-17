// 解決フィードアダプタ（SPEC-03 §2-3）。
// resolveBinding(binding, outcomes) -> {status: resolved|pending|error, ...}
// 共通規約: 確定値が未取得・未確定なら必ず 'pending'（推測で確定しない）。
//          矛盾・欠損は 'error'（解決キューへ）。
import { fetchPolyResolution } from "./gamma.ts";

export interface OutcomeRow { id: string; label: string; display_order: number; }

export type ResolveResult =
  | { status: "resolved"; winningOutcomeId: string; sourceUrl: string; raw: unknown }
  | { status: "pending"; raw?: unknown }
  | { status: "error"; error: string; raw?: unknown };

function findByLabel(outcomes: OutcomeRow[], label: string): OutcomeRow | undefined {
  const t = label.trim().toLowerCase();
  return outcomes.find((o) => o.label.trim().toLowerCase() === t);
}

// ── 価格しきい値（crypto / fx / index / numeric_feed） ──────────────
// 判定時刻 `at` の参照価格 vs threshold。価格源は環境変数でエンドポイントを注入する。
// ※ 具体的なデータ源は運用時に確定（計画書 §7 #3）。未対応 feed は error。
async function fetchReferencePrice(
  feed: string, symbol: string, atIso: string,
): Promise<{ value: number; sourceUrl: string } | null> {
  const base = Deno.env.get(`FEED_${feed.toUpperCase()}_URL`); // 例 FEED_CRYPTO_URL
  if (!base) return null; // 未設定 → pending 扱い（後で再試行）
  const url = `${base}?symbol=${encodeURIComponent(symbol)}&at=${encodeURIComponent(atIso)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  const j = await res.json();
  if (typeof j?.price !== "number") return null;
  return { value: j.price, sourceUrl: j.source_url ?? url };
}

function compare(op: string, a: number, b: number): boolean {
  switch (op) {
    case ">=": return a >= b;
    case ">":  return a > b;
    case "<=": return a <= b;
    case "<":  return a < b;
    case "==": return a === b;
    default: throw new Error(`unknown operator ${op}`);
  }
}

async function resolvePriceThreshold(b: Record<string, unknown>, outcomes: OutcomeRow[]): Promise<ResolveResult> {
  const at = String(b.at);
  if (new Date(at).getTime() > Date.now()) return { status: "pending" }; // 判定時刻前
  const ref = await fetchReferencePrice(String(b.feed), String(b.symbol), at);
  if (!ref) return { status: "pending" };                                 // 未取得 → 再試行
  const isTrue = compare(String(b.operator), ref.value, Number(b.threshold));
  const yesIfTrue = b.yes_if_true !== false;
  const wantYes = isTrue === yesIfTrue;
  const yes = findByLabel(outcomes, "YES");
  const no = findByLabel(outcomes, "NO");
  if (!yes || !no) return { status: "error", error: "binary YES/NO outcomes not found", raw: ref };
  return {
    status: "resolved",
    winningOutcomeId: wantYes ? yes.id : no.id,
    sourceUrl: ref.sourceUrl,
    raw: { price: ref.value, threshold: b.threshold, operator: b.operator },
  };
}

// ── 競馬（自前 Dlogic / 結果DB） ─────────────────────────────────
// Dlogic VPS の結果エンドポイントを HTTP で取得（dmarket本体はSupabaseのまま）。
async function resolveRaceResult(b: Record<string, unknown>, outcomes: OutcomeRow[]): Promise<ResolveResult> {
  const base = Deno.env.get("DLOGIC_BASE_URL");
  if (!base) return { status: "pending" };
  const raceId = String(b.race_id);
  const res = await fetch(`${base}/result?race_id=${encodeURIComponent(raceId)}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 404 || res.status === 425) return { status: "pending" }; // 未確定
  if (!res.ok) return { status: "error", error: `dlogic ${res.status}` };
  const j = await res.json();
  if (!j?.confirmed) return { status: "pending" };
  // outcome_map: { "<key>": "<outcome label or display_order key>" } を勝ちラベルへ
  const map = (b.outcome_map ?? {}) as Record<string, string>;
  const winnerKey = String(j.winner_key ?? j.win ?? "");
  const label = map[winnerKey];
  const o = label ? findByLabel(outcomes, label) : undefined;
  if (!o) return { status: "error", error: `no outcome for winner ${winnerKey}`, raw: j };
  return { status: "resolved", winningOutcomeId: o.id, sourceUrl: j.source_url ?? `${base}/race/${raceId}`, raw: j };
}

// ── Polymarket ミラー ──────────────────────────────────────────
async function resolvePoly(b: Record<string, unknown>, outcomes: OutcomeRow[]): Promise<ResolveResult> {
  const polyId = String(b.poly_id);
  const r = await fetchPolyResolution(polyId);
  if (!r.resolved || !r.winningLabel) return { status: "pending", raw: r };
  // outcome_map があれば poly ラベル→自サイトラベルへ写像、無ければ同名一致
  const map = (b.outcome_map ?? {}) as Record<string, string>;
  const localLabel = map[r.winningLabel] ?? r.winningLabel;
  const o = findByLabel(outcomes, localLabel);
  if (!o) return { status: "error", error: `no local outcome for ${r.winningLabel}`, raw: r };
  return { status: "resolved", winningOutcomeId: o.id, sourceUrl: r.sourceUrl, raw: r };
}

export async function resolveBinding(
  binding: Record<string, unknown>,
  outcomes: OutcomeRow[],
): Promise<ResolveResult> {
  try {
    switch (binding.kind) {
      case "price_threshold":
      case "numeric_feed":
        return await resolvePriceThreshold(binding, outcomes);
      case "race_result":
        return await resolveRaceResult(binding, outcomes);
      case "poly":
        return await resolvePoly(binding, outcomes);
      // sports_result は feed 確定後に追加（SPEC-03 §8 実装順5）
      default:
        return { status: "error", error: `unsupported binding kind: ${binding.kind}` };
    }
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
