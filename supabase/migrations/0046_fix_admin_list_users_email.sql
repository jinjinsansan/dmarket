-- ============================================================
-- 0046 admin_list_users の型エラー修正
-- auth.users.email は character varying(255)。戻り値 email text と不一致で
--   42804: structure of query does not match function result type
-- となり /admin/users が「取得失敗」に。u.email を ::text にキャストして解消。
-- （0018版の本文をそのまま、email のみキャスト）
-- ============================================================
create or replace function admin_list_users()
returns table(
  user_id uuid, display_name text, email text, line_user_id text,
  balance bigint, trades_count int, net_worth bigint, realized_pnl bigint,
  resolved_count int, win_count int, is_flagged boolean, is_admin boolean,
  created_at timestamptz, last_activity timestamptz
) language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select w.user_id, coalesce(p.display_name, '—'), u.email::text, p.line_user_id,
           w.balance, coalesce(s.trades_count, 0), coalesce(s.net_worth, 0), coalesce(s.realized_pnl, 0),
           coalesce(s.resolved_count, 0), coalesce(s.win_count, 0),
           coalesce(p.is_flagged, false),
           exists(select 1 from admin_users a where a.user_id = w.user_id),
           w.created_at,
           (select max(pl.created_at) from point_ledger pl where pl.user_id = w.user_id)
    from wallets w
    left join profiles p on p.user_id = w.user_id
    left join auth.users u on u.id = w.user_id
    left join user_stats s on s.user_id = w.user_id
    order by w.created_at desc;
end;
$$;
grant execute on function admin_list_users() to authenticated;
