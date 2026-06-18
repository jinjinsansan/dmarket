-- ============================================================
-- dmarket 全スキーマ（Supabase SQL Editor 用・まるごと貼り付け実行）
-- migrations 0001-0014 を順に結合（0009_cron は分離: cron_after_functions.sql）
-- 前提: Supabase（auth スキーマ・auth.users・anon/authenticated/service_role ロールは既存）
-- 生成日時はリポジトリのコミットを参照（再生成は supabase/deploy/build.sh 相当の手順）
-- ============================================================


-- ===================== 0001_core_tables.sql =====================
-- ============================================================
-- 0001 中核テーブル（SPEC-02 §1 / SPEC-05 §1）
-- wallets / point_ledger / categories / markets / outcomes /
-- positions / resolutions / daily_grants / market_price_history
-- 全テーブル RLS 有効化。書き込みは security definer RPC 経由のみ。
-- ============================================================

-- カテゴリ（SPEC-04 の完全形は 0006 で拡張。markets が参照するため最小形を先に置く）
create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  display_order int  not null default 0,
  is_active     boolean not null default true
);

-- ウォレット（1ユーザー1行 = 1人1ウォレット）
create table if not exists wallets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

-- 市場（SPEC-02 §1 完全形）
create table if not exists markets (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid references categories(id),
  question           text not null,
  description        text,
  image_url          text,
  market_kind        text not null default 'binary',   -- 'binary' | 'multi'
  b_param            numeric not null default 200 check (b_param > 0),
  source             text not null,                     -- 'admin'|'template'|'mirror'
  resolution_kind    text not null,                     -- 'manual'|'auto'
  resolution_binding jsonb,
  external_ref       text,
  status             text not null default 'open',      -- draft|open|closed|resolving|resolved|void
  close_time         timestamptz not null,
  resolve_time       timestamptz not null,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  check (status in ('draft','open','closed','resolving','resolved','void')),
  check (source in ('admin','template','mirror')),
  check (resolution_kind in ('manual','auto'))
);

-- アウトカム（q がLMSR状態ベクトル本体）
create table if not exists outcomes (
  id            uuid primary key default gen_random_uuid(),
  market_id     uuid not null references markets(id) on delete cascade,
  label         text not null,
  display_order int not null default 0,
  q             numeric not null default 0,
  is_winner     boolean,
  unique (market_id, display_order)
);
create index if not exists outcomes_market_idx on outcomes(market_id);

-- ポジション（保有株。cost_basis は P&L と void 返金用）
create table if not exists positions (
  user_id     uuid not null references auth.users(id),
  outcome_id  uuid not null references outcomes(id),
  shares      numeric not null default 0 check (shares >= 0),
  cost_basis  bigint not null default 0,
  primary key (user_id, outcome_id)
);

-- 不変の取引台帳（INSERT のみ。UPDATE/DELETE 禁止）
create table if not exists point_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id),
  delta         bigint not null,                 -- 正=入金 / 負=出金
  reason        text not null,                   -- signup|daily|buy|sell|redeem|refund
  market_id     uuid references markets(id),
  outcome_id    uuid references outcomes(id),
  shares        numeric,                         -- 売買時の株数（符号付き）
  balance_after bigint not null,                 -- 監査用スナップショット
  created_at    timestamptz not null default now(),
  check (reason in ('signup','daily','buy','sell','redeem','refund'))
);
create index if not exists point_ledger_user_idx on point_ledger(user_id, created_at);

-- 解決記録（透明性・全公開）
create table if not exists resolutions (
  market_id          uuid primary key references markets(id),
  winning_outcome_id uuid references outcomes(id),     -- void なら null
  resolution_kind    text not null,                    -- 'manual'|'auto'|'void'
  source_url         text,
  resolved_by        uuid references auth.users(id),
  resolved_at        timestamptz not null default now()
);

-- デイリー付与の冪等管理
create table if not exists daily_grants (
  user_id    uuid not null references auth.users(id),
  grant_date date not null,                            -- JST 基準
  primary key (user_id, grant_date)
);

-- 価格履歴（SPEC-05 §1。チャート用。取引RPCが q 更新後に1点INSERT）
create table if not exists market_price_history (
  id          bigint generated always as identity primary key,
  market_id   uuid not null references markets(id),
  outcome_id  uuid not null references outcomes(id),
  price       numeric not null,                        -- 取引直後の確率 (0..1)
  recorded_at timestamptz not null default now()
);
create index if not exists mph_market_idx on market_price_history(market_id, recorded_at);

-- ============================================================
-- RLS（防御の要）: 全テーブル有効化。
-- SELECT のみポリシーを置く（自分のもの / 公開物）。
-- INSERT/UPDATE/DELETE ポリシーは「作らない」= クライアント直書き全拒否。
-- 書き込みは後続マイグレーションの security definer RPC のみ。
-- ============================================================
alter table categories            enable row level security;
alter table wallets               enable row level security;
alter table markets               enable row level security;
alter table outcomes              enable row level security;
alter table positions             enable row level security;
alter table point_ledger          enable row level security;
alter table resolutions           enable row level security;
alter table daily_grants          enable row level security;
alter table market_price_history  enable row level security;

-- 公開（誰でも読める）
create policy "public categories"   on categories           for select using (true);
create policy "public markets"      on markets              for select using (true);
create policy "public outcomes"     on outcomes             for select using (true);
create policy "public resolutions"  on resolutions          for select using (true);
create policy "public price_hist"   on market_price_history for select using (true);

-- 本人のみ
create policy "own wallet"     on wallets      for select using (user_id = auth.uid());
create policy "own ledger"     on point_ledger for select using (user_id = auth.uid());
create policy "own positions"  on positions    for select using (user_id = auth.uid());
create policy "own daily"      on daily_grants for select using (user_id = auth.uid());


-- ===================== 0002_lmsr_functions.sql =====================
-- ============================================================
-- 0002 LMSR 価格エンジン（SPEC-02 §2）
-- log-sum-exp トリックで exp オーバーフローを防ぐ数値安定版。
-- 単位系: 1株 = POINTS_PER_SHARE(=100) 点。cost_u は 0〜Δ の範囲。
-- ============================================================

-- exp(x) を安全に評価。double の指数アンダーフロー閾値(≈ -745)を下回る入力は 0 とみなす。
-- （log-sum-exp は正側のオーバーフローは防ぐが、負側で Postgres の exp が underflow 例外を出すため）
create or replace function safe_exp(x float8)
returns float8
language sql immutable
as $$ select case when x < -700 then 0.0::float8 else exp(x) end; $$;

-- コスト関数 C(q) = b·ln(Σ exp(q_i/b))  （最大値を引いて安定化）
create or replace function lmsr_cost(q float8[], b float8)
returns float8
language plpgsql immutable
as $$
declare m float8; s float8;
begin
  select max(x / b) into m from unnest(q) as t(x);
  select sum(safe_exp(x / b - m)) into s from unnest(q) as t(x);
  return b * (m + ln(s));   -- s >= 1（最大項=1）なので ln は常に有効
end;
$$;

-- 価格(=確率) p_k = exp(q_k/b) / Σ exp(q_i/b)  ∈ (0,1)
create or replace function lmsr_price(q float8[], b float8, k int)
returns float8
language plpgsql immutable
as $$
declare m float8; s float8;
begin
  select max(x / b) into m from unnest(q) as t(x);
  select sum(safe_exp(x / b - m)) into s from unnest(q) as t(x);
  return safe_exp(q[k] / b - m) / s;
end;
$$;

