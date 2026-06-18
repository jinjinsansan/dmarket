// 市場生成ジョブ（SPEC-04 §4）— 15分ごと（pg_cron → この関数を叩く）。
// 各アクティブカテゴリで gap を計算し、不足分だけ Polyミラーを生成。
// 走行中の市場は絶対に消さない（新規生成の量だけ調整）。冪等: poly_mirror_cache で重複防止。
import { serviceClient, seedQBinary } from "../_shared/client.ts";
import { fetchPolyCandidates, type GammaMarket } from "../_shared/gamma.ts";
import { toJapanese } from "../_shared/translate.ts";

const B_DEFAULT = 200;
const MIN_HOURS_TO_CLOSE = 2; // これより締切が近い poly はミラーしない（SPEC-04 §9-3）

Deno.serve(async (_req) => {
  const sb = serviceClient();
  const summary: Record<string, number> = {};

  const { data: cats, error } = await sb
    .from("categories").select("id, slug").eq("is_active", true);
  if (error) return json({ error: error.message }, 500);

  for (const c of cats ?? []) {
    const { data: settings } = await sb
      .from("category_feed_settings").select("*").eq("category_id", c.id).maybeSingle();
    if (!settings) continue;

    // (a) 自前テンプレ生成は SPEC-04 §4a。schedule_cron 評価は別途（TODO: 競馬テンプレ接続時）。

    // (b) Polyミラー生成
    const { data: nData, error: nErr } = await sb.rpc("compute_poly_to_generate", {
      p_category_id: c.id,
    });
    if (nErr) { summary[`${c.slug}:err`] = 1; continue; }
    const n = Number(nData ?? 0);
    if (n <= 0) { summary[c.slug] = 0; continue; }

    let candidates: GammaMarket[] = [];
    try {
      candidates = await fetchPolyCandidates({
        tagIds: settings.poly_tag_ids ?? [], // 空なら一般の人気市場を取得
        sort: settings.poly_sort,
        limit: n,
      });
    } catch (_e) { summary[`${c.slug}:gamma_err`] = 1; continue; }

    // 既ミラー済み（local_market_id あり）を除外
    const ids = candidates.map((m) => m.id);
    const { data: existing } = await sb
      .from("poly_mirror_cache").select("poly_market_id, local_market_id").in("poly_market_id", ids);
    const alreadyMirrored = new Set(
      (existing ?? []).filter((e) => e.local_market_id).map((e) => e.poly_market_id),
    );

    const picked = candidates.filter((m) => {
      if (m.closed) return false;
      if (alreadyMirrored.has(m.id)) return false;
      if (m.outcomes.length !== 2) return false;           // v1 は二択のみミラー
      if (!m.endDate) return false;
      const hrs = (new Date(m.endDate).getTime() - Date.now()) / 3.6e6;
      return hrs >= MIN_HOURS_TO_CLOSE;
    }).slice(0, n);

    let made = 0;
    for (const m of picked) {
      const yesPrice = m.outcomePrices[0] ?? 0.5;
      const close = m.endDate!;
      // グループ市場は識別子(国名等)を主語として補い、曖昧な同一タイトルを防ぐ
      const src = m.groupItemTitle && !m.question.includes(m.groupItemTitle)
        ? `${m.groupItemTitle}: ${m.question}`
        : m.question;
      const question = await toJapanese(src); // 英語→日本語（失敗時は原文）
      const { data: marketId, error: cErr } = await sb.rpc("create_market_internal", {
        p_category_id: c.id,
        p_question: question,
        p_description: null,
        p_image_url: m.image ?? null,
        p_market_kind: "binary",
        p_b: B_DEFAULT,
        p_source: "mirror",
        p_resolution_kind: "auto",
        p_resolution_binding: { kind: "poly", poly_id: m.id, outcome_map: { Yes: "YES", No: "NO" } },
        p_external_ref: m.id,
        p_close_time: close,
        p_resolve_time: close,
        p_outcomes: [
          { label: "YES", display_order: 0, q: seedQBinary(B_DEFAULT, yesPrice) },
          { label: "NO", display_order: 1, q: 0 },
        ],
      });
      if (cErr) continue;
      await sb.from("poly_mirror_cache").upsert({
        poly_market_id: m.id,
        category_id: c.id,
        question: m.question,
        poly_price_yes: yesPrice,
        poly_close_time: close,
        local_market_id: marketId,
        fetched_at: new Date().toISOString(),
      });
      made++;
    }
    summary[c.slug] = made;
  }

  return json({ ok: true, generated: summary });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}
