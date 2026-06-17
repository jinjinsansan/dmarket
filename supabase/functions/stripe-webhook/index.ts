// 決済Webhook（SPEC-08 §1）。決済完了で entitlements のみ付与し、wallets には絶対に触れない。
// 署名検証 → checkout.session.completed → grant_entitlement(service_role)。
import Stripe from "npm:stripe@^17";
import { serviceClient } from "../_shared/client.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-01-01" as Stripe.LatestApiVersion });
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? "", WEBHOOK_SECRET);
  } catch (e) {
    return new Response(`signature error: ${e instanceof Error ? e.message : e}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // クライアントが checkout 作成時に metadata で user_id / sku を埋める前提
    const userId = session.metadata?.user_id;
    const sku = session.metadata?.sku;
    const expires = session.metadata?.expires_at ?? null;
    if (userId && sku) {
      const sb = serviceClient();
      // entitlements のみ更新。ポイント残高は一切変更しない（賭博非該当の生命線）。
      const { error } = await sb.rpc("grant_entitlement", {
        p_user_id: userId,
        p_sku: sku,
        p_expires_at: expires,
      });
      if (error) return new Response(`grant failed: ${error.message}`, { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
