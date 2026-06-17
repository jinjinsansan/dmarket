// ホーム（市場一覧）。Server Component で初期取得 → Client のグリッドへ。
import { getCategories, getMarkets } from "@/lib/queries";
import { MarketGrid } from "@/components/MarketGrid";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [markets, categories] = await Promise.all([getMarkets(), getCategories()]);
  return <MarketGrid initialMarkets={markets} categories={categories} />;
}
