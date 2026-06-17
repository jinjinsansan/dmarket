// 自動解決ジョブ（SPEC-03 §4 / SPEC-04 §7）— 5分ごと。
// resolution_kind='auto' かつ resolve_time 到来の市場を機械判定し、
// resolved→resolve_market RPC / pending→再試行 / error→解決キューへ。
import { serviceClient } from "../_shared/client.ts";
import { resolveBinding, type OutcomeRow } from "../_shared/adapters.ts";

const PENDING_RETRY_CAP = 12; // pending がこの回数続いたら人手へ（SPEC-03 §4）

Deno.serve(async (_req) => {
  const sb = serviceClient();
  const result = { resolved: 0, pending: 0, error: 0 };

  const { data: due, error } = await sb
    .from("markets")
    .select("id, resolution_binding, status")
    .eq("resolution_kind", "auto")
    .in("status", ["open", "closed", "resolving"])
    .lte("resolve_time", new Date().toISOString())
    .limit(100);
  if (error) return json({ error: error.message }, 500);

  for (const m of due ?? []) {
    // 'resolving' を条件付きで claim（多重実行防止）
    const { data: claimed } = await sb
      .from("markets").update({ status: "resolving" })
      .eq("id", m.id).in("status", ["open", "closed", "resolving"]).select("id").maybeSingle();
    if (!claimed) continue;

    const { data: outcomes } = await sb
      .from("outcomes").select("id, label, display_order").eq("market_id", m.id);

    const r = await resolveBinding(
      (m.resolution_binding ?? {}) as Record<string, unknown>,
      (outcomes ?? []) as OutcomeRow[],
    );

    await sb.from("resolution_audit").insert({
      market_id: m.id,
      feed: String((m.resolution_binding as Record<string, unknown>)?.kind ?? "unknown"),
      raw_value: "raw" in r ? r.raw ?? null : null,
      decided: r.status,
      source_url: r.status === "resolved" ? r.sourceUrl : null,
    });

    if (r.status === "resolved") {
      const { error: rErr } = await sb.rpc("resolve_market", {
        p_market_id: m.id,
        p_winning_outcome_id: r.winningOutcomeId,
        p_source_url: r.sourceUrl,
      });
      if (rErr) {
        await pushQueue(sb, m.id, `resolve_market failed: ${rErr.message}`);
        result.error++;
      } else {
        result.resolved++;
      }
    } else if (r.status === "pending") {
      // 締切は過ぎているので closed に戻して次回再試行。リトライ上限超で error。
      await sb.from("markets").update({ status: "closed" }).eq("id", m.id);
      const { count } = await sb
        .from("resolution_audit").select("id", { count: "exact", head: true })
        .eq("market_id", m.id).eq("decided", "pending");
      if ((count ?? 0) >= PENDING_RETRY_CAP) {
        await pushQueue(sb, m.id, "pending retry cap exceeded");
        result.error++;
      } else {
        result.pending++;
      }
    } else {
      await sb.from("markets").update({ status: "closed" }).eq("id", m.id);
      await pushQueue(sb, m.id, r.error);
      result.error++;
    }
  }

  return json({ ok: true, ...result });
});

async function pushQueue(sb: ReturnType<typeof serviceClient>, marketId: string, reason: string) {
  await sb.from("resolution_queue").upsert(
    { market_id: marketId, reason, created_at: new Date().toISOString() },
    { onConflict: "market_id" },
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}
