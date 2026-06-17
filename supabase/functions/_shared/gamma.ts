// Polymarket Gamma API（認証不要・読み取り専用）SPEC-04 §5。
// 市場候補の取得（ミラー生成用）と確定状態の突合（解決用）。
const GAMMA_BASE = "https://gamma-api.polymarket.com";

export interface GammaMarket {
  id: string;
  question: string;
  closed: boolean;
  outcomes: string[];          // 例 ["Yes","No"]（JSON文字列で来る場合あり→正規化）
  outcomePrices: number[];     // 例 [0.64, 0.36]
  endDate?: string;            // ISO close time
  volume24hr?: number;
  liquidity?: number;
  umaResolutionStatus?: string;
  resolvedOutcome?: string | null;
}

// 配列 or JSON文字列の両形式を吸収
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

async function gammaFetch(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(GAMMA_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  // 429 は指数バックオフで最大3回（15分cronなので通常不要）
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Gamma ${path} ${res.status}`);
    return await res.json();
  }
  throw new Error(`Gamma ${path} rate-limited`);
}

// アクティブな候補市場を取得。tag_id 指定があれば絞り、無ければ一般の人気市場を取得。
// ソートは API パラメータに依存せずクライアント側で出来高/流動性降順に並べ替える（堅牢）。
export async function fetchPolyCandidates(opts: {
  tagIds: number[];
  sort: string;        // 'volume_24hr' | 'liquidity' | 'competitive'
  limit: number;
}): Promise<GammaMarket[]> {
  const hasTag = opts.tagIds.length > 0 && opts.tagIds[0] > 0;
  const raw = await gammaFetch("/markets", {
    closed: "false",
    active: "true",
    limit: Math.max(opts.limit * 4, 40), // 多めに引いてクライアントで選別
    tag_id: hasTag ? opts.tagIds[0] : undefined,
  });
  const list = (Array.isArray(raw) ? raw : raw?.data ?? []) as Record<string, unknown>[];
  const mapped = list.map((m) => ({
    id: String(m.id),
    question: String(m.question ?? ""),
    closed: Boolean(m.closed),
    outcomes: asArray<string>(m.outcomes),
    outcomePrices: asArray<string>(m.outcomePrices).map(Number),
    endDate: m.endDate as string | undefined,
    volume24hr: m.volume24hr ? Number(m.volume24hr) : undefined,
    liquidity: m.liquidity ? Number(m.liquidity) : undefined,
  }));
  const key = opts.sort === "liquidity" ? "liquidity" : "volume24hr";
  // 多めに返し、呼び出し側で二択/期限などの選別＋上限適用をさせる
  return mapped.sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).slice(0, opts.limit * 3);
}

// poly_id の確定状態を確認。未確定は null を返す（推測で確定しない）。
export async function fetchPolyResolution(
  polyId: string,
): Promise<{ resolved: boolean; winningLabel: string | null; sourceUrl: string }> {
  const raw = await gammaFetch(`/markets/${polyId}`, {});
  const m = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>;
  const closed = Boolean(m?.closed);
  const prices = asArray<string>(m?.outcomePrices).map(Number);
  const outcomes = asArray<string>(m?.outcomes);
  const sourceUrl = `https://polymarket.com/market/${polyId}`;
  if (!closed || prices.length === 0) return { resolved: false, winningLabel: null, sourceUrl };
  // 確定市場は勝ち outcome の価格が 1（≈1）になる
  const wi = prices.findIndex((p) => p >= 0.99);
  if (wi < 0) return { resolved: false, winningLabel: null, sourceUrl };
  return { resolved: true, winningLabel: outcomes[wi] ?? null, sourceUrl };
}
