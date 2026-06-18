// service_role の Supabase クライアント（サーバー専用・ユーザー作成等）。
// SUPABASE_SERVICE_ROLE_KEY は NEXT_PUBLIC を付けず、サーバー環境変数として設定する。
import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
