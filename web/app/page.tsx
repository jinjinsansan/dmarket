// ホーム＝ピックアップ1本集中トップ。get_current_pickup で今の1本を決定し、
// 市場・スパーク・次予告・初期コメント・参加人数を SSR で用意して PickupHome へ。
import { getMarket } from "@/lib/queries";
import { createAnonClient } from "@/lib/supabase/anon";
import { PickupHome } from "@/components/PickupHome";
import type { PricePoint } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = createAnonClient();
  // 新RPC（生成型に未登録）は型を緩める
  const rpc = sb.rpc as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
  const { data: pickupId } = await rpc("get_current_pickup");
  if (!pickupId) {
    return <PickupHome market={null} spark={[]} participants={0} next={null} initialComments={[]} />;
  }
  const id = pickupId as string;
  const { market, history } = await getMarket(id);
  const yesId = market?.outcomes?.[0]?.id;
  const spark = ((history as PricePoint[]) ?? [])
    .filter((h) => h.outcome_id === yesId)
    .map((h) => Math.round(h.price * 100));

  const [{ data: next }, { data: comments }, { data: participants }] = await Promise.all([
    rpc("get_next_pickup"),
    rpc("market_comments", { p_market_id: id }),
    rpc("pickup_participants", { p_market_id: id }),
  ]);

  return (
    <PickupHome
      market={market}
      spark={spark}
      participants={typeof participants === "number" ? participants : 0}
      next={(next as { market_id: string; time_label: string; question: string; slot_start: string } | null) ?? null}
      initialComments={(comments as never) ?? []}
    />
  );
}
