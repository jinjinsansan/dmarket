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