-- 市場の全アウトカムの現在価格を返す（display_order 順）
-- 取引RPC の戻り値・価格履歴記録で共用する単一の真実。
create or replace function lmsr_market_prices(p_market_id uuid)
returns table(outcome_id uuid, price float8)
language plpgsql stable
as $$
declare v_b float8; v_q float8[]; v_ids uuid[];
begin
  select b_param::float8 into v_b from markets where id = p_market_id;
  select array_agg(o.id order by o.display_order),
         array_agg(o.q::float8 order by o.display_order)
    into v_ids, v_q
    from outcomes o where o.market_id = p_market_id;
  return query
    select v_ids[i], lmsr_price(v_q, v_b, i)
    from generate_subscripts(v_ids, 1) as i;
end;
$$;

-- q 更新後に呼び、その市場の全アウトカムの現在価格を履歴へ1点ずつ記録（SPEC-05 §1）
create or replace function record_market_prices(p_market_id uuid)
returns void
language plpgsql
as $$
begin
  insert into market_price_history(market_id, outcome_id, price)
  select p_market_id, mp.outcome_id, mp.price::numeric
  from lmsr_market_prices(p_market_id) as mp;
end;
$$;


-- ===================== 0003_grant_rpcs.sql =====================
-- ============================================================
-- 0003 ポイント発行RPC（SPEC-02 §6）
-- 無償発行の2経路。これと償還/返金(0005)以外に balance を増やす経路は存在しない。
-- 定数: SIGNUP_GRANT=1000 / DAILY_GRANT=100 / TZ=Asia/Tokyo
-- ============================================================

-- 新規登録時1回（冪等）。wallet 作成 ＋ SIGNUP_GRANT 付与 ＋ ledger 'signup'。
create or replace function grant_signup_bonus()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into wallets(user_id, balance)
    values (v_uid, 1000)
    on conflict (user_id) do nothing;

  -- FOUND は実際に行が挿入されたときのみ true（既存walletなら false）→ 冪等
  if found then
    insert into point_ledger(user_id, delta, reason, balance_after)
      values (v_uid, 1000, 'signup', 1000);
  end if;
end;
$$;

-- デイリー付与（1日1回・全員同額・JST基準）。daily_grants 複合PKで冪等。
create or replace function claim_daily_grant()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date := (now() at time zone 'Asia/Tokyo')::date;
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into daily_grants(user_id, grant_date)
    values (v_uid, v_today)
    on conflict do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update wallets set balance = balance + 100
    where user_id = v_uid
    returning balance into v_balance;

  if v_balance is null then
    -- wallet 未作成（complete_signup 未実行）。daily_grants 挿入ごとロールバック。
    raise exception 'no_wallet';
  end if;

  insert into point_ledger(user_id, delta, reason, balance_after)
    values (v_uid, 100, 'daily', v_balance);

  return jsonb_build_object('ok', true, 'granted', 100, 'balance', v_balance);
end;
$$;

-- PostgREST から呼べるよう実行権限を付与（RLSは definer がバイパス）
grant execute on function grant_signup_bonus()  to authenticated;
grant execute on function claim_daily_grant()   to authenticated;


-- ===================== 0004_trade_rpcs.sql =====================
-- ============================================================
-- 0004 取引RPC（SPEC-02 §3）
-- buy_shares / sell_shares。対象 market を FOR UPDATE 行ロックしてから
-- 価格計算・更新（レース防止）。端数はシステム有利（買い=ceil / 売り=floor）。
-- 単一トランザクション → 例外で全ロールバック。
-- ============================================================

