-- ============================================================
-- 0016 LINEログイン連携（SPEC-01 のLINE版）
-- profiles に line_user_id（1 LINE = 1ウォレットのdedup）を追加し、
-- オンボーディングRPC complete_line_signup で プロフィール確定＋初期付与。
-- ============================================================
alter table profiles add column if not exists line_user_id text unique;

-- LINE認証後（Supabaseセッション確立済み）に呼ぶ。プロフィール upsert ＋ 初期付与（冪等）。
create or replace function complete_line_signup(p_display_name text, p_line_user_id text, p_avatar text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  insert into profiles(user_id, display_name, avatar_id, line_user_id, contact_verified, signup_completed)
    values (v_uid, coalesce(nullif(p_display_name,''),'プレイヤー'), p_avatar, p_line_user_id, true, true)
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      avatar_id    = excluded.avatar_id,
      line_user_id = excluded.line_user_id,
      contact_verified = true,
      signup_completed = true;

  perform grant_signup_bonus();  -- wallet作成＋SIGNUP_GRANT（冪等：既存walletなら無処理）

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function complete_line_signup(text, text, text) to authenticated;
