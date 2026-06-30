-- 0035_prize_storage.sql
-- 景品画像のアップロード用 Storage バケット（public 読み取り / 管理者のみ書き込み）。
-- 管理者ページ /admin/prizes の画像アップロードで使用する。

-- ── バケット作成（既存なら更新）。public=true で誰でも閲覧URLを取得できる ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prize-images', 'prize-images', true,
  5242880, -- 5MB 上限
  array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── ポリシー（storage.objects は RLS 有効が既定）──
-- 公開読み取り（バケットが public でも、object SELECT ポリシーを明示しておく）
drop policy if exists "prize images public read" on storage.objects;
create policy "prize images public read" on storage.objects
  for select using (bucket_id = 'prize-images');

-- 書き込み・更新・削除は管理者のみ
drop policy if exists "prize images admin insert" on storage.objects;
create policy "prize images admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'prize-images' and is_admin());

drop policy if exists "prize images admin update" on storage.objects;
create policy "prize images admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'prize-images' and is_admin())
  with check (bucket_id = 'prize-images' and is_admin());

drop policy if exists "prize images admin delete" on storage.objects;
create policy "prize images admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'prize-images' and is_admin());
