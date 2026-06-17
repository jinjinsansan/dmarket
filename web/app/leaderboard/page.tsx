import { getLeaderboard } from "@/lib/queries";
import { LeaderboardView } from "@/components/LeaderboardView";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const rows = await getLeaderboard();
  return <LeaderboardView rows={rows} />;
}
