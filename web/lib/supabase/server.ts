// サーバー用 Supabase クライアント（Server Components の初期取得）。
// cookies() は Next 15+ で非同期。RLS の public ポリシーにより市場・価格は未ログインでも読める。
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component からの set は無視（middleware で更新される想定）
          }
        },
      },
    },
  );
}
