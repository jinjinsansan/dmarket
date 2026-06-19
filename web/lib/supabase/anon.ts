// 公開データ専用の匿名クライアント（cookie を読まない＝リクエスト非依存）。
// RLS の public ポリシー（markets/outcomes/categories/resolutions/price_history）のみ読む。
// cookie に触れないため unstable_cache でリクエスト横断キャッシュが可能になり、
// 同時アクセス時の DB 呼び出しを「TTLごとに1回」へ集約できる。
import { createClient } from "@supabase/supabase-js";

let cached: ReturnType<typeof createClient> | null = null;

export function createAnonClient() {
  if (cached) return cached;
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cached;
}
