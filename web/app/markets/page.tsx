// 全市場一覧（従来のグリッド）。トップはピックアップ1本集中に変わったため、
// 一覧はこちらに退避（QuietNav「すべての市場を見る →」からの導線）。
import { getCategories, getMarkets } from "@/lib/queries";
import { MarketGrid } from "@/components/MarketGrid";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const [markets, categories] = await Promise.all([getMarkets(), getCategories()]);
  return <MarketGrid initialMarkets={markets} categories={categories} />;
}