-- outcome k を Δ株 買う。コスト = ceil((C(q+Δe_k) - C(q)) × 100)
create or replace function buy_shares(p_outcome_id uuid, p_shares numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_market      markets%rowtype;
  v_b           float8;
  v_ids         uuid[];
  v_q           float8[];
  v_q2          float8[];
  v_k           int;
  v_cost_u      float8;
  v_cost_points bigint;
  v_balance     bigint;
  v_new_balance bigint;
  v_prices      jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_shares is null or p_shares <= 0 then raise exception 'invalid_shares'; end if;

  -- 対象市場を行ロック
  select m.* into v_market
    from markets m
    join outcomes o on o.market_id = m.id
    where o.id = p_outcome_id
    for update of m;
  if not found then raise exception 'outcome_not_found'; end if;
  if v_market.status <> 'open' or now() >= v_market.close_time then
    raise exception 'market_closed';
  end if;
  v_b := v_market.b_param::float8;

  -- q ベクトル（display_order 順）と対象 index
  select array_agg(o.id order by o.display_order),
         array_agg(o.q::float8 order by o.display_order)
    into v_ids, v_q
    from outcomes o where o.market_id = v_market.id;
  select i into v_k from generate_subscripts(v_ids, 1) as i where v_ids[i] = p_outcome_id;

  -- コスト（買い切り上げ）
  v_q2 := v_q;
  v_q2[v_k] := v_q2[v_k] + p_shares::float8;
  v_cost_u := lmsr_cost(v_q2, v_b) - lmsr_cost(v_q, v_b);
  v_cost_points := ceil(v_cost_u * 100)::bigint;
  if v_cost_points < 1 then raise exception 'trade_too_small'; end if;

  -- 残高チェック（wallet も行ロック）
  select balance into v_balance from wallets where user_id = v_uid for update;
  if not found then raise exception 'no_wallet'; end if;
  if v_balance < v_cost_points then raise exception 'insufficient_balance'; end if;
  v_new_balance := v_balance - v_cost_points;

  -- 適用
  update wallets set balance = v_new_balance where user_id = v_uid;
  insert into positions(user_id, outcome_id, shares, cost_basis)
    values (v_uid, p_outcome_id, p_shares, v_cost_points)
    on conflict (user_id, outcome_id)
    do update set shares     = positions.shares + p_shares,
                  cost_basis = positions.cost_basis + v_cost_points;
  update outcomes set q = q + p_shares where id = p_outcome_id;
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
    values (v_uid, -v_cost_points, 'buy', v_market.id, p_outcome_id, p_shares, v_new_balance);

  -- 価格履歴を記録し、更新後の全価格を返す
  perform record_market_prices(v_market.id);
  select jsonb_agg(jsonb_build_object('outcome_id', mp.outcome_id, 'price', mp.price))
    into v_prices from lmsr_market_prices(v_market.id) as mp;

  return jsonb_build_object(
    'ok', true, 'cost_points', v_cost_points, 'shares', p_shares,
    'new_prices', v_prices, 'balance', v_new_balance);
end;
$$;

-- outcome k を Δ株 売る。受取 = floor((C(q) - C(q-Δe_k)) × 100)
create or replace function sell_shares(p_outcome_id uuid, p_shares numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_market       markets%rowtype;
  v_b            float8;
  v_ids          uuid[];
  v_q            float8[];
  v_q2           float8[];
  v_k            int;
  v_recv_u       float8;
  v_recv_points  bigint;
  v_balance      bigint;
  v_new_balance  bigint;
  v_shares_before numeric;
  v_cost_before  bigint;
  v_cost_reduce  bigint;
  v_prices       jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_shares is null or p_shares <= 0 then raise exception 'invalid_shares'; end if;

  select m.* into v_market
    from markets m
    join outcomes o on o.market_id = m.id
    where o.id = p_outcome_id
    for update of m;
  if not found then raise exception 'outcome_not_found'; end if;
  if v_market.status <> 'open' or now() >= v_market.close_time then
    raise exception 'market_closed';
  end if;
  v_b := v_market.b_param::float8;

  -- 保有チェック
  select shares, cost_basis into v_shares_before, v_cost_before
    from positions where user_id = v_uid and outcome_id = p_outcome_id for update;
  if not found or v_shares_before < p_shares then
    raise exception 'insufficient_shares';
  end if;

  select array_agg(o.id order by o.display_order),
         array_agg(o.q::float8 order by o.display_order)
    into v_ids, v_q
    from outcomes o where o.market_id = v_market.id;
  select i into v_k from generate_subscripts(v_ids, 1) as i where v_ids[i] = p_outcome_id;

  -- 受取（売り切り捨て）
  v_q2 := v_q;
  v_q2[v_k] := v_q2[v_k] - p_shares::float8;
  v_recv_u := lmsr_cost(v_q, v_b) - lmsr_cost(v_q2, v_b);
  v_recv_points := floor(v_recv_u * 100)::bigint;
  if v_recv_points < 1 then raise exception 'trade_too_small'; end if;

  -- cost_basis は按分減算（売却分に対応する取得原価を取り崩す）
  v_cost_reduce := round(v_cost_before * (p_shares / v_shares_before))::bigint;

  select balance into v_balance from wallets where user_id = v_uid for update;
  v_new_balance := v_balance + v_recv_points;

  update wallets set balance = v_new_balance where user_id = v_uid;
  update positions
    set shares     = shares - p_shares,
        cost_basis = cost_basis - v_cost_reduce
    where user_id = v_uid and outcome_id = p_outcome_id;
  update outcomes set q = q - p_shares where id = p_outcome_id;
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
    values (v_uid, v_recv_points, 'sell', v_market.id, p_outcome_id, -p_shares, v_new_balance);

  perform record_market_prices(v_market.id);
  select jsonb_agg(jsonb_build_object('outcome_id', mp.outcome_id, 'price', mp.price))
    into v_prices from lmsr_market_prices(v_market.id) as mp;

  return jsonb_build_object(
    'ok', true, 'recv_points', v_recv_points, 'shares', p_shares,
    'new_prices', v_prices, 'balance', v_new_balance);
end;
$$;

grant execute on function buy_shares(uuid, numeric)  to authenticated;
grant execute on function sell_shares(uuid, numeric) to authenticated;


-- ===================== 0005_resolve_rpcs.sql =====================
-- ============================================================
-- 0005 解決・償還RPC（SPEC-02 §5）
-- resolve_market（勝者一括償還・冪等）/ void_market（cost_basis 返金）。
-- 終端状態（resolved/void）は不可逆。FOR UPDATE で二重解決を防ぐ。
-- 償還は set-based（大量ポジションでも往復1回）。balance_after は更新後値を返す。
-- ============================================================

-- 勝ち outcome を確定し、勝ち株×100pt を一括償還
create or replace function resolve_market(
  p_market_id uuid,
  p_winning_outcome_id uuid,
  p_source_url text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market   markets%rowtype;
  v_count    int;
  v_total    bigint;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found'; end if;
  if v_market.status not in ('open','closed','resolving') then
    raise exception 'already_resolved';
  end if;
  if not exists (
    select 1 from outcomes where id = p_winning_outcome_id and market_id = p_market_id
  ) then
    raise exception 'invalid_outcome';
  end if;

  update markets set status = 'resolved' where id = p_market_id;
  update outcomes set is_winner = (id = p_winning_outcome_id) where market_id = p_market_id;

  -- 集計（戻り値用）
  select count(*), coalesce(sum((shares * 100)::bigint), 0)
    into v_count, v_total
    from positions where outcome_id = p_winning_outcome_id and shares > 0;

  -- 勝者一括償還 ＋ 台帳記録（balance_after は更新後の残高）
  with winners as (
    select user_id, (shares * 100)::bigint as payout
    from positions
    where outcome_id = p_winning_outcome_id and shares > 0
  ),
  upd as (
    update wallets w
      set balance = w.balance + winners.payout
      from winners
      where w.user_id = winners.user_id
      returning w.user_id, w.balance as balance_after, winners.payout as payout
  )
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
  select user_id, payout, 'redeem', p_market_id, p_winning_outcome_id, null, balance_after
  from upd;

  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, p_winning_outcome_id, v_market.resolution_kind, p_source_url, auth.uid());

  return jsonb_build_object('ok', true, 'winners_count', v_count, 'total_paid', v_total);
end;
$$;

-- 中止。各保有者へ cost_basis（買値ベース）を返金
create or replace function void_market(p_market_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_count  int;
  v_total  bigint;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found'; end if;
  if v_market.status not in ('open','closed','resolving') then
    raise exception 'already_resolved';
  end if;

  select count(distinct p.user_id), coalesce(sum(p.cost_basis), 0)
    into v_count, v_total
    from positions p join outcomes o on o.id = p.outcome_id
    where o.market_id = p_market_id and p.cost_basis > 0;

  with refunds as (
    select p.user_id, sum(p.cost_basis)::bigint as amt
    from positions p join outcomes o on o.id = p.outcome_id
    where o.market_id = p_market_id and p.cost_basis > 0
    group by p.user_id
  ),
  upd as (
    update wallets w
      set balance = w.balance + refunds.amt
      from refunds
      where w.user_id = refunds.user_id
      returning w.user_id, w.balance as balance_after, refunds.amt as amt
  )
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
  select user_id, amt, 'refund', p_market_id, null, null, balance_after
  from upd;

  update markets set status = 'void' where id = p_market_id;
  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, null, 'void', p_reason, auth.uid());

  return jsonb_build_object('ok', true, 'refunded_users', v_count, 'total_refunded', v_total);
end;
$$;

-- 解決RPCは通常サーバー側（自動解決ジョブ=service_role / 管理RPC経由）から呼ぶ。
-- 直接の authenticated 実行は許可しない（管理者検証は SPEC-07 の管理RPCで行う）。
revoke execute on function resolve_market(uuid, uuid, text) from authenticated, anon;
revoke execute on function void_market(uuid, text)         from authenticated, anon;


-- ===================== 0006_realtime.sql =====================
-- ============================================================
-- 0006 Realtime（SPEC-02 §8）
-- outcomes の q 変更を market_id フィルタで購読 → フロントで lmsr_price 再計算。
-- 価格履歴も配信してチャート最新点を更新可能にする。
-- ============================================================

-- 変更の old/new を確実に配信するため REPLICA IDENTITY FULL
alter table outcomes              replica identity full;
alter table market_price_history  replica identity full;

-- supabase_realtime publication へ追加（存在しなければ作成）
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table outcomes;
alter publication supabase_realtime add table market_price_history;


-- ===================== 0007_supply_resolution.sql =====================
-- ============================================================
-- 0007 市場供給レイヤー（SPEC-04）＋ 解決オラクル基盤（SPEC-03）
-- カテゴリ別フィード設定 / テンプレ / Polyミラーキャッシュ / 解決監査 / 解決キュー、
-- gap 計算関数、初期qシード関数。生成・解決の本体は Edge Functions（functions/）。
-- ============================================================

-- カテゴリ別フィード設定（SPEC-04 §2。1カテゴリ1行）
create table if not exists category_feed_settings (
  category_id      uuid primary key references categories(id) on delete cascade,
  target_active    int  not null default 10,
  poly_min         int  not null default 0,
  poly_max         int  not null default 10,
  daily_gen_cap    int  not null default 20,
  poly_tag_ids     int[] not null default '{}',
  poly_sort        text not null default 'volume_24hr',
  template_enabled boolean not null default false,
  mode             text not null default 'balanced',
  updated_at       timestamptz not null default now(),
  check (poly_min >= 0 and poly_max >= 0 and poly_min <= poly_max),
  check (target_active >= 0 and daily_gen_cap >= 0),
  check (poly_sort in ('volume_24hr','liquidity','competitive'))
);

-- 自前テンプレート（自動生成の素）
create table if not exists market_templates (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid references categories(id),
  name               text not null,
  question_pattern   text not null,
  params_source      jsonb not null,
  schedule_cron      text not null,
  resolution_binding jsonb not null,
  initial_q_rule     jsonb not null,
  is_active          boolean not null default true
);

-- Polyミラー取得キャッシュ（冪等キー＝poly_market_id）
create table if not exists poly_mirror_cache (
  poly_market_id  text primary key,
  category_id     uuid references categories(id),
  question        text not null,
  poly_price_yes  numeric,
  poly_close_time timestamptz,
  poly_resolution text,
  local_market_id uuid references markets(id),
  fetched_at      timestamptz not null default now()
);

-- 解決監査（SPEC-03 §3。取得生値と判定を残す）
create table if not exists resolution_audit (
  id          bigint generated always as identity primary key,
  market_id   uuid not null references markets(id),
  feed        text not null,
  raw_value   jsonb,
  decided     text,                  -- 'resolved'|'pending'|'error'
  source_url  text,
  created_at  timestamptz not null default now()
);
create index if not exists resolution_audit_market_idx on resolution_audit(market_id);

-- 解決キュー（自動解決失敗＝error を人手へ。SPEC-03 §4 / SPEC-07 §6）
create table if not exists resolution_queue (
  market_id   uuid primary key references markets(id),
  reason      text,
  retry_count int not null default 0,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- RLS（設定・監査は公開SELECT。書き込みは RPC / service_role のみ）
alter table category_feed_settings enable row level security;
alter table market_templates       enable row level security;
alter table poly_mirror_cache       enable row level security;
alter table resolution_audit        enable row level security;
alter table resolution_queue        enable row level security;
create policy "public feed_settings" on category_feed_settings for select using (true);
create policy "public templates"     on market_templates       for select using (true);
create policy "public poly_cache"    on poly_mirror_cache       for select using (true);
create policy "public res_audit"     on resolution_audit        for select using (true);
create policy "public res_queue"     on resolution_queue        for select using (true);

-- ============================================================
-- 初期qシード（SPEC-04 §5.4）
-- 二択で q_NO=0 と置き、q_YES = b·ln(p/(1-p)) とすると p_YES がちょうど p になる。
-- p は (0,1) にクランプ（0/1 は無限大になるため）。
-- ============================================================
create or replace function lmsr_seed_q_binary(p_b float8, p_price float8)
returns float8
language sql immutable
as $$
  select p_b * ln( pp / (1 - pp) )
  from (select least(greatest(p_price, 1e-6), 1 - 1e-6) as pp) t;
$$;

-- ============================================================
-- アクティブ市場カウント（active = status 'open' かつ close_time 未到来）
-- ============================================================
create or replace function active_market_count(p_category_id uuid, p_source text)
returns int
language sql stable
as $$
  select count(*)::int
  from markets
  where category_id = p_category_id
    and source = p_source
    and status = 'open'
    and close_time > now();
$$;

-- 当日(JST)に自動生成した市場数（admin手動はカウントしない）
create or replace function auto_generated_today(p_category_id uuid)
returns int
language sql stable
as $$
  select count(*)::int
  from markets
  where category_id = p_category_id
    and source in ('template','mirror')
    and (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date;
$$;

-- ============================================================
-- gap 計算（SPEC-04 §3）: このカテゴリで新規生成すべき Poly 数
-- ============================================================
create or replace function compute_poly_to_generate(p_category_id uuid)
returns int
language plpgsql stable
as $$
declare
  s               category_feed_settings%rowtype;
  v_admin         int;
  v_template      int;
  v_poly          int;
  v_desired       int;
  v_to_generate   int;
  v_remaining_cap int;
begin
  select * into s from category_feed_settings where category_id = p_category_id;
  if not found then return 0; end if;

  v_admin    := active_market_count(p_category_id, 'admin');
  v_template := active_market_count(p_category_id, 'template');
  v_poly     := active_market_count(p_category_id, 'mirror');

  -- admin と template で埋まらない残りを Poly が埋める（poly_min..poly_max でクランプ）
  v_desired := least(greatest(s.target_active - v_admin - v_template, s.poly_min), s.poly_max);

  -- 既に走っている分は消さない。足りない分だけ新規生成
  v_to_generate := greatest(0, v_desired - v_poly);

  -- 1日の生成上限を尊重（admin手動投稿は数えない）
  v_remaining_cap := greatest(0, s.daily_gen_cap - auto_generated_today(p_category_id));
  v_to_generate := least(v_to_generate, v_remaining_cap);

  return v_to_generate;
end;
$$;


-- ===================== 0008_market_creation.sql =====================
-- ============================================================
-- 0008 市場生成RPC（供給ジョブ・管理コンソール共用）
-- create_market_internal: market + outcomes(seeded q) + 初期価格履歴点 を原子的に作る。
-- 認証チェックはしない（service_role の供給ジョブ / 管理RPC ラッパーから呼ぶ前提）。
-- 初期 q は呼び出し側が lmsr_seed_q_binary 等で算出して渡す（SPEC-04 §5.4）。
-- ============================================================
create or replace function create_market_internal(
  p_category_id        uuid,
  p_question           text,
  p_description        text,
  p_image_url          text,
  p_market_kind        text,
  p_b                  numeric,
  p_source             text,
  p_resolution_kind    text,
  p_resolution_binding jsonb,
  p_external_ref       text,
  p_close_time         timestamptz,
  p_resolve_time       timestamptz,
  p_outcomes           jsonb        -- [{label, display_order, q?}] q 既定0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market_id uuid;
  v_elem      jsonb;
  v_count     int;
begin
  if jsonb_typeof(p_outcomes) <> 'array' then raise exception 'outcomes_must_be_array'; end if;
  select count(*) into v_count from jsonb_array_elements(p_outcomes);
  if v_count < 2 then raise exception 'need_at_least_two_outcomes'; end if;

  insert into markets(category_id, question, description, image_url, market_kind, b_param,
                      source, resolution_kind, resolution_binding, external_ref,
                      status, close_time, resolve_time, created_by)
    values (p_category_id, p_question, p_description, p_image_url, p_market_kind, p_b,
            p_source, p_resolution_kind, p_resolution_binding, p_external_ref,
            'open', p_close_time, p_resolve_time, auth.uid())
    returning id into v_market_id;

  for v_elem in select * from jsonb_array_elements(p_outcomes) loop
    insert into outcomes(market_id, label, display_order, q)
      values (v_market_id,
              v_elem->>'label',
              (v_elem->>'display_order')::int,
              coalesce((v_elem->>'q')::numeric, 0));
  end loop;

  -- 初期価格点（チャートの起点）
  perform record_market_prices(v_market_id);

  return v_market_id;
end;
$$;

revoke execute on function create_market_internal(uuid,text,text,text,text,numeric,text,text,jsonb,text,timestamptz,timestamptz,jsonb)
  from authenticated, anon;


-- ===================== 0010_profiles.sql =====================
-- ============================================================
-- 0010 プロフィール（SPEC-01 §2）
-- 表示名・アバター・本人性メタ＋不正フラグ。リーダーボード(0011)・管理(0012)が参照。
-- 認証(LINEログイン)は後回しのため、onboarding RPC は Phase 1 で接続する。
-- ============================================================
create table if not exists profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text not null,
  avatar_id        text,
  contact_verified boolean not null default false,
  signup_completed boolean not null default false,
  is_flagged       boolean not null default false,   -- 不正フラグ→ランキング除外(SPEC-06/08)
  created_at       timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "public profiles" on profiles for select using (true);
-- 書き込みは onboarding / 管理RPC（security definer）経由のみ。直書きポリシーは作らない。


-- ===================== 0011_leaderboard.sql =====================
-- ============================================================
-- 0011 リーダーボード・ゲーミフィケーション（SPEC-06）
-- 賞品ゼロ。ランキング・称号・実績は換金不可ポイント実績からの表示指標のみ。
-- 集計は純SQL（refresh_user_stats）。pg_cron が10分ごとに呼ぶ（リモート）。
-- ============================================================

-- ユーザー集計（バッチ更新・表示高速化）
create table if not exists user_stats (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  net_worth      bigint not null default 0,
  realized_pnl   bigint not null default 0,
  resolved_count int not null default 0,
  win_count      int not null default 0,
  current_streak int not null default 0,
  best_streak    int not null default 0,
  trades_count   int not null default 0,
  updated_at     timestamptz not null default now()
);

-- シーズン
create table if not exists seasons (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  is_active boolean not null default false
);

-- シーズン別スコア
create table if not exists season_scores (
  season_id uuid references seasons(id),
  user_id   uuid references auth.users(id) on delete cascade,
  score     bigint not null default 0,
  accuracy  numeric,
  primary key (season_id, user_id)
);

-- 称号・バッジ定義と付与
create table if not exists badges (
  id          text primary key,
  name        text not null,
  description text,
  icon        text,
  criteria    jsonb not null
);
create table if not exists user_badges (
  user_id   uuid references auth.users(id) on delete cascade,
  badge_id  text references badges(id),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- RLS: すべて公開SELECT（ランキング表示）。書き込みはバッチ関数(security definer)のみ。
alter table user_stats     enable row level security;
alter table seasons        enable row level security;
alter table season_scores  enable row level security;
alter table badges         enable row level security;
alter table user_badges    enable row level security;
create policy "public user_stats"    on user_stats    for select using (true);
create policy "public seasons"       on seasons       for select using (true);
create policy "public season_scores" on season_scores for select using (true);
create policy "public badges"        on badges        for select using (true);
create policy "public user_badges"   on user_badges   for select using (true);

-- バッジ定義シード（criteria は最低試行数を必ず含め、少回数の運を除外）
insert into badges(id, name, description, criteria) values
  ('first_win',   '初的中',       '初めて的中した',                 '{"type":"win_count","min":1}'),
  ('streak_5',    '5連勝',         '5連続で的中',                    '{"type":"best_streak","min":5}'),
  ('streak_10',   '10連勝',        '10連続で的中',                   '{"type":"best_streak","min":10}'),
  ('sharpshooter','シャープシューター','的中率60%以上（10件以上）',  '{"type":"accuracy","min":0.6,"min_resolved":10}')
on conflict (id) do nothing;

-- 開いている全市場の現在価格（outcome単位）
create or replace function all_open_prices()
returns table(outcome_id uuid, price float8)
language sql stable
as $$
  select mp.outcome_id, mp.price
  from markets m, lateral lmsr_market_prices(m.id) mp
  where m.status = 'open';
$$;

-- ============================================================
-- 集計バッチ（SPEC-06 §4）。全ユーザーの user_stats を再計算し、バッジを付与。
-- ============================================================
create or replace function refresh_user_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_streak int;
  v_best   int;
  v_cur    int;
  srec record;   -- 連勝ループ用（table alias 'p' と衝突させない）
begin
  -- 1) net_worth / realized_pnl / counts / trades を set-based で更新（全walletユーザー対象）
  insert into user_stats(user_id, net_worth, realized_pnl, resolved_count, win_count, trades_count, updated_at)
  select
    w.user_id,
    w.balance + coalesce(hv.val, 0)                              as net_worth,
    coalesce(rp.redeemed, 0) - coalesce(rp.cost_resolved, 0)     as realized_pnl,
    coalesce(pa.resolved_count, 0)                               as resolved_count,
    coalesce(pa.win_count, 0)                                    as win_count,
    coalesce(tc.trades, 0)                                       as trades_count,
    now()
  from wallets w
  left join (
    -- 開いている保有の評価額
    select p.user_id, floor(sum(p.shares * op.price * 100))::bigint as val
    from positions p
    join all_open_prices() op on op.outcome_id = p.outcome_id
    where p.shares > 0
    group by p.user_id
  ) hv on hv.user_id = w.user_id
  left join (
    -- 確定参加と的中（勝ちoutcomeを保有していたか）
    select user_id,
           count(*)                          as resolved_count,
           count(*) filter (where won)       as win_count
    from (
      select p.user_id, o.market_id, bool_or(coalesce(o.is_winner, false)) as won
      from positions p
      join outcomes o on o.id = p.outcome_id
      join markets  m on m.id = o.market_id and m.status = 'resolved'
      where p.shares > 0
      group by p.user_id, o.market_id
    ) per_market
    group by user_id
  ) pa on pa.user_id = w.user_id
  left join (
    -- 実現損益 = 償還+返金 − 確定/中止市場に投じた取得原価
    select uid as user_id, sum(redeemed) as redeemed, sum(cost_resolved) as cost_resolved
    from (
      select pl.user_id as uid,
             sum(pl.delta) filter (where pl.reason in ('redeem','refund')) as redeemed,
             0::bigint as cost_resolved
      from point_ledger pl group by pl.user_id
      union all
      select p.user_id as uid, 0::bigint as redeemed,
             sum(p.cost_basis) as cost_resolved
      from positions p
      join outcomes o on o.id = p.outcome_id
      join markets  m on m.id = o.market_id and m.status in ('resolved','void')
      group by p.user_id
    ) z group by uid
  ) rp on rp.user_id = w.user_id
  left join (
    select user_id, count(*) as trades
    from point_ledger where reason in ('buy','sell') group by user_id
  ) tc on tc.user_id = w.user_id
  on conflict (user_id) do update set
    net_worth      = excluded.net_worth,
    realized_pnl   = excluded.realized_pnl,
    resolved_count = excluded.resolved_count,
    win_count      = excluded.win_count,
    trades_count   = excluded.trades_count,
    updated_at     = now();

  -- 2) 連勝（current/best）はユーザーごとに時系列で算出
  for r in select distinct user_id from user_stats loop
    v_cur := 0; v_best := 0; v_streak := 0;
    for srec in
      select bool_or(coalesce(o.is_winner, false)) as won, max(res.resolved_at) as ra
      from positions ps
      join outcomes o on o.id = ps.outcome_id
      join markets  m on m.id = o.market_id and m.status = 'resolved'
      join resolutions res on res.market_id = m.id
      where ps.user_id = r.user_id and ps.shares > 0
      group by o.market_id
      order by ra
    loop
      if srec.won then
        v_streak := v_streak + 1;
        if v_streak > v_best then v_best := v_streak; end if;
      else
        v_streak := 0;
      end if;
    end loop;
    v_cur := v_streak;  -- 末尾の連勝
    update user_stats set current_streak = v_cur, best_streak = v_best where user_id = r.user_id;
  end loop;

  -- 3) バッジ付与（criteria 充足・未付与のみ）
  insert into user_badges(user_id, badge_id)
  select s.user_id, 'first_win' from user_stats s where s.win_count >= 1
  on conflict do nothing;
  insert into user_badges(user_id, badge_id)
  select s.user_id, 'streak_5' from user_stats s where s.best_streak >= 5
  on conflict do nothing;
  insert into user_badges(user_id, badge_id)
  select s.user_id, 'streak_10' from user_stats s where s.best_streak >= 10
  on conflict do nothing;
  insert into user_badges(user_id, badge_id)
  select s.user_id, 'sharpshooter' from user_stats s
  where s.resolved_count >= 10 and s.win_count::numeric / s.resolved_count >= 0.6
  on conflict do nothing;

  -- 4) アクティブシーズンのスコア（実現損益）を更新
  insert into season_scores(season_id, user_id, score, accuracy)
  select se.id, s.user_id, s.realized_pnl,
         case when s.resolved_count > 0 then s.win_count::numeric / s.resolved_count else null end
  from seasons se cross join user_stats s
  where se.is_active
  on conflict (season_id, user_id) do update set
    score = excluded.score, accuracy = excluded.accuracy;
end;
$$;

-- ランキング用インデックス
create index if not exists user_stats_networth_idx on user_stats(net_worth desc);

-- cron（リモート専用。pg_cron が無いローカルでは run_local.sh では実行しない）
-- 0009 と同様に Supabase で有効化。10分ごとに集計。
-- select cron.schedule('refresh-stats','*/10 * * * *', $$ select refresh_user_stats(); $$);


-- ===================== 0012_admin.sql =====================
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


-- ===================== 0013_monetization_antifraud.sql =====================
-- ============================================================
-- 0013 マネタイズ・不正対策（SPEC-08）
-- 収益化はBETの外側。entitlements は wallets/point_ledger と一切リンクしない。
-- 決済結果でポイントを増やすコードは存在してはならない（不在を 0006 テストで担保）。
-- ============================================================

-- 課金で得る「BETに使えない財」。ポイント残高とは完全分離。
create table if not exists entitlements (
  user_id    uuid not null references auth.users(id) on delete cascade,
  sku        text not null,          -- 'theme_dark'|'avatar_x'|'pro_analytics'|'ad_free' ...
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, sku)
);
-- ※ entitlements には market_id/outcome/points 等のBET関連列を持たせない（隔離の明示）

-- 不正検知シグナル（SPEC-08 §3.2）
create table if not exists account_signals (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  signup_ip          inet,
  last_ip            inet,
  device_fingerprint text,
  created_at         timestamptz not null default now()
);

create table if not exists fraud_flags (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  rule       text not null,          -- 'shared_ip_cluster'|'correlated_betting'|'disposable_email'
  score      numeric,
  detail     jsonb,
  status     text not null default 'open',   -- 'open'|'confirmed'|'dismissed'
  created_at timestamptz not null default now()
);

alter table entitlements    enable row level security;
alter table account_signals enable row level security;
alter table fraud_flags     enable row level security;
-- 自分の entitlements は読める（コスメ反映用）。signals/flags は管理のみ。
create policy "own entitlements" on entitlements    for select using (user_id = auth.uid());
create policy "admin signals"    on account_signals for select using (is_admin());
create policy "admin fraud"      on fraud_flags     for select using (is_admin());

-- 権利付与（決済Webhook/管理が service_role で呼ぶ）。entitlements のみ更新・wallets に触れない。
create or replace function grant_entitlement(p_user_id uuid, p_sku text, p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  insert into entitlements(user_id, sku, expires_at)
    values (p_user_id, p_sku, p_expires_at)
    on conflict (user_id, sku) do update set granted_at = now(), expires_at = excluded.expires_at;
  -- 重要: この関数はポイント残高・台帳に一切触れない（賭博非該当の生命線。0006 テストで強制）
end;
$$;

-- 不正検知バッチ（SPEC-08 §3.2）。同一IPに多数アカウント→fraud_flags 起票（自動BANはしない）。
create or replace function detect_fraud_signals(p_ip_threshold int default 3)
returns int language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  with clusters as (
    select signup_ip, array_agg(user_id) as users, count(*) as n
    from account_signals
    where signup_ip is not null
    group by signup_ip
    having count(*) >= p_ip_threshold
  )
  insert into fraud_flags(user_id, rule, score, detail)
  select u, 'shared_ip_cluster', c.n, jsonb_build_object('ip', host(c.signup_ip), 'cluster_size', c.n)
  from clusters c, unnest(c.users) as u
  where not exists (
    select 1 from fraud_flags f
    where f.user_id = u and f.rule = 'shared_ip_cluster' and f.status = 'open'
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function grant_entitlement(uuid,text,timestamptz) from anon, authenticated;
revoke execute on function detect_fraud_signals(int)               from anon, authenticated;


-- ===================== 0014_admin_dashboard.sql =====================
-- ============================================================
-- 0014 管理ダッシュボード（SPEC-07 §2/§4/§5/§8）
-- KPI・カテゴリ別フィード現況（gap可視化）・テンプレCRUD・カテゴリCRUD。
-- すべて is_admin() を内部検証。書き込みは admin_audit に記録。
-- ============================================================

-- ── ダッシュボード KPI（§2） ─────────────────────────────────
create or replace function admin_kpis()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v jsonb;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select jsonb_build_object(
    'active_markets', (select count(*) from markets where status='open' and close_time > now()),
    'trades_today',   (select count(*) from point_ledger
                        where reason in ('buy','sell')
                          and (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date),
    'users_count',    (select count(*) from wallets),
    'pending_manual', (select count(*) from markets
                        where resolution_kind='manual' and status in ('open','closed') and resolve_time <= now()),
    'queue_count',    (select count(*) from resolution_queue),
    'resolved_total', (select count(*) from markets where status='resolved')
  ) into v;
  return v;
end;
$$;

-- ── カテゴリ別フィード現況（§5。admin/template/mirror 内訳と gap） ──
create or replace function admin_feed_overview()
returns table(
  category_id uuid, slug text, name text, is_active boolean,
  target_active int, poly_min int, poly_max int, daily_gen_cap int,
  template_enabled boolean, mode text,
  admin_active int, template_active int, mirror_active int, to_generate int
) language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select c.id, c.slug, c.name, c.is_active,
           coalesce(s.target_active,0), coalesce(s.poly_min,0), coalesce(s.poly_max,0), coalesce(s.daily_gen_cap,0),
           coalesce(s.template_enabled,false), coalesce(s.mode,'—'),
           active_market_count(c.id,'admin'),
           active_market_count(c.id,'template'),
           active_market_count(c.id,'mirror'),
           compute_poly_to_generate(c.id)
    from categories c
    left join category_feed_settings s on s.category_id = c.id
    order by c.display_order;
end;
$$;

-- ── カテゴリ CRUD（§8） ──────────────────────────────────────
create or replace function upsert_category(
  p_id uuid, p_slug text, p_name text, p_display_order int, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_id is null then
    insert into categories(slug, name, display_order, is_active)
      values (p_slug, p_name, p_display_order, p_is_active) returning id into v_id;
  else
    update categories set slug=p_slug, name=p_name, display_order=p_display_order, is_active=p_is_active
      where id=p_id returning id into v_id;
  end if;
  perform _audit('category', jsonb_build_object('category_id', v_id), jsonb_build_object('slug', p_slug));
  return v_id;
end;
$$;

-- ── テンプレート CRUD（§4） ──────────────────────────────────
create or replace function upsert_template(
  p_id uuid, p_category_id uuid, p_name text, p_question_pattern text,
  p_params_source jsonb, p_schedule_cron text, p_resolution_binding jsonb,
  p_initial_q_rule jsonb, p_is_active boolean
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_id is null then
    insert into market_templates(category_id, name, question_pattern, params_source, schedule_cron,
                                 resolution_binding, initial_q_rule, is_active)
      values (p_category_id, p_name, p_question_pattern, p_params_source, p_schedule_cron,
              p_resolution_binding, p_initial_q_rule, p_is_active)
      returning id into v_id;
  else
    update market_templates set
      category_id=p_category_id, name=p_name, question_pattern=p_question_pattern,
      params_source=p_params_source, schedule_cron=p_schedule_cron,
      resolution_binding=p_resolution_binding, initial_q_rule=p_initial_q_rule, is_active=p_is_active
      where id=p_id returning id into v_id;
  end if;
  perform _audit('template', jsonb_build_object('template_id', v_id), jsonb_build_object('name', p_name));
  return v_id;
end;
$$;

create or replace function delete_template(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  delete from market_templates where id = p_id;
  perform _audit('template_delete', jsonb_build_object('template_id', p_id), null);
end;
$$;

grant execute on function admin_kpis()                                          to authenticated;
grant execute on function admin_feed_overview()                                 to authenticated;
grant execute on function upsert_category(uuid,text,text,int,boolean)           to authenticated;
grant execute on function upsert_template(uuid,uuid,text,text,jsonb,text,jsonb,jsonb,boolean) to authenticated;
grant execute on function delete_template(uuid)                                 to authenticated;


-- ===================== 0015_market_creation_fix.sql =====================
-- ============================================================
-- 0015 create_market_internal 強化（display_order の自動補完）
-- 呼び出し側の outcomes 要素に display_order が無くても、配列位置(ordinality-1)で補う。
-- （手入力/コピペで display_order が欠落しても市場作成が失敗しないように）
-- ============================================================
create or replace function create_market_internal(
  p_category_id uuid, p_question text, p_description text, p_image_url text,
  p_market_kind text, p_b numeric, p_source text, p_resolution_kind text,
  p_resolution_binding jsonb, p_external_ref text,
  p_close_time timestamptz, p_resolve_time timestamptz, p_outcomes jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_market_id uuid; v_elem jsonb; v_ord int; v_count int;
begin
  if jsonb_typeof(p_outcomes) <> 'array' then raise exception 'outcomes_must_be_array'; end if;
  select count(*) into v_count from jsonb_array_elements(p_outcomes);
  if v_count < 2 then raise exception 'need_at_least_two_outcomes'; end if;

  insert into markets(category_id, question, description, image_url, market_kind, b_param,
                      source, resolution_kind, resolution_binding, external_ref,
                      status, close_time, resolve_time, created_by)
    values (p_category_id, p_question, p_description, p_image_url, p_market_kind, p_b,
            p_source, p_resolution_kind, p_resolution_binding, p_external_ref,
            'open', p_close_time, p_resolve_time, auth.uid())
    returning id into v_market_id;

  for v_elem, v_ord in select value, ordinality from jsonb_array_elements(p_outcomes) with ordinality loop
    insert into outcomes(market_id, label, display_order, q)
      values (v_market_id,
              v_elem->>'label',
              coalesce((v_elem->>'display_order')::int, (v_ord - 1)::int),
              coalesce((v_elem->>'q')::numeric, 0));
  end loop;

  perform record_market_prices(v_market_id);
  return v_market_id;
end;
$$;


-- ===================== 0016_line_auth.sql =====================
-- ============================================================
-- 0016 LINEログイン連携（SPEC-01 のLINE版）
-- profiles に line_user_id（1 LINE = 1ウォレットのdedup）を追加し、
-- オンボーディングRPC complete_line_signup で プロフィール確定＋初期付与。
-- ============================================================
alter table profiles add column if not exists line_user_id text unique;

-- LINE認証後（Supabaseセッション確立済み）に呼ぶ。プロフィール upsert ＋ 初期付与（冪等）。
create or replace function complete_line_signup(p_display_name text, p_line_user_id text, p_avatar text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  insert into profiles(user_id, display_name, avatar_id, line_user_id, contact_verified, signup_completed)
    values (v_uid, coalesce(nullif(p_display_name,''),'プレイヤー'), p_avatar, p_line_user_id, true, true)
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      avatar_id    = excluded.avatar_id,
      line_user_id = excluded.line_user_id,
      contact_verified = true,
      signup_completed = true;

  perform grant_signup_bonus();  -- wallet作成＋SIGNUP_GRANT（冪等：既存walletなら無処理）

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function complete_line_signup(text, text, text) to authenticated;

-- ===================== 0017_detail_tabs.sql =====================
-- ============================================================
-- 0017 市場詳細タブ（取引履歴 / 保有者 / コメント）。注文板はフロントでLMSRから合成。
-- orders: 取引ログ（公開・point_ledger からトリガで記録）。
-- comments / comment_likes: コメント＋いいね。
-- 集計RPC: market_holders / market_comments、操作RPC: post_comment / toggle_comment_like。
-- ============================================================

-- 取引ログ（公開SELECT。Activity/板の素データ）
create table if not exists orders (
  id         bigint generated always as identity primary key,
  market_id  uuid not null references markets(id),
  outcome_id uuid not null references outcomes(id),
  user_id    uuid not null references auth.users(id),
  side       text not null,            -- 'buy' | 'sell'
  size       numeric not null,         -- 株数（正）
  price      numeric,                  -- 約定時の確率(0..1)
  created_at timestamptz not null default now()
);
create index if not exists orders_market_idx on orders(market_id, created_at desc);
alter table orders enable row level security;
create policy "public orders" on orders for select using (true);

-- point_ledger の buy/sell から orders を記録（約定後価格つき）
create or replace function _record_order()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_price numeric;
begin
  if NEW.reason in ('buy','sell') and NEW.outcome_id is not null then
    select price into v_price from lmsr_market_prices(NEW.market_id) where outcome_id = NEW.outcome_id;
    insert into orders(market_id, outcome_id, user_id, side, size, price)
      values (NEW.market_id, NEW.outcome_id, NEW.user_id, NEW.reason, abs(coalesce(NEW.shares,0)), v_price);
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_record_order on point_ledger;
create trigger trg_record_order after insert on point_ledger
  for each row execute function _record_order();

-- コメント
create table if not exists comments (
  id         bigint generated always as identity primary key,
  market_id  uuid not null references markets(id),
  user_id    uuid not null references auth.users(id),
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_market_idx on comments(market_id, created_at desc);
create table if not exists comment_likes (
  comment_id bigint references comments(id) on delete cascade,
  user_id    uuid references auth.users(id),
  primary key (comment_id, user_id)
);
alter table comments      enable row level security;
alter table comment_likes enable row level security;
create policy "public comments"      on comments      for select using (true);
create policy "public comment_likes" on comment_likes for select using (true);

-- 保有者（プライバシー: 残高pt絶対額ではなく市場ごとの保有株を上位表示。Polymarket同様）
create or replace function market_holders(p_market_id uuid)
returns table(outcome_id uuid, display_name text, shares numeric)
language sql stable security definer set search_path = public
as $$
  select pos.outcome_id, coalesce(pr.display_name, '匿名'), pos.shares
  from positions pos
  join outcomes o on o.id = pos.outcome_id and o.market_id = p_market_id
  left join profiles pr on pr.user_id = pos.user_id
  where pos.shares > 0
  order by pos.shares desc
  limit 40;
$$;

-- コメント一覧（表示名・いいね数・自分がいいね済みか）
create or replace function market_comments(p_market_id uuid)
returns table(id bigint, body text, created_at timestamptz, display_name text, avatar text, like_count int, liked boolean)
language sql stable security definer set search_path = public
as $$
  select c.id, c.body, c.created_at,
         coalesce(pr.display_name, '匿名'), pr.avatar_id,
         (select count(*)::int from comment_likes l where l.comment_id = c.id),
         exists(select 1 from comment_likes l where l.comment_id = c.id and l.user_id = auth.uid())
  from comments c
  left join profiles pr on pr.user_id = c.user_id
  where c.market_id = p_market_id
  order by c.created_at desc
  limit 100;
$$;

-- 取引履歴（Activity）。表示名・アウトカム名つき
create or replace function market_activity(p_market_id uuid)
returns table(side text, size numeric, price numeric, created_at timestamptz, display_name text, outcome_label text)
language sql stable security definer set search_path = public
as $$
  select o.side, o.size, o.price, o.created_at,
         coalesce(pr.display_name, '匿名'), oc.label
  from orders o
  join outcomes oc on oc.id = o.outcome_id
  left join profiles pr on pr.user_id = o.user_id
  where o.market_id = p_market_id
  order by o.created_at desc
  limit 50;
$$;

create or replace function post_comment(p_market_id uuid, p_body text)
returns bigint language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(trim(coalesce(p_body,''))) = 0 then raise exception 'empty'; end if;
  insert into comments(market_id, user_id, body)
    values (p_market_id, v_uid, left(trim(p_body), 500)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function toggle_comment_like(p_comment_id bigint)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_liked boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if exists(select 1 from comment_likes where comment_id = p_comment_id and user_id = v_uid) then
    delete from comment_likes where comment_id = p_comment_id and user_id = v_uid;
    v_liked := false;
  else
    insert into comment_likes(comment_id, user_id) values (p_comment_id, v_uid);
    v_liked := true;
  end if;
  return v_liked;
end;
$$;

grant execute on function market_holders(uuid)        to anon, authenticated;
grant execute on function market_activity(uuid)       to anon, authenticated;
grant execute on function market_comments(uuid)       to anon, authenticated;
grant execute on function post_comment(uuid, text)    to authenticated;
grant execute on function toggle_comment_like(bigint) to authenticated;

-- ===================== 0018_admin_users.sql =====================
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

-- ===================== 0019_admin_ops.sql =====================
-- ============================================================
-- 0019 管理運用 P0: 経済モニタ / 市場マネージャ / プラットフォーム設定 / 手動ジョブ
-- コールドスタートの調整（b・付与額）を可能にし、ポイント供給を監視できるようにする。
-- ============================================================

-- プラットフォーム設定（数値パラメータ）
create table if not exists platform_settings (
  key        text primary key,
  value      numeric not null,
  updated_at timestamptz not null default now()
);
insert into platform_settings(key, value) values
  ('signup_grant', 1000), ('daily_grant', 100), ('b_default', 200)
on conflict (key) do nothing;
alter table platform_settings enable row level security;
create policy "public settings" on platform_settings for select using (true);

-- 付与RPCを設定値から読むように変更（既定値フォールバック）
create or replace function grant_signup_bonus()
returns void language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_grant bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_grant := coalesce((select value from platform_settings where key = 'signup_grant'), 1000)::bigint;
  insert into wallets(user_id, balance) values (v_uid, v_grant) on conflict (user_id) do nothing;
  if found then
    insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, v_grant, 'signup', v_grant);
  end if;
end;
$$;

create or replace function claim_daily_grant()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Tokyo')::date; v_balance bigint; v_grant bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into daily_grants(user_id, grant_date) values (v_uid, v_today) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_claimed'); end if;
  v_grant := coalesce((select value from platform_settings where key = 'daily_grant'), 100)::bigint;
  update wallets set balance = balance + v_grant where user_id = v_uid returning balance into v_balance;
  if v_balance is null then raise exception 'no_wallet'; end if;
  insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, v_grant, 'daily', v_balance);
  return jsonb_build_object('ok', true, 'granted', v_grant, 'balance', v_balance);
end;
$$;

-- 設定の取得/更新（管理）
create or replace function admin_get_settings()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from platform_settings);
end;
$$;
create or replace function admin_set_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_key not in ('signup_grant','daily_grant','b_default') then raise exception 'unknown_key'; end if;
  if p_value < 0 then raise exception 'negative'; end if;
  insert into platform_settings(key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform _audit('setting', jsonb_build_object('key', p_key), jsonb_build_object('value', p_value));
end;
$$;

-- ── 経済モニタ ───────────────────────────────────────────────
create or replace function admin_economy()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_wallet bigint; v_ledger bigint;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select coalesce(sum(balance),0) into v_wallet from wallets;
  select coalesce(sum(delta),0)   into v_ledger from point_ledger;
  return jsonb_build_object(
    'total_supply', v_wallet,
    'ledger_sum',   v_ledger,
    'audit_ok',     v_wallet = v_ledger,
    'by_reason', (select coalesce(jsonb_object_agg(reason, s), '{}'::jsonb)
                  from (select reason, sum(delta) s from point_ledger group by reason) t),
    'trading_subsidy', (select coalesce(sum(delta),0) from point_ledger where reason in ('buy','sell','redeem','refund')),
    'issued_free',     (select coalesce(sum(delta),0) from point_ledger where reason in ('signup','daily','admin_grant','admin_burn')),
    'inflation_today', (select coalesce(sum(delta),0) from point_ledger
                        where (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date),
    'users',            (select count(*) from wallets),
    'markets_open',     (select count(*) from markets where status='open'),
    'markets_resolved', (select count(*) from markets where status='resolved')
  );
end;
$$;

-- ── 市場マネージャ ───────────────────────────────────────────
create or replace function admin_list_markets(p_status text default null)
returns table(id uuid, question text, category text, source text, status text, b_param numeric,
              close_time timestamptz, resolve_time timestamptz, outcome_count int, volume numeric, holders int, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select m.id, m.question, c.name, m.source, m.status, m.b_param, m.close_time, m.resolve_time,
           (select count(*)::int from outcomes o where o.market_id = m.id),
           (select coalesce(sum(ord.size),0) from orders ord where ord.market_id = m.id),
           (select count(distinct pos.user_id)::int from positions pos
              join outcomes o2 on o2.id = pos.outcome_id where o2.market_id = m.id and pos.shares > 0),
           m.created_at
    from markets m
    left join categories c on c.id = m.category_id
    where (p_status is null or m.status = p_status)
    order by m.created_at desc
    limit 300;
end;
$$;

-- 編集（b_param・締切・質問・画像）。b変更は価格に影響するため監査必須。
create or replace function admin_update_market(p_market_id uuid, p_b numeric, p_close_time timestamptz,
                                               p_resolve_time timestamptz, p_question text, p_image_url text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_b is not null and p_b <= 0 then raise exception 'invalid_b'; end if;
  update markets set
    b_param      = coalesce(p_b, b_param),
    close_time   = coalesce(p_close_time, close_time),
    resolve_time = coalesce(p_resolve_time, resolve_time),
    question     = coalesce(nullif(p_question,''), question),
    image_url    = coalesce(p_image_url, image_url)
  where id = p_market_id;
  perform _audit('update_market', jsonb_build_object('market_id', p_market_id),
                 jsonb_build_object('b', p_b, 'close', p_close_time));
end;
$$;

-- 表示/非表示（draft=非表示, open=表示）。終端状態は変更しない。
create or replace function admin_set_market_status(p_market_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('draft','open') then raise exception 'invalid_status'; end if;
  update markets set status = p_status where id = p_market_id and status in ('draft','open','closed');
  perform _audit('set_market_status', jsonb_build_object('market_id', p_market_id), jsonb_build_object('status', p_status));
end;
$$;

-- ── 手動ジョブ: 集計（生成/解決は Edge Function を直接叩く） ──
create or replace function admin_refresh_stats()
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  perform refresh_user_stats();
end;
$$;

grant execute on function admin_get_settings()                     to authenticated;
grant execute on function admin_set_setting(text, numeric)         to authenticated;
grant execute on function admin_economy()                          to authenticated;
grant execute on function admin_list_markets(text)                 to authenticated;
grant execute on function admin_update_market(uuid,numeric,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function admin_set_market_status(uuid, text)      to authenticated;
grant execute on function admin_refresh_stats()                    to authenticated;

-- ===================== 0020_sparklines.sql =====================
-- ============================================================
-- 0020 スパークライン用: 複数市場の直近価格点を一括取得（YESアウトカム＝display_order先頭）。
-- カード一覧で1回のRPC呼び出しで全カード分の価格推移を取得する（軽量）。
-- ============================================================
create or replace function market_sparklines(p_market_ids uuid[])
returns table(market_id uuid, prices numeric[])
language sql stable security definer set search_path = public
as $$
  with yes_outcomes as (
    select distinct on (o.market_id) o.market_id, o.id as outcome_id
    from outcomes o
    where o.market_id = any(p_market_ids)
    order by o.market_id, o.display_order
  ),
  pts as (
    select yo.market_id, mph.price, mph.recorded_at,
           row_number() over (partition by yo.market_id order by mph.recorded_at desc) as rn
    from yes_outcomes yo
    join market_price_history mph on mph.outcome_id = yo.outcome_id
  )
  select market_id, array_agg(price order by recorded_at) as prices
  from pts
  where rn <= 24
  group by market_id;
$$;

grant execute on function market_sparklines(uuid[]) to anon, authenticated;
