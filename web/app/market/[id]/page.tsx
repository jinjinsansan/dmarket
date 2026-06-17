// 市場詳細（Server Component で初期取得 → Client で価格更新・トレード）。
import { notFound } from "next/navigation";
import { getMarket } from "@/lib/queries";
import { MarketDetailClient } from "@/components/MarketDetailClient";

export const dynamic = "force-dynamic";

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pick?: string }>;
}) {
  const { id } = await params;
  const { pick } = await searchParams;
  const { market, resolution, history } = await getMarket(id);
  if (!market) notFound();
  return (
    <MarketDetailClient
      market={market}
      resolution={resolution}
      history={history}
      initialPick={pick ? Number(pick) : 0}
    />
  );
}
