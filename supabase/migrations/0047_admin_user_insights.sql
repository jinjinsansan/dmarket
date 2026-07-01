-- ============================================================
-- 0047 管理ユーザー分析の強化
-- ・ログイン回数を記録（complete_line_signup 呼び出し毎に加算）
-- ・admin_list_users に 紹介人数 / 紹介元 / ログイン回数 / 最終ログイン を追加
-- ============================================================

alter table profiles add column if not exists login_count int not null default 0;

-- LINEログイン確定時にプロフィールを upsert（0016）＋ログイン回数を加算
create or replace function complete_line_signup(p_display_name text, p_line_user_id text, p_avatar text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into profiles(user_id, display_name, avatar_id, line_user_id, contact_verified, signup_completed, login_count)
    values (v_uid, coalesce(nullif(p_display_name,''),'プレイヤー'), p_avatar, p_line_user_id, true, true, 1)
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      avatar_id    = excluded.avatar_id,
      line_user_id = excluded.line_user_id,
      contact_verified = true,
      signup_completed = true,
      login_count  = profiles.login_count + 1;
  perform grant_signup_bonus();
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function complete_line_signup(text, text, text) to authenticated;

-- 管理ユーザー一覧（0046版＋紹介人数/紹介元/ログイン回数/最終ログイン）
-- 戻り値の列が増えるため、既存関数を drop してから再作成する。
drop function if exists admin_list_users();
create function admin_list_users()
returns table(
  user_id uuid, display_name text, email text, line_user_id text,
  balance bigint, trades_count int, net_worth bigint, realized_pnl bigint,
  resolved_count int, win_count int, is_flagged boolean, is_admin boolean,
  created_at timestamptz, last_activity timestamptz,
  login_count int, last_sign_in timestamptz, referral_count int, referred_by text
) language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select w.user_id, coalesce(nullif(btrim(p.nickname),''), p.display_name, '—'), u.email::text, p.line_user_id,
           w.balance, coalesce(s.trades_count, 0), coalesce(s.net_worth, 0), coalesce(s.realized_pnl, 0),
           coalesce(s.resolved_count, 0), coalesce(s.win_count, 0),
           coalesce(p.is_flagged, false),
           exists(select 1 from admin_users a where a.user_id = w.user_id),
           w.created_at,
           (select max(pl.created_at) from point_ledger pl where pl.user_id = w.user_id),
           coalesce(p.login_count, 0),
           u.last_sign_in_at,
           (select count(*)::int from referrals r where r.referrer_id = w.user_id),
           (select coalesce(nullif(btrim(rp.nickname),''), rp.display_name)
              from referrals r2 join profiles rp on rp.user_id = r2.referrer_id
              where r2.referee_id = w.user_id)
    from wallets w
    left join profiles p on p.user_id = w.user_id
    left join auth.users u on u.id = w.user_id
    left join user_stats s on s.user_id = w.user_id
    order by w.created_at desc;
end;
$$;
grant execute on function admin_list_users() to authenticated;
