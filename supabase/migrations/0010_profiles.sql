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
