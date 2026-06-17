// service_role の Supabase クライアント（RLS バイパス）。
// Edge Functions からのみ使用。SUPABASE_SERVICE_ROLE_KEY は環境変数で注入。
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定");
  return createClient(url, key, { auth: { persistSession: false } });
}

// 二択 YES 価格 p から初期 q をシード（DB 関数と同一式: q = b·ln(p/(1-p)), q_NO=0）
export function seedQBinary(b: number, price: number): number {
  const p = Math.min(Math.max(price, 1e-6), 1 - 1e-6);
  return b * Math.log(p / (1 - p));
}
