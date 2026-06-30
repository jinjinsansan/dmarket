-- ============================================================
-- 0028 バイラル報酬（参加ポイント・換金不可・無償発行）
-- ・シェアボーナス: 1日1回 +20（reason='share'）
-- ・友達紹介: 紹介者 +200 / 被紹介者 +100（一度きり・reason='referral'）
-- 付与は既存 wallets/point_ledger を使用。書き込みは definer RPC のみ（RLSで直書き拒否）。
-- ※「乗っかり→的中1%」は resolve_market フック＋シェア帰属が要るため別マイグレーションで実装。
-- ============================================================

-- reason 拡張（0026 と同方式で貼り替え）
alter table point_ledger drop constraint if exists point_ledger_reason_check;
alter table point_ledger add constraint point_ledger_reason_check
  check (reason in ('signup','daily','buy','sell','redeem','refund','admin_grant','admin_burn','affiliate','share','referral'));

-- ── シェアボーナス（1日1回・+20） ──────────────────────────
create table if not exists share_grants (
  user_id    uuid not null references auth.users(id),
  grant_date date not null,                  -- JST 基準
  primary key (user_id, grant_date)
);
alter table share_grants enable row level security;
create policy "own share_grants" on share_grants for select using (user_id = auth.uid());

create or replace function claim_share_bonus()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Tokyo')::date; v_balance bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into share_grants(user_id, grant_date) values (v_uid, v_today) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_claimed'); end if;
  update wallets set balance = balance + 20 where user_id = v_uid returning balance into v_balance;
  if v_balance is null then raise exception 'no_wallet'; end if;
  insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, 20, 'share', v_balance);
  return jsonb_build_object('ok', true, 'granted', 20, 'balance', v_balance);
end; $$;

-- ── 友達紹介（紹介者+200 / 被紹介者+100・一度きり） ──────────
create table if not exists referrals (
  referee_id  uuid primary key references auth.users(id),   -- 被紹介者は一度きり
  referrer_id uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);
alter table referrals enable row level security;
create policy "own referrals" on referrals for select using (referee_id = auth.uid() or referrer_id = auth.uid());

-- 紹介コード = user_id の md5 先頭8桁（大文字）。決定的・別テーブル不要。
create or replace function ref_code(p_uid uuid) returns text language sql immutable as $$
  select upper(left(md5(p_uid::text), 8));
$$;

create or replace function my_referral_code()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_count int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select count(*) into v_count from referrals where referrer_id = v_uid;
  return jsonb_build_object('code', ref_code(v_uid), 'count', v_count);
end; $$;

create or replace function apply_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ref uuid; v_rb bigint; v_eb bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if exists(select 1 from referrals where referee_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_referred');
  end if;
  select user_id into v_ref from profiles where ref_code(user_id) = upper(trim(p_code)) limit 1;
  if v_ref is null then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;
  if v_ref = v_uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  insert into referrals(referee_id, referrer_id) values (v_uid, v_ref) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_referred'); end if;
  -- 紹介者 +200
  update wallets set balance = balance + 200 where user_id = v_ref returning balance into v_rb;
  if v_rb is not null then
    insert into point_ledger(user_id, delta, reason, balance_after) values (v_ref, 200, 'referral', v_rb);
  end if;
  -- 被紹介者 +100
  update wallets set balance = balance + 100 where user_id = v_uid returning balance into v_eb;
  if v_eb is null then raise exception 'no_wallet'; end if;
  insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, 100, 'referral', v_eb);
  return jsonb_build_object('ok', true, 'granted', 100, 'balance', v_eb);
end; $$;

revoke execute on function ref_code(uuid) from anon, authenticated;
grant execute on function claim_share_bonus() to authenticated;
grant execute on function my_referral_code()  to authenticated;
grant execute on function apply_referral(text) to authenticated;
