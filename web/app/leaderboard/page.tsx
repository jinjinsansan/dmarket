// ランキング（SPEC-06 §6）。総資産（net_worth）でソート。賞品なし・表示のみ。
import { getLeaderboard } from "@/lib/queries";
import { formatPoints } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const rows = await getLeaderboard();
  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">ランキング</h1>
      <p className="text-dim text-sm mb-5">総資産（残高＋保有評価）。報酬は称号と順位のみ・換金なし。</p>

      {rows.length === 0 ? (
        <p className="text-dim text-sm py-16 text-center">まだランキングがありません。</p>
      ) : (
        <div className="divide-y divide-border rounded-[var(--radius)] border border-border">
          {rows.map((r, i) => (
            <div key={r.user_id} className="flex items-center gap-3 p-3">
              <span className="num w-8 text-center text-dim">{i + 1}</span>
              <span className="flex-1 truncate">{r.display_name}</span>
              <span className="num text-xs text-dim">
                {r.resolved_count > 0 ? `的中率 ${Math.round((r.win_count / r.resolved_count) * 100)}%` : "—"}
              </span>
              <span className="num text-sm">{formatPoints(r.net_worth)} pt</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
