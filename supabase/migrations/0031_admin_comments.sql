-- ============================================================
-- 0031 管理: 通報コメント一覧（モデレーション）
-- 通報あり or 非表示のコメントを、通報数つきで列挙。操作は既存 admin_hide_comment(0029)。
-- ============================================================
create or replace function admin_list_reported_comments()
returns table(id bigint, market_id uuid, question text, body text,
              display_name text, report_count int, is_hidden boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select c.id, c.market_id, m.question, c.body,
           coalesce(pr.display_name, '匿名'),
           (select count(*)::int from comment_reports r where r.comment_id = c.id),
           c.is_hidden, c.created_at
    from comments c
    join markets m on m.id = c.market_id
    left join profiles pr on pr.user_id = c.user_id
    where c.is_hidden = true or exists (select 1 from comment_reports r where r.comment_id = c.id)
    order by (select count(*) from comment_reports r where r.comment_id = c.id) desc, c.created_at desc
    limit 200;
end; $$;

grant execute on function admin_list_reported_comments() to authenticated;
