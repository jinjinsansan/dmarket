// LINEログイン共通ユーティリティ（サーバー専用）。
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

export const LINE_AUTHORIZE = "https://access.line.me/oauth2/v2.1/authorize";
export const LINE_TOKEN = "https://api.line.me/oauth2/v2.1/token";
export const LINE_PROFILE = "https://api.line.me/v2/profile";

// サイトのオリジン（リダイレクトURI生成に使用）。本番は NEXT_PUBLIC_SITE_URL を推奨。
export function siteOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
}
export function lineRedirectUri(req: NextRequest): string {
  return `${siteOrigin(req)}/api/auth/line/callback`;
}

// LINE userId からセッション用の決定的パスワードを生成（サーバー秘密で署名・クライアントには出さない）
export async function derivePassword(lineUserId: string): Promise<string> {
  const secret = process.env.LINE_AUTH_SECRET || "dmarket-line-fallback-secret";
  const data = new TextEncoder().encode(`${lineUserId}:${secret}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function lineEmail(lineUserId: string): string {
  return `line.${lineUserId.toLowerCase()}@dmarket.line`;
}

// Route Handler 用 Supabase クライアント（Cookie を req から読み、res に書く）
export function routeClient(req: NextRequest, res: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );
}
