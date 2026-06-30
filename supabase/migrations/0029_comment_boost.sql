-- ============================================================
-- 0029 コメント強化（初心者が盛り上がる）
-- ・YES/NO保有バッジ（どっち派が一目で分かる）
-- ・返信（parent_id）
-- ・通報（comment_reports・3件で自動非表示）＋管理の手動非表示
-- ============================================================

alter table comments add column if not exists parent_id bigint references comments(id) on delete cascade;
alter table comments add column if not exists is_hidden boolean not null default false;
create index if not exists comments_parent_idx on comments(parent_id);

create table if not exists comment_reports (
  id         bigint generated always as identity primary key,
  comment_id bigint not null references comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
alter table comment_reports enable row level security;
drop policy if exists "own comment_reports" on comment_reports;
create policy "own comment_reports" on comment_reports for select using (user_id = auth.uid());

-- コメント一覧（返信・いいね・YES/NO保有・非表示除外）
drop function if exists market_comments(uuid);
create function market_comments(p_market_id uuid)
returns table(id bigint, parent_id bigint, body text, created_at timestamptz,
              display_name text, like_count int, liked boolean, holding text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.parent_id, c.body, c.created_at,
         coalesce(pr.display_name, '匿名'),
         (select count(*)::int from comment_likes l where l.comment_id = c.id),
         exists(select 1 from comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()),
         (select oc.label from positions p2
            join outcomes oc on oc.id = p2.outcome_id and oc.market_id = p_market_id
            where p2.user_id = c.user_id and p2.shares > 0
            order by p2.shares desc limit 1)
  from comments c
  left join profiles pr on pr.user_id = c.user_id
  where c.market_id = p_market_id and c.is_hidden = false
  order by c.created_at asc
  limit 200;
$$;

-- 投稿（返信対応）。旧2引数版を置換。
drop function if exists post_comment(uuid, text);
create function post_comment(p_market_id uuid, p_body text, p_parent_id bigint default null)
returns bigint language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_body,''))) = 0 then raise exception 'empty'; end if;
  -- 返信先が同じ市場のコメントであることを確認（なりすまし防止）
  if p_parent_id is not null and not exists(
       select 1 from comments where id = p_parent_id and market_id = p_market_id and is_hidden = false) then
    raise exception 'invalid_parent';
  end if;
  insert into comments(market_id, user_id, body, parent_id)
    values (p_market_id, v_uid, left(trim(p_body), 500), p_parent_id) returning id into v_id;
  return v_id;
end;
$$;

-- 通報（同一ユーザー一度きり・3件で自動非表示）
create or replace function report_comment(p_comment_id bigint)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_count int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into comment_reports(comment_id, user_id) values (p_comment_id, v_uid) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_reported'); end if;
  select count(*) into v_count from comment_reports where comment_id = p_comment_id;
  if v_count >= 3 then
    update comments set is_hidden = true where id = p_comment_id;
  end if;
  return jsonb_build_object('ok', true, 'reports', v_count);
end;
$$;

-- 管理の手動非表示/復帰
create or replace function admin_hide_comment(p_comment_id bigint, p_hidden boolean)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update comments set is_hidden = p_hidden where id = p_comment_id;
  perform _audit('comment_hide', jsonb_build_object('comment_id', p_comment_id), jsonb_build_object('hidden', p_hidden));
  return true;
end;
$$;

grant execute on function market_comments(uuid)              to anon, authenticated;
grant execute on function post_comment(uuid, text, bigint)   to authenticated;
grant execute on function report_comment(bigint)             to authenticated;
grant execute on function admin_hide_comment(bigint, boolean) to authenticated;
