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

  // reason に失敗箇所、d に詳細メッセージを付けて切り分けやすくする
  const fail = (reason: string, detail?: string) =>
    NextResponse.redirect(`${origin}/?login=${reason}${detail ? `&d=${encodeURIComponent(detail.slice(0, 200))}` : ""}`);

  if (!code || !state || !savedState || state !== savedState) return fail("state");

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) return fail("config", `id:${!!channelId} secret:${!!channelSecret}`);

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
  const tokenBody = await tokenRes.text();
  if (!tokenRes.ok) return fail("token", `${tokenRes.status} ${tokenBody}`);
  const token = JSON.parse(tokenBody);

  // 2) プロフィール取得（userId/displayName/pictureUrl）
  const profRes = await fetch(LINE_PROFILE, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!profRes.ok) return fail("profile", `${profRes.status} ${await profRes.text()}`);
  const prof = await profRes.json();
  const lineUserId: string = prof.userId;
  const displayName: string = prof.displayName || "プレイヤー";
  const avatar: string | null = prof.pictureUrl ?? null;
  if (!lineUserId) return fail("profile", "no userId");

  const email = lineEmail(lineUserId);
  const password = await derivePassword(lineUserId);

  // 3) Supabaseユーザーを冪等に作成（service_role）
  let admin;
  try {
    admin = adminClient();
  } catch (e) {
    return fail("admininit", e instanceof Error ? e.message : String(e));
  }
  const { error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { line_user_id: lineUserId, name: displayName, avatar },
  });
  // 既存ユーザーは "already registered" 等で失敗するが無視（その場合は下のログインが通る）
  if (createErr && !/already|exist|registered/i.test(createErr.message)) {
    return fail("create", createErr.message);
  }

  // 4) セッション確立（Cookie を res に書く）
  const res = NextResponse.redirect(`${origin}/`);
  const supabase = routeClient(req, res);
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) return fail("signin", signInErr.message);

  // 5) プロフィール確定＋初期付与（ユーザーセッションで実行）
  const { error: rpcErr } = await supabase.rpc("complete_line_signup", {
    p_display_name: displayName, p_line_user_id: lineUserId, p_avatar: avatar,
  });
  if (rpcErr) return fail("signup", rpcErr.message);

  res.cookies.delete("line_oauth_state");
  return res;
}
