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
