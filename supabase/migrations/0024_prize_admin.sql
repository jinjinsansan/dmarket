-- ============================================================
-- 0024 二層ポイント制 Phase C：景品マスタ管理＆交換申込の運用RPC（管理者専用）
--
-- 0022 で prizes / prize_redemptions と redeem_prize（本人交換）を用意済み。
-- 本MIGは管理者向けに以下を追加:
--   ・景品マスタ CRUD（一覧/作成・更新/有効切替）
--   ・交換申込の一覧と発送ステータス管理（requested→approved→shipped / cancelled）
--   ・取消時は賞品ptを返金し在庫を戻す（balance == Σ prize_ledger.delta を維持）
--
-- すべて is_admin() ゲート＋_audit 記録（0012 と同方針）。
-- ============================================================

-- ── 景品マスタ：一覧（無効含む。公開ページは RLS で is_active のみ） ──
create or replace function admin_list_prizes()
returns setof prizes language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query select * from prizes order by display_order, created_at desc;
end;
$$;

-- ── 景品マスタ：作成 / 更新（p_id=null で新規） ──
create or replace function admin_upsert_prize(
  p_id uuid,
  p_name text,
  p_description text,
  p_image_url text,
  p_cost_points bigint,
  p_stock int,                 -- null=無制限
  p_is_active boolean,
  p_display_order int
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'invalid_name'; end if;
  if p_cost_points is null or p_cost_points <= 0 then raise exception 'invalid_cost'; end if;
  if p_stock is not null and p_stock < 0 then raise exception 'invalid_stock'; end if;

  if p_id is null then
    insert into prizes(name, description, image_url, cost_points, stock, is_active, display_order)
      values (p_name, p_description, p_image_url, p_cost_points, p_stock,
              coalesce(p_is_active, true), coalesce(p_display_order, 0))
      returning id into v_id;
  else
    update prizes set
      name          = p_name,
      description    = p_description,
      image_url      = p_image_url,
      cost_points    = p_cost_points,
      stock          = p_stock,
      is_active      = coalesce(p_is_active, is_active),
      display_order  = coalesce(p_display_order, display_order)
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'prize_not_found'; end if;
  end if;

  perform _audit('upsert_prize', jsonb_build_object('prize_id', v_id),
                 jsonb_build_object('name', p_name, 'cost', p_cost_points, 'active', p_is_active));
  return v_id;
end;
$$;

-- ── 景品マスタ：有効/無効の切替（公開停止用） ──
create or replace function admin_set_prize_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update prizes set is_active = p_active where id = p_id;
  if not found then raise exception 'prize_not_found'; end if;
  perform _audit('set_prize_active', jsonb_build_object('prize_id', p_id),
                 jsonb_build_object('active', p_active));
end;
$$;

-- ── 交換申込：一覧（景品名・申込者表示名を結合） ──
create or replace function admin_list_redemptions(p_status text default null)
returns table(
  id uuid, user_id uuid, display_name text,
  prize_id uuid, prize_name text, cost_points bigint,
  status text, shipping jsonb, created_at timestamptz
) language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select r.id, r.user_id, coalesce(pr.display_name, '—'),
           r.prize_id, pz.name, r.cost_points,
           r.status, r.shipping, r.created_at
    from prize_redemptions r
    join prizes pz   on pz.id = r.prize_id
    left join profiles pr on pr.user_id = r.user_id
    where (p_status is null or r.status = p_status)
    order by r.created_at desc
    limit 500;
end;
$$;

-- ── 交換申込：発送ステータス更新 ──
-- requested|approved|shipped|cancelled。
-- 未発送（requested/approved）→ cancelled の場合のみ、賞品ptを返金し在庫を戻す。
-- shipped 済みの取消は返金しない（景品が出ているため運用で個別対応）。
create or replace function admin_set_redemption_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_red prize_redemptions%rowtype; v_bal bigint;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('requested','approved','shipped','cancelled') then
    raise exception 'invalid_status';
  end if;

  select * into v_red from prize_redemptions where id = p_id for update;
  if not found then raise exception 'redemption_not_found'; end if;

  -- 未発送からの取消：賞品ptを返金（新たな90日有効期限）＋在庫を1戻す
  if p_status = 'cancelled' and v_red.status in ('requested','approved') then
    insert into prize_wallets(user_id, balance) values (v_red.user_id, 0)
      on conflict (user_id) do nothing;
    update prize_wallets set balance = balance + v_red.cost_points
      where user_id = v_red.user_id
      returning balance into v_bal;
    insert into prize_ledger(user_id, delta, reason, redemption_id, expires_at, balance_after)
      values (v_red.user_id, v_red.cost_points, 'adjust', v_red.id,
              now() + interval '90 days', v_bal);
    update prizes set stock = stock + 1 where id = v_red.prize_id and stock is not null;
  end if;

  update prize_redemptions set status = p_status where id = p_id;
  perform _audit('redemption_status', jsonb_build_object('redemption_id', p_id),
                 jsonb_build_object('from', v_red.status, 'to', p_status));
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

-- 実行権限：いずれも is_admin() を内部で検証（authenticated に付与）。
grant execute on function admin_list_prizes()                                          to authenticated;
grant execute on function admin_upsert_prize(uuid,text,text,text,bigint,int,boolean,int) to authenticated;
grant execute on function admin_set_prize_active(uuid, boolean)                          to authenticated;
grant execute on function admin_list_redemptions(text)                                   to authenticated;
grant execute on function admin_set_redemption_status(uuid, text)                        to authenticated;
