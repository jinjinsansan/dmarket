// 市場一覧（ホーム）。Server Component で初期取得し、Client のグリッドへ渡す。
import { getCategories, getMarkets } from "@/lib/queries";
import { MarketGrid } from "@/components/MarketGrid";

export const dynamic = "force-dynamic"; // 常に最新の市場を出す（取引で価格が動くため）

export default async function Home() {
  const [markets, categories] = await Promise.all([getMarkets(), getCategories()]);
  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">マーケット</h1>
      <p className="text-dim text-sm mb-5">実世界の結果を予測してポイントを増やそう。換金なし・当てる楽しさだけ。</p>
      <MarketGrid initialMarkets={markets} categories={categories} />
    </div>
  );
}
