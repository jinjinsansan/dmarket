// ログアウト: Supabaseセッションを破棄してトップへ。
import { NextRequest, NextResponse } from "next/server";
import { siteOrigin, routeClient } from "@/lib/line";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(`${siteOrigin(req)}/`);
  const supabase = routeClient(req, res);
  await supabase.auth.signOut();
  return res;
}
