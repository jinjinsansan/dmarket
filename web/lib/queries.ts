// Server Components 用の初期取得ヘルパ（RLS public により未ログインでも市場系は読める）
import { createClient } from "./supabase/server";
import type { Category, MarketWithOutcomes, Outcome, PricePoint, Resolution } from "./types";

export async function getCategories(): Promise<Category[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("display_order");
  return data ?? [];
}

// 市場一覧（アウトカム同梱）。status と category で絞り込み可。
export async function getMarkets(opts?: { categoryId?: string }): Promise<MarketWithOutcomes[]> {
  const sb = await createClient();
  let query = sb
    .from("markets")
    .select("*, outcomes(*)")
    .eq("status", "open")
    .gt("close_time", new Date().toISOString())
    .order("close_time", { ascending: true });
  if (opts?.categoryId) query = query.eq("category_id", opts.categoryId);
  const { data } = await query;
  return (data as MarketWithOutcomes[]) ?? [];
}

export async function getMarket(id: string): Promise<{
  market: MarketWithOutcomes | null;
  resolution: Resolution | null;
  history: PricePoint[];
}> {
  const sb = await createClient();
  const { data: market } = await sb
    .from("markets")
    .select("*, outcomes(*), category:categories(*)")
    .eq("id", id)
    .maybeSingle();
  if (!market) return { market: null, resolution: null, history: [] };

  // アウトカムは表示順に整列
  (market as MarketWithOutcomes).outcomes.sort(
    (a: Outcome, b: Outcome) => a.display_order - b.display_order,
  );

  const [{ data: resolution }, { data: history }] = await Promise.all([
    sb.from("resolutions").select("*").eq("market_id", id).maybeSingle(),
    sb
      .from("market_price_history")
      .select("outcome_id, price, recorded_at")
      .eq("market_id", id)
      .order("recorded_at", { ascending: true }),
  ]);

  return {
    market: market as MarketWithOutcomes,
    resolution: (resolution as Resolution) ?? null,
    history: (history as PricePoint[]) ?? [],
  };
}
