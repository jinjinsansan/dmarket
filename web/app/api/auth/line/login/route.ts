// LINEログイン開始: LINE 認可画面へリダイレクト（state を Cookie に保存）。
import { NextRequest, NextResponse } from "next/server";
import { LINE_AUTHORIZE, lineRedirectUri } from "@/lib/line";

export async function GET(req: NextRequest) {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.redirect(new URL("/?login=config", req.url));
  }
  const state = crypto.randomUUID();
  const url = new URL(LINE_AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", lineRedirectUri(req));
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid");

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("line_oauth_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/",
  });
  return res;
}
