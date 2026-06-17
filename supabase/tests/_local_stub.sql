-- ローカル素の PostgreSQL で Supabase 環境を最小再現するスタブ（テスト専用）。
-- 本番では Supabase が提供するため、このファイルは migrations には含めない。

-- Supabase のロール
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;

-- auth スキーマと users（FK 先）
create schema if not exists auth;
create table if not exists auth.users (
  id          uuid primary key,
  aud         text,
  role        text,
  email       text,
  created_at  timestamptz,
  updated_at  timestamptz
);

-- auth.uid(): request.jwt.claims の sub を uuid で返す（未設定なら null）
create or replace function auth.uid() returns uuid
language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
