-- ============================================================
-- 0022 二層ポイント制：賞品ポイント層（Phase A / 表に出さない土台）
--
-- 設計（二層ポイント制_設計案.md）:
--   ・参加ポイント = 既存 wallets.balance（市場の売買・解決はこちらで完結。本MIGで無改修）
--   ・賞品ポイント = 本MIGで新設。的中報酬として付与し、確定交換で景品に換える専用通貨。
--
-- 不変条件（参加pt の absence test と同思想）:
--   prize_wallets.balance は grant_prize_points / redeem_prize / expire_prize_points
--   の3関数を経由しなければ変動しない。常に balance == Σ prize_ledger.delta。
--
-- Phase A では resolve_market へのフックやフロント表示は行わない（Phase B 以降）。
-- ============================================================

-- 賞品ポイント残高（1ユーザー1行）
create table if not exists prize_wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

-- 賞品ポイントの不変台帳（INSERTのみ）。付与には有効期限(expires_at)を持たせFIFOで失効。
create table if not exists prize_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id),
  delta         bigint not null,                 -- 正=付与 / 負=交換・失効
  reason        text not null,                   -- win_reward|rank_reward|redeem|expire|adjust
  market_id     uuid references markets(id),     -- 的中報酬の出所
  redemption_id uuid,                            -- 景品交換時
  expires_at    timestamptz,                     -- 付与分の有効期限（負のdeltaではnull）
  balance_after bigint not null,                 -- 監査用スナップショット
  created_at    timestamptz not null default now(),
  check (reason in ('win_reward','rank_reward','redeem','expire','adjust'))
);
create index if not exists prize_ledger_user_idx on prize_ledger(user_id, created_at);
-- 失効バッチ用：未失効の付与分を expires_at で走査
create index if not exists prize_ledger_expiry_idx on prize_ledger(expires_at) where delta > 0;

-- 景品マスタ
create table if not exists prizes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  image_url   text,
  cost_points bigint not null check (cost_points > 0),  -- 必要賞品pt
  stock       int,                                       -- null=無制限
  is_active   boolean not null default true,
  display_order int not null default 0,
  created_at  timestamptz not null default now()
);

-- 景品交換申込
create table if not exists prize_redemptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  prize_id    uuid not null references prizes(id),
  cost_points bigint not null,
  status      text not null default 'requested',  -- requested|approved|shipped|cancelled
  shipping    jsonb,                               -- 配送先（個人情報。最小保持・要暗号化運用）
  created_at  timestamptz not null default now(),
  check (status in ('requested','approved','shipped','cancelled'))
);
create index if not exists prize_redemptions_user_idx on prize_redemptions(user_id, created_at desc);

-- ============================================================
-- RLS：参加pt と同じく「自分のものだけ読める」。書き込みは definer RPC のみ。
-- 景品カタログは公開（有効なものだけ）。
-- ============================================================
alter table prize_wallets     enable row level security;
alter table prize_ledger      enable row level security;
alter table prizes            enable row level security;
alter table prize_redemptions enable row level security;

create policy "own prize_wallet"     on prize_wallets     for select using (user_id = auth.uid());
create policy "own prize_ledger"     on prize_ledger      for select using (user_id = auth.uid());
create policy "own prize_redemption" on prize_redemptions for select using (user_id = auth.uid());
create policy "public prizes"        on prizes            for select using (is_active = true);

-- ============================================================
-- RPC
-- ============================================================

-- 賞品pt付与（的中報酬／ランキング報酬／調整）。
-- 対象ユーザーを明示指定するため authenticated からの直接実行は不可（definer/サーバー専用）。
-- resolve_market（definer）や管理ジョブ（service_role）から呼ぶ想定。
create or replace function grant_prize_points(
  p_user uuid,
  p_amount bigint,
  p_reason text default 'win_reward',
  p_market_id uuid default null,
  p_expires_at timestamptz default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  if p_reason not in ('win_reward','rank_reward','adjust') then
    raise exception 'invalid_reason';
  end if;

  insert into prize_wallets(user_id, balance)
    values (p_user, 0)
    on conflict (user_id) do nothing;

  update prize_wallets set balance = balance + p_amount
    where user_id = p_user
    returning balance into v_bal;

  insert into prize_ledger(user_id, delta, reason, market_id, expires_at, balance_after)
    values (p_user, p_amount, p_reason, p_market_id,
            coalesce(p_expires_at, now() + interval '90 days'), v_bal);

  return v_bal;
end;
$$;

-- 景品の確定交換（必要pt数で交換、抽選なし）。本人が実行。
create or replace function redeem_prize(
  p_prize_id uuid,
  p_shipping jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_prize prizes%rowtype;
  v_bal   bigint;
  v_red   uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_prize from prizes where id = p_prize_id and is_active = true for update;
  if not found then raise exception 'prize_unavailable'; end if;
  if v_prize.stock is not null and v_prize.stock <= 0 then
    raise exception 'out_of_stock';
  end if;

  select balance into v_bal from prize_wallets where user_id = v_uid for update;
  if v_bal is null or v_bal < v_prize.cost_points then
    raise exception 'insufficient_prize_points';
  end if;

  if v_prize.stock is not null then
    update prizes set stock = stock - 1 where id = p_prize_id;
  end if;

  insert into prize_redemptions(user_id, prize_id, cost_points, shipping)
    values (v_uid, p_prize_id, v_prize.cost_points, p_shipping)
    returning id into v_red;

  update prize_wallets set balance = balance - v_prize.cost_points
    where user_id = v_uid
    returning balance into v_bal;

  insert into prize_ledger(user_id, delta, reason, redemption_id, balance_after)
    values (v_uid, -v_prize.cost_points, 'redeem', v_red, v_bal);

  return jsonb_build_object('ok', true, 'redemption_id', v_red,
                            'cost', v_prize.cost_points, 'balance', v_bal);
end;
$$;

-- 有効期限切れの賞品ptを失効（cronで日次）。
-- FIFO（古い付与から消費）かつ expires_at は付与時刻に単調 → 失効可能額は
--   max(0, 期限切れ付与合計 - これまでの消費合計) で正確に求まる（設計案 §3 参照）。
-- balance を下回らないことは数学的に保証される（期限切れ付与 ≦ 全付与）。
create or replace function expire_prize_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users int;
  v_total bigint;
begin
  with agg as (
    select user_id,
           coalesce(sum(delta) filter (where delta > 0 and expires_at <= now()), 0) as g_exp,
           coalesce(sum(-delta) filter (where delta < 0), 0)                        as consumed
    from prize_ledger
    group by user_id
  ),
  exp as (
    select user_id, greatest(0, g_exp - consumed)::bigint as amt from agg
  ),
  upd as (
    update prize_wallets w
      set balance = w.balance - exp.amt
      from exp
      where w.user_id = exp.user_id and exp.amt > 0
      returning w.user_id, w.balance as balance_after, exp.amt as amt
  ),
  ins as (
    insert into prize_ledger(user_id, delta, reason, balance_after)
    select user_id, -amt, 'expire', balance_after from upd
    returning -delta as amt
  )
  select count(*), coalesce(sum(amt), 0) into v_users, v_total from ins;

  return jsonb_build_object('ok', true, 'expired_users', v_users, 'expired_total', v_total);
end;
$$;

-- 実行権限：交換は本人、付与・失効はサーバー専用（authenticated/anon からは不可）。
grant execute on function redeem_prize(uuid, jsonb)             to authenticated;
revoke execute on function grant_prize_points(uuid, bigint, text, uuid, timestamptz) from authenticated, anon;
revoke execute on function expire_prize_points()               from authenticated, anon;
