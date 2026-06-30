-- ============================================================
-- 0038 クリエイター審査（承認制で市場作成を解放）
-- ・ユーザーは審査申請（SNS媒体URL・作るジャンル・自己紹介）を提出
-- ・管理者が 承認 / 拒否 / 却下 を手動で判定
-- ・承認されたユーザーのみ submit_user_market で市場を申請できる
-- ・作成者テラ銭10%（参加pt・換金不可）は 0033 の resolve_market で実装済み
-- ============================================================

create table if not exists creator_applications (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','dismissed')),
  sns_url       text,                       -- 本人のSNS媒体URL
  genres        text,                       -- 作りたい市場のジャンル
  bio           text,                       -- 自己紹介・作りたい市場の説明
  reviewer_note text,                       -- 管理者メモ（任意・申請者へは非表示）
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
alter table creator_applications enable row level security;
drop policy if exists "own creator_application" on creator_applications;
create policy "own creator_application" on creator_applications for select using (user_id = auth.uid());
-- 書き込みは definer RPC のみ

-- 承認済みクリエイターか？
create or replace function is_creator(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from creator_applications where user_id = p_uid and status = 'approved');
$$;
grant execute on function is_creator(uuid) to authenticated;

-- ── ユーザー: 審査申請（新規 or 再申請）。承認済みは再申請不可 ──
create or replace function apply_creator(p_sns_url text, p_genres text, p_bio text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(btrim(coalesce(p_sns_url,''))) = 0 then raise exception 'sns_required'; end if;
  if length(btrim(coalesce(p_genres,'')))  = 0 then raise exception 'genres_required'; end if;

  select status into v_status from creator_applications where user_id = v_uid;
  if v_status = 'approved' then return jsonb_build_object('ok', false, 'reason', 'already_approved'); end if;
  if v_status = 'pending' then return jsonb_build_object('ok', false, 'reason', 'already_pending'); end if;

  insert into creator_applications(user_id, status, sns_url, genres, bio, reviewer_note, reviewed_at)
    values (v_uid, 'pending', btrim(p_sns_url), btrim(p_genres), nullif(btrim(coalesce(p_bio,'')),''), null, null)
    on conflict (user_id) do update set
      status = 'pending', sns_url = excluded.sns_url, genres = excluded.genres,
      bio = excluded.bio, reviewer_note = null, reviewed_at = null, created_at = now();
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function apply_creator(text, text, text) to authenticated;

-- ── ユーザー: 自分の審査状況 ──
create or replace function my_creator_status()
returns table(status text, sns_url text, genres text, bio text, created_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select status, sns_url, genres, bio, created_at, reviewed_at
  from creator_applications where user_id = auth.uid();
$$;
grant execute on function my_creator_status() to authenticated;

-- ── submit_user_market を承認クリエイター限定に再定義（0033 ＋ is_creator ゲート） ──
create or replace function submit_user_market(p_question text, p_category_id uuid, p_close_time timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_b numeric; v_mid uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not is_creator(v_uid) then raise exception 'not_creator'; end if;
  if length(trim(coalesce(p_question,''))) < 8 then raise exception 'question_too_short'; end if;
  if p_close_time is null or p_close_time <= now() then raise exception 'invalid_close'; end if;
  if (select count(*) from markets where created_by = v_uid and status = 'draft' and source = 'user') >= 5 then
    raise exception 'too_many_pending';
  end if;
  v_b := coalesce((select value from platform_settings where key = 'b_default'), 200);
  insert into markets(category_id, question, description, image_url, market_kind, b_param, source,
                      resolution_kind, status, close_time, resolve_time, created_by)
    values (p_category_id, left(trim(p_question), 200), null, null, 'binary', v_b, 'user',
            'manual', 'draft', p_close_time, p_close_time, v_uid)
    returning id into v_mid;
  insert into outcomes(market_id, label, display_order, q) values
    (v_mid, 'YES', 0, 0), (v_mid, 'NO', 1, 0);
  return v_mid;
end; $$;
grant execute on function submit_user_market(text, uuid, timestamptz) to authenticated;

-- ============================================================
-- 管理RPC（is_admin ゲート）
-- ============================================================

-- 審査一覧（申請内容＋申請者名）。p_status で絞り込み
create or replace function admin_list_creator_applications(p_status text default null)
returns table(
  user_id uuid, display_name text, status text,
  sns_url text, genres text, bio text, reviewer_note text,
  created_at timestamptz, reviewed_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select a.user_id,
           coalesce(nullif(btrim(pr.nickname),''), pr.display_name, '—'),
           a.status, a.sns_url, a.genres, a.bio, a.reviewer_note, a.created_at, a.reviewed_at
    from creator_applications a
    left join profiles pr on pr.user_id = a.user_id
    where (p_status is null or a.status = p_status)
    order by (a.status = 'pending') desc, a.created_at desc
    limit 500;
end; $$;
grant execute on function admin_list_creator_applications(text) to authenticated;

-- 承認 / 拒否 / 却下（手動）。p_status in approved|rejected|dismissed
create or replace function admin_set_creator_status(p_user_id uuid, p_status text, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('approved','rejected','dismissed') then raise exception 'invalid_status'; end if;
  update creator_applications set
    status = p_status,
    reviewer_note = nullif(btrim(coalesce(p_note,'')),''),
    reviewed_at = now()
  where user_id = p_user_id;
  if not found then raise exception 'application_not_found'; end if;
  perform _audit('creator_status', jsonb_build_object('user_id', p_user_id),
                 jsonb_build_object('status', p_status, 'note', p_note));
  return true;
end; $$;
grant execute on function admin_set_creator_status(uuid, text, text) to authenticated;

-- 承認済みクリエイター一覧（作成市場数つき）
create or replace function admin_list_creators()
returns table(user_id uuid, display_name text, sns_url text, genres text,
              market_count bigint, approved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select a.user_id,
           coalesce(nullif(btrim(pr.nickname),''), pr.display_name, '—'),
           a.sns_url, a.genres,
           (select count(*) from markets m where m.created_by = a.user_id and m.source = 'user'),
           a.reviewed_at
    from creator_applications a
    left join profiles pr on pr.user_id = a.user_id
    where a.status = 'approved'
    order by a.reviewed_at desc nulls last
    limit 500;
end; $$;
grant execute on function admin_list_creators() to authenticated;
