-- ============================================================
-- 0037 合言葉キャンペーン（参加ポイント・換金不可・無償発行）
-- 管理者がSNS等で配る「合言葉」をユーザーがマイページで入力 → 参加ポイント付与。
-- ・1ユーザー1コードにつき一度きり
-- ・有効期間（任意）と総回数上限（任意）を設定可能
-- 付与は既存 wallets/point_ledger を使用（reason='promo'）。書き込みは definer RPC のみ。
-- セキュリティ: 合言葉は秘密。promo_codes に public SELECT は付けない（definer経由のみ）。
-- ============================================================

-- reason 拡張（0033 に 'promo' を追加）
alter table point_ledger drop constraint if exists point_ledger_reason_check;
alter table point_ledger add constraint point_ledger_reason_check
  check (reason in ('signup','daily','buy','sell','redeem','refund','admin_grant','admin_burn',
                    'affiliate','share','referral','ride','creator','promo'));

-- キャンペーン（合言葉）マスタ。code は正規化（大文字・trim）して保存。
create table if not exists promo_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,                 -- 正規化済み（upper+trim）
  label           text,                                 -- 管理用メモ／キャンペーン名
  reward_points   bigint not null check (reward_points > 0),
  max_redemptions int,                                  -- null=無制限（総回数）
  used_count      int not null default 0,
  starts_at       timestamptz,                          -- null=開始制限なし
  expires_at      timestamptz,                          -- null=期限なし
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- 引換履歴（1ユーザー1コード一度きり）。本人のみ閲覧。
create table if not exists promo_redemptions (
  id         bigint generated always as identity primary key,
  code_id    uuid not null references promo_codes(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  points     bigint not null,
  created_at timestamptz not null default now(),
  unique (code_id, user_id)
);

alter table promo_codes       enable row level security;
alter table promo_redemptions enable row level security;
-- promo_codes には SELECT ポリシーを作らない（合言葉は秘密。definer RPC のみ参照）
create policy "own promo_redemptions" on promo_redemptions for select using (user_id = auth.uid());

-- ── ユーザー: 合言葉を入力して参加ポイントを受け取る ──
create or replace function redeem_promo_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code,'')));
  v_pc   promo_codes%rowtype;
  v_bal  bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_code = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;

  select * into v_pc from promo_codes where code = v_code for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;
  if not v_pc.is_active then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  if v_pc.starts_at is not null and now() < v_pc.starts_at then
    return jsonb_build_object('ok', false, 'reason', 'not_started'); end if;
  if v_pc.expires_at is not null and now() > v_pc.expires_at then
    return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if v_pc.max_redemptions is not null and v_pc.used_count >= v_pc.max_redemptions then
    return jsonb_build_object('ok', false, 'reason', 'sold_out'); end if;

  -- 1ユーザー1回（unique で担保）
  insert into promo_redemptions(code_id, user_id, points)
    values (v_pc.id, v_uid, v_pc.reward_points)
    on conflict (code_id, user_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_redeemed'); end if;

  -- 参加ポイント付与（wallet が無ければ作成）
  insert into wallets(user_id, balance) values (v_uid, 0) on conflict (user_id) do nothing;
  update wallets set balance = balance + v_pc.reward_points where user_id = v_uid returning balance into v_bal;
  insert into point_ledger(user_id, delta, reason, balance_after)
    values (v_uid, v_pc.reward_points, 'promo', v_bal);

  update promo_codes set used_count = used_count + 1 where id = v_pc.id;

  return jsonb_build_object('ok', true, 'granted', v_pc.reward_points, 'balance', v_bal,
                           'label', v_pc.label);
end;
$$;
grant execute on function redeem_promo_code(text) to authenticated;

-- ============================================================
-- 管理RPC（is_admin ゲート）
-- ============================================================
create or replace function admin_list_promo_codes()
returns setof promo_codes language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query select * from promo_codes order by created_at desc;
end;
$$;
grant execute on function admin_list_promo_codes() to authenticated;

-- 作成・更新（p_id=null で新規）。code は正規化して保存。重複は duplicate_code。
create or replace function admin_upsert_promo_code(
  p_id uuid,
  p_code text,
  p_label text,
  p_reward_points bigint,
  p_max_redemptions int,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_code text := upper(btrim(coalesce(p_code,'')));
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if v_code = '' then raise exception 'invalid_code'; end if;
  if p_reward_points is null or p_reward_points <= 0 then raise exception 'invalid_reward'; end if;
  if p_max_redemptions is not null and p_max_redemptions < 0 then raise exception 'invalid_max'; end if;

  if exists(select 1 from promo_codes where code = v_code and (p_id is null or id <> p_id)) then
    raise exception 'duplicate_code';
  end if;

  if p_id is null then
    insert into promo_codes(code, label, reward_points, max_redemptions, starts_at, expires_at, is_active)
      values (v_code, nullif(btrim(coalesce(p_label,'')),''), p_reward_points, p_max_redemptions,
              p_starts_at, p_expires_at, coalesce(p_is_active, true))
      returning id into v_id;
  else
    update promo_codes set
      code            = v_code,
      label           = nullif(btrim(coalesce(p_label,'')),''),
      reward_points   = p_reward_points,
      max_redemptions = p_max_redemptions,
      starts_at       = p_starts_at,
      expires_at      = p_expires_at,
      is_active       = coalesce(p_is_active, is_active)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'promo_not_found'; end if;
  end if;

  perform _audit('upsert_promo', jsonb_build_object('promo_id', v_id),
                 jsonb_build_object('code', v_code, 'reward', p_reward_points, 'max', p_max_redemptions));
  return v_id;
end;
$$;
grant execute on function admin_upsert_promo_code(uuid, text, text, bigint, int, timestamptz, timestamptz, boolean) to authenticated;

-- 有効/無効の切替
create or replace function admin_set_promo_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update promo_codes set is_active = p_active where id = p_id;
  if not found then raise exception 'promo_not_found'; end if;
  perform _audit('set_promo_active', jsonb_build_object('promo_id', p_id), jsonb_build_object('active', p_active));
end;
$$;
grant execute on function admin_set_promo_active(uuid, boolean) to authenticated;
