// LINEログイン コールバック: code を検証→LINEプロフィール取得→Supabaseユーザー作成/ログイン→初期付与。
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  LINE_TOKEN, LINE_PROFILE, lineRedirectUri, siteOrigin, derivePassword, lineEmail, routeClient,
} from "@/lib/line";

export async function GET(req: NextRequest) {
  const origin = siteOrigin(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = req.cookies.get("line_oauth_state")?.value;

  const fail = (reason: string) => NextResponse.redirect(`${origin}/?login=${reason}`);

  if (!code || !state || !savedState || state !== savedState) return fail("state");

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) return fail("config");

  // 1) code → access_token
  const tokenRes = await fetch(LINE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: lineRedirectUri(req),
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });
  if (!tokenRes.ok) return fail("token");
  const token = await tokenRes.json();

  // 2) プロフィール取得（userId/displayName/pictureUrl）
  const profRes = await fetch(LINE_PROFILE, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!profRes.ok) return fail("profile");
  const prof = await profRes.json();
  const lineUserId: string = prof.userId;
  const displayName: string = prof.displayName || "プレイヤー";
  const avatar: string | null = prof.pictureUrl ?? null;
  if (!lineUserId) return fail("profile");

  const email = lineEmail(lineUserId);
  const password = await derivePassword(lineUserId);

  // 3) Supabaseユーザーを冪等に作成（service_role）
  const admin = adminClient();
  const { error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { line_user_id: lineUserId, name: displayName, avatar },
  });
  // 既存ユーザーは "already registered" 等で失敗するが無視（その場合は下のログインが通る）
  if (createErr && !/already|exist|registered/i.test(createErr.message)) {
    return fail("create");
  }

  // 4) セッション確立（Cookie を res に書く）
  const res = NextResponse.redirect(`${origin}/`);
  const supabase = routeClient(req, res);
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) return fail("signin");

  // 5) プロフィール確定＋初期付与（ユーザーセッションで実行）
  await supabase.rpc("complete_line_signup", {
    p_display_name: displayName, p_line_user_id: lineUserId, p_avatar: avatar,
  });

  res.cookies.delete("line_oauth_state");
  return res;
}
