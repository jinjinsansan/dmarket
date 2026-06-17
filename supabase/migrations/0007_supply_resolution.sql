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
