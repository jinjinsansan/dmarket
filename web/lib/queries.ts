// Server Components 用の初期取得ヘルパ（RLS public により未ログインでも市場系は読める）
import { unstable_cache } from "next/cache";
import { createClient } from "./supabase/server";
import { createAnonClient } from "./supabase/anon";
import type { Category, MarketWithOutcomes, Outcome, PricePoint, Resolution } from "./types";

export interface RankRow {
  user_id: string;
  net_worth: number;
  win_count: number;
  resolved_count: number;
  display_name: string;
}

// 総資産ランキング（フラグ済みは除外。他者の絶対残高ではなくスコアとして表示）
export async function getLeaderboard(): Promise<RankRow[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("user_stats")
    .select("user_id, net_worth, win_count, resolved_count, profile:profiles(display_name, is_flagged)")
    .order("net_worth", { ascending: false })
    .limit(100);
  type Row = {
    user_id: string; net_worth: number; win_count: number; resolved_count: number;
    profile: { display_name: string; is_flagged: boolean } | null;
  };
  return ((data as unknown as Row[]) ?? [])
    .filter((r) => r.profile && !r.profile.is_flagged)
    .map((r) => ({
      user_id: r.user_id,
      net_worth: r.net_worth,
      win_count: r.win_count,
      resolved_count: r.resolved_count,
      display_name: r.profile!.display_name,
    }));
}

// 関連市場（同カテゴリの開催中・自分を除く・締切近め優先で最大数件）。15秒キャッシュ。
export const getRelatedMarkets = unstable_cache(
  async (categoryId: string | null, excludeId: string, limit = 4): Promise<MarketWithOutcomes[]> => {
    const sb = createAnonClient();
    let query = sb
      .from("markets")
      .select("*, outcomes(*), category:categories(*)")
      .eq("status", "open")
      .gt("close_time", new Date().toISOString())
      .neq("id", excludeId)
      .order("close_time", { ascending: true })
      .limit(limit);
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data } = await query;
    return (data as unknown as MarketWithOutcomes[]) ?? [];
  },
  ["related-markets"],
  { revalidate: 15, tags: ["markets"] },
);

// カテゴリ一覧（滅多に変わらない）。60秒キャッシュ。
export const getCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const sb = createAnonClient();
    const { data } = await sb
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    return (data as unknown as Category[]) ?? [];
  },
  ["categories"],
  { revalidate: 60, tags: ["categories"] },
);

// 市場一覧（アウトカム同梱）。10秒キャッシュ＝同時アクセス時もDB呼び出しはTTLごとに1回へ集約。
// 価格はクライアント側 Realtime が補正するため、10秒のスナップショット鮮度で十分。
export const getMarkets = unstable_cache(
  async (opts?: { categoryId?: string }): Promise<MarketWithOutcomes[]> => {
    const sb = createAnonClient();
    let query = sb
      .from("markets")
      .select("*, outcomes(*)")
      .eq("status", "open")
      .gt("close_time", new Date().toISOString())
      .order("close_time", { ascending: true })
      .limit(200);
    if (opts?.categoryId) query = query.eq("category_id", opts.categoryId);
    const { data } = await query;
    return (data as unknown as MarketWithOutcomes[]) ?? [];
  },
  ["markets-list"],
  { revalidate: 10, tags: ["markets"] },
);

// 市場詳細（公開部分のみ）。5秒キャッシュ。保有/残高などユーザー固有はクライアントで別途取得。
export const getMarket = unstable_cache(
  async (id: string): Promise<{
    market: MarketWithOutcomes | null;
    resolution: Resolution | null;
    history: PricePoint[];
  }> => {
    const sb = createAnonClient();
    const { data: market } = await sb
      .from("markets")
      .select("*, outcomes(*), category:categories(*)")
      .eq("id", id)
      .maybeSingle();
    if (!market) return { market: null, resolution: null, history: [] };

    // アウトカムは表示順に整列
    (market as unknown as MarketWithOutcomes).outcomes.sort(
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
      market: market as unknown as MarketWithOutcomes,
      resolution: (resolution as unknown as Resolution) ?? null,
      history: (history as unknown as PricePoint[]) ?? [],
    };
  },
  ["market-detail"],
  { revalidate: 5, tags: ["markets"] },
);
