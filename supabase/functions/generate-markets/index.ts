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

    // (a) 自前テンプレ生成（SPEC-04 §4a）：天気など。params_source.offsets の各日(JST)について
    //     不足分を create_market_internal で生成。external_ref=tmpl:{id}:{yyyymmdd} で冪等。
    if (settings.template_enabled) {
      const { data: tmpls } = await sb
        .from("market_templates").select("*").eq("category_id", c.id).eq("is_active", true);
      let tmade = 0;
      for (const t of tmpls ?? []) {
        const ps = (t.params_source ?? {}) as Record<string, unknown>;
        const offsets = Array.isArray(ps.offsets) ? (ps.offsets as number[]) : [0, 1];
        for (const off of offsets) {
          const d = jstDateParts(off);
          const extRef = `tmpl:${t.id}:${d.ymd}`;
          const { data: exist } = await sb.from("markets").select("id").eq("external_ref", extRef).limit(1);
          if (exist && exist.length) continue; // 生成済み → スキップ（冪等）
          const binding = { ...(t.resolution_binding as Record<string, unknown>), date: d.iso };
          const question = String(t.question_pattern)
            .replace("{date}", d.md).replace("{area}", String(ps.area ?? ""));
          const p = Number((t.initial_q_rule as Record<string, unknown> | null)?.p ?? 0.5);
          const { error: tErr } = await sb.rpc("create_market_internal", {
            p_category_id: c.id,
            p_question: question,
            p_description: null,
            p_image_url: null,
            p_market_kind: "binary",
            p_b: B_DEFAULT,
            p_source: "template",
            p_resolution_kind: "auto",
            p_resolution_binding: binding,
            p_external_ref: extRef,
            p_close_time: `${d.iso}T23:59:59+09:00`,
            p_resolve_time: isoNextDayResolve(d.iso),
            p_outcomes: [
              { label: "YES", display_order: 0, q: seedQBinary(B_DEFAULT, p) },
              { label: "NO", display_order: 1, q: 0 },
            ],
          });
          if (!tErr) tmade++;
        }
      }
      summary[`${c.slug}:tmpl`] = tmade;
    }

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

// JST の (今日 + offsetDays) を {ymd:"20260705", iso:"2026-07-05", md:"7/5"} で返す
function jstDateParts(offsetDays: number): { ymd: string; iso: string; md: string } {
  const jst = new Date(Date.now() + 9 * 3.6e6 + offsetDays * 8.64e7);
  const y = jst.getUTCFullYear(), m = jst.getUTCMonth() + 1, d = jst.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { ymd: `${y}${pad(m)}${pad(d)}`, iso: `${y}-${pad(m)}-${pad(d)}`, md: `${m}/${d}` };
}

// 対象日(iso="YYYY-MM-DD") の翌日 02:00 JST（観測が出揃った後）に解決
function isoNextDayResolve(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + 8.64e7);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T02:00:00+09:00`;
}
