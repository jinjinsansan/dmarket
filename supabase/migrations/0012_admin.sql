-- ============================================================
-- 0012 管理コンソール（SPEC-07）
-- admin_users / admin_audit ＋ 管理RPC（全て is_admin() を内部検証）。
-- 管理操作はすべて admin_audit に記録（誰が・いつ・何を）。
-- ============================================================
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role    text not null default 'admin'   -- 'admin' | 'moderator'
);

create table if not exists admin_audit (
  id        bigint generated always as identity primary key,
  actor     uuid references auth.users(id),
  action    text not null,
  target    jsonb,
  detail    jsonb,
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;
alter table admin_audit enable row level security;

-- 管理者判定（security definer で RLS をバイパスして自己参照）
create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from admin_users where user_id = auth.uid()); $$;

-- admin_users / admin_audit は管理者のみ閲覧
create policy "admins read admins" on admin_users for select using (is_admin());
create policy "admins read audit"  on admin_audit for select using (is_admin());

create or replace function _audit(p_action text, p_target jsonb, p_detail jsonb)
returns void language sql security definer set search_path = public
as $$ insert into admin_audit(actor, action, target, detail) values (auth.uid(), p_action, p_target, p_detail); $$;

-- ── 市場作成（admin手動・SPEC-07 §3） ─────────────────────────
create or replace function create_admin_market(
  p_question text, p_description text, p_image_url text, p_category_id uuid,
  p_market_kind text, p_outcomes jsonb,  -- [{label, display_order}]
  p_b numeric, p_close_time timestamptz, p_resolve_time timestamptz,
  p_initial_yes_price numeric default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_outcomes jsonb; v_id uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;

  -- 二択かつ初期YES価格指定があれば q をシード、それ以外はフラット(q=0)
  if p_market_kind = 'binary' and p_initial_yes_price is not null then
    v_outcomes := jsonb_build_array(
      jsonb_build_object('label', p_outcomes->0->>'label', 'display_order', 0,
                         'q', lmsr_seed_q_binary(p_b::float8, p_initial_yes_price::float8)),
      jsonb_build_object('label', p_outcomes->1->>'label', 'display_order', 1, 'q', 0)
    );
  else
    v_outcomes := p_outcomes;  -- create_market_internal が q 既定0で扱う
  end if;

  v_id := create_market_internal(
    p_category_id, p_question, p_description, p_image_url, p_market_kind, p_b,
    'admin', 'manual', null, null, p_close_time, p_resolve_time, v_outcomes);

  perform _audit('create_market', jsonb_build_object('market_id', v_id),
                 jsonb_build_object('question', p_question));
  return v_id;
end;
$$;

-- ── 解決キュー操作（SPEC-07 §6） ──────────────────────────────
create or replace function admin_resolve(p_market_id uuid, p_winning_outcome_id uuid, p_source_url text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v jsonb;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  v := resolve_market(p_market_id, p_winning_outcome_id, p_source_url);
  delete from resolution_queue where market_id = p_market_id;
  perform _audit('resolve', jsonb_build_object('market_id', p_market_id),
                 jsonb_build_object('winning', p_winning_outcome_id, 'source', p_source_url));
  return v;
end;
$$;

create or replace function admin_void(p_market_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v jsonb;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  v := void_market(p_market_id, p_reason);
  delete from resolution_queue where market_id = p_market_id;
  perform _audit('void', jsonb_build_object('market_id', p_market_id),
                 jsonb_build_object('reason', p_reason));
  return v;
end;
$$;

-- ── 訂正（誤確定リカバリ・SPEC-03 §6 / SPEC-07 §7。二段確認はUIで担保） ──
-- 旧償還を逆仕訳し、正しいoutcomeで再償還。台帳整合(balance==Σdelta)を保つ。
-- ※ 誤付与分を既に使ったユーザーがいると balance<0 になり CHECK で全ロールバック（v1の制約）。
create or replace function correct_resolution(p_market_id uuid, p_correct_outcome_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_old uuid; v_reversed bigint; v_paid bigint;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if (select status from markets where id = p_market_id) <> 'resolved' then
    raise exception 'not_resolved';
  end if;
  select id into v_old from outcomes where market_id = p_market_id and is_winner;
  if v_old = p_correct_outcome_id then return jsonb_build_object('ok', true, 'noop', true); end if;

  -- 1) 旧償還の逆仕訳
  with old_pay as (
    select user_id, sum(delta)::bigint as paid
    from point_ledger where market_id = p_market_id and reason = 'redeem'
    group by user_id having sum(delta) <> 0
  ),
  upd as (
    update wallets w set balance = w.balance - op.paid
    from old_pay op where w.user_id = op.user_id
    returning w.user_id, w.balance as ba, op.paid as paid
  )
  insert into point_ledger(user_id, delta, reason, market_id, balance_after)
  select user_id, -paid, 'redeem', p_market_id, ba from upd;
  get diagnostics v_reversed = row_count;

  -- 2) 勝者付け替え
  update outcomes set is_winner = (id = p_correct_outcome_id) where market_id = p_market_id;

  -- 3) 正しい勝者へ再償還
  with winners as (
    select user_id, (shares * 100)::bigint as payout
    from positions where outcome_id = p_correct_outcome_id and shares > 0
  ),
  upd as (
    update wallets w set balance = w.balance + winners.payout
    from winners where w.user_id = winners.user_id
    returning w.user_id, w.balance as ba, winners.payout as payout
  )
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, balance_after)
  select user_id, payout, 'redeem', p_market_id, p_correct_outcome_id, ba from upd;
  get diagnostics v_paid = row_count;

  update resolutions set winning_outcome_id = p_correct_outcome_id, source_url = p_reason where market_id = p_market_id;
  insert into resolution_audit(market_id, feed, decided, source_url, raw_value)
    values (p_market_id, 'correction', 'resolved', p_reason,
            jsonb_build_object('old_outcome', v_old, 'new_outcome', p_correct_outcome_id));
  perform _audit('correct', jsonb_build_object('market_id', p_market_id),
                 jsonb_build_object('old', v_old, 'new', p_correct_outcome_id, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'reversed_users', v_reversed, 'repaid_users', v_paid);
end;
$$;

-- ── ユーザーフラグ（SPEC-07 §8 / SPEC-08） ───────────────────
create or replace function flag_user(p_user_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update profiles set is_flagged = true where user_id = p_user_id;
  perform _audit('flag_user', jsonb_build_object('user_id', p_user_id),
                 jsonb_build_object('reason', p_reason));
end;
$$;

-- ── カテゴリ別フィード設定の更新（SPEC-07 §5） ───────────────
create or replace function upsert_feed_settings(
  p_category_id uuid, p_target_active int, p_poly_min int, p_poly_max int,
  p_daily_gen_cap int, p_poly_tag_ids int[], p_poly_sort text,
  p_template_enabled boolean, p_mode text
) returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  insert into category_feed_settings as s
    (category_id, target_active, poly_min, poly_max, daily_gen_cap, poly_tag_ids, poly_sort, template_enabled, mode, updated_at)
  values
    (p_category_id, p_target_active, p_poly_min, p_poly_max, p_daily_gen_cap, p_poly_tag_ids, p_poly_sort, p_template_enabled, p_mode, now())
  on conflict (category_id) do update set
    target_active = excluded.target_active, poly_min = excluded.poly_min, poly_max = excluded.poly_max,
    daily_gen_cap = excluded.daily_gen_cap, poly_tag_ids = excluded.poly_tag_ids, poly_sort = excluded.poly_sort,
    template_enabled = excluded.template_enabled, mode = excluded.mode, updated_at = now();
  perform _audit('settings', jsonb_build_object('category_id', p_category_id), to_jsonb(p_mode));
end;
$$;

-- 管理RPCは authenticated から呼べる（内部で is_admin を検証）
grant execute on function create_admin_market(text,text,text,uuid,text,jsonb,numeric,timestamptz,timestamptz,numeric) to authenticated;
grant execute on function admin_resolve(uuid,uuid,text)            to authenticated;
grant execute on function admin_void(uuid,text)                    to authenticated;
grant execute on function correct_resolution(uuid,uuid,text)        to authenticated;
grant execute on function flag_user(uuid,text)                      to authenticated;
grant execute on function upsert_feed_settings(uuid,int,int,int,int,int[],text,boolean,text) to authenticated;
grant execute on function is_admin()                                to authenticated;
