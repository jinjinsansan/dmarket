-- ============================================================
-- 0018 管理者向けユーザー一覧・運用RPC
-- ユーザー横断の閲覧（RLSをバイパスする security definer・is_admin 検証）と、
-- 運営によるポイント付与/消滅（無償・台帳記録・監査）。
-- ※ admin_grant/admin_burn は「有償発行・換金・譲渡」ではない（賭博非該当を維持）。
-- ============================================================

-- 台帳の理由に admin_grant / admin_burn を許可
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'point_ledger'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%reason%' limit 1;
  if c is not null then execute 'alter table point_ledger drop constraint ' || quote_ident(c); end if;
end $$;
alter table point_ledger add constraint point_ledger_reason_check
  check (reason in ('signup','daily','buy','sell','redeem','refund','admin_grant','admin_burn'));

-- ── ユーザー一覧（集計つき） ─────────────────────────────────
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
    select w.user_id, coalesce(p.display_name, '—'), u.email, p.line_user_id,
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

-- ── 1ユーザーの台帳（プレイ/ポイント履歴） ─────────────────
create or replace function admin_user_ledger(p_user_id uuid)
returns table(id bigint, delta bigint, reason text, balance_after bigint, shares numeric, created_at timestamptz, question text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select pl.id, pl.delta, pl.reason, pl.balance_after, pl.shares, pl.created_at, m.question
    from point_ledger pl
    left join markets m on m.id = pl.market_id
    where pl.user_id = p_user_id
    order by pl.created_at desc
    limit 200;
end;
$$;

-- ── 1ユーザーの保有ポジション ───────────────────────────────
create or replace function admin_user_positions(p_user_id uuid)
returns table(question text, label text, shares numeric, cost_basis bigint, status text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select m.question, o.label, pos.shares, pos.cost_basis, m.status
    from positions pos
    join outcomes o on o.id = pos.outcome_id
    join markets m on m.id = o.market_id
    where pos.user_id = p_user_id and pos.shares > 0
    order by pos.cost_basis desc;
end;
$$;

-- ── ポイント調整（付与/消滅）。負残高にはしない（消滅は全額まで） ──
create or replace function admin_adjust_points(p_user_id uuid, p_delta bigint, p_note text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_bal bigint; v_applied bigint; v_new bigint;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_delta = 0 then raise exception 'zero_delta'; end if;
  select balance into v_bal from wallets where user_id = p_user_id for update;
  if v_bal is null then raise exception 'no_wallet'; end if;

  v_applied := p_delta;
  if v_bal + v_applied < 0 then v_applied := -v_bal; end if;  -- 残高0未満にはしない（消滅は全額まで）

  update wallets set balance = balance + v_applied where user_id = p_user_id returning balance into v_new;
  insert into point_ledger(user_id, delta, reason, balance_after)
    values (p_user_id, v_applied, case when v_applied > 0 then 'admin_grant' else 'admin_burn' end, v_new);
  perform _audit('adjust_points', jsonb_build_object('user_id', p_user_id),
                 jsonb_build_object('delta', v_applied, 'note', p_note));
  return jsonb_build_object('ok', true, 'applied', v_applied, 'balance', v_new);
end;
$$;

-- ── フラグ解除（flag_user は 0012 で定義済み） ───────────────
create or replace function unflag_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update profiles set is_flagged = false where user_id = p_user_id;
  perform _audit('unflag_user', jsonb_build_object('user_id', p_user_id), null);
end;
$$;

grant execute on function admin_list_users()                       to authenticated;
grant execute on function admin_user_ledger(uuid)                  to authenticated;
grant execute on function admin_user_positions(uuid)               to authenticated;
grant execute on function admin_adjust_points(uuid, bigint, text)  to authenticated;
grant execute on function unflag_user(uuid)                        to authenticated;
