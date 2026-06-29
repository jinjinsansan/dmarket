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

// ── 天気（気象庁 AMeDAS 観測実績）────────────────────────────────
// 予報ではなく「観測実績」で客観解決する。キー不要・無料。対象日が完全に終わってから判定。
// binding: { kind:"weather", station:"44132", date:"2026-07-05",
//            metric:"temp_max"|"temp_min"|"precip", operator:">=", threshold:30, yes_if_true:true }
//   ・temp_max/temp_min … その日の最高/最低気温(℃)を threshold と比較
//   ・precip            … その日の降水量合計(mm)を threshold と比較（"雨が降った"= precip > 0）
const AMEDAS_BASE = "https://www.jma.go.jp/bosai/amedas/data/point";
const AMEDAS_BLOCKS = ["00", "03", "06", "09", "12", "15", "18", "21"];

// AMeDAS の値は [value, flag] 形式。flag=0 が正常。value が数値でなければ null。
function amedasNum(v: unknown): number | null {
  if (Array.isArray(v) && typeof v[0] === "number") return v[0];
  return null;
}

// 対象日の全3時間ブロック(00〜21)を取得し、10分値エントリをマージ。1つも取れなければ null。
async function fetchAmedasDay(station: string, ymd: string): Promise<Record<string, Record<string, unknown>> | null> {
  const merged: Record<string, Record<string, unknown>> = {};
  let got = 0;
  for (const blk of AMEDAS_BLOCKS) {
    try {
      const res = await fetch(`${AMEDAS_BASE}/${station}/${ymd}_${blk}.json`, { headers: { accept: "application/json" } });
      if (!res.ok) continue;
      Object.assign(merged, await res.json());
      got++;
    } catch { /* 欠損ブロックはスキップ */ }
  }
  return got === 0 ? null : merged;
}

async function resolveWeather(b: Record<string, unknown>, outcomes: OutcomeRow[]): Promise<ResolveResult> {
  const station = String(b.station);
  const date = String(b.date); // YYYY-MM-DD（JST）
  const metric = String(b.metric);
  const dayEnd = Date.parse(`${date}T23:59:59+09:00`);
  if (Number.isNaN(dayEnd)) return { status: "error", error: `invalid date: ${date}` };
  // 当日が終わり観測が出揃うまで（翌日 +30分）は判定しない → pending
  if (Date.now() < dayEnd + 30 * 60 * 1000) return { status: "pending" };

  const ymd = date.replace(/-/g, "");
  const day = await fetchAmedasDay(station, ymd);
  if (!day) return { status: "pending" }; // 観測未取得 → 再試行
  const entries = Object.values(day);

  let value: number | null = null;
  if (metric === "temp_max") {
    // 当日極値フィールド(maxTemp)と10分値(temp)の双方から最大をとる
    const xs = entries.flatMap((e) => [amedasNum(e.maxTemp), amedasNum(e.temp)]).filter((x): x is number => x !== null);
    if (xs.length) value = Math.max(...xs);
  } else if (metric === "temp_min") {
    const xs = entries.flatMap((e) => [amedasNum(e.minTemp), amedasNum(e.temp)]).filter((x): x is number => x !== null);
    if (xs.length) value = Math.min(...xs);
  } else if (metric === "precip") {
    const xs = entries.map((e) => amedasNum(e.precipitation10m)).filter((x): x is number => x !== null);
    if (xs.length) value = xs.reduce((a, c) => a + c, 0);
  } else {
    return { status: "error", error: `unsupported weather metric: ${metric}` };
  }
  if (value === null) return { status: "pending" }; // 有効観測なし → 再試行

  const isTrue = compare(String(b.operator), value, Number(b.threshold));
  const yesIfTrue = b.yes_if_true !== false;
  const wantYes = isTrue === yesIfTrue;
  const yes = findByLabel(outcomes, "YES");
  const no = findByLabel(outcomes, "NO");
  if (!yes || !no) return { status: "error", error: "binary YES/NO outcomes not found", raw: { value } };
  return {
    status: "resolved",
    winningOutcomeId: wantYes ? yes.id : no.id,
    sourceUrl: `${AMEDAS_BASE}/${station}/${ymd}_21.json`,
    raw: { metric, value, operator: String(b.operator), threshold: Number(b.threshold) },
  };
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
      case "weather":
        return await resolveWeather(binding, outcomes);
      // sports_result は feed 確定後に追加（SPEC-03 §8 実装順5）
      default:
        return { status: "error", error: `unsupported binding kind: ${binding.kind}` };
    }
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
