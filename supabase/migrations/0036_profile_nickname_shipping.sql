-- ============================================================
-- 0036 プロフィール改修：ニックネーム / アイコン / 配送先 / 配送追跡
--
-- ・LINE名（display_name）がそのまま他ユーザーに見えると困るため、本人が
--   自由に変更できる nickname / avatar_url を profiles に追加。表示は常に
--   coalesce(nickname, display_name) で nickname を優先する。
--   ※ display_name は LINEログインの度に上書きされる（0016）が、nickname /
--     avatar_url は complete_line_signup が触らないため保持される。
-- ・配送先住所は個人情報。profiles は public SELECT のため、住所は本人のみ
--   読める別テーブル profile_private に保存する。
-- ・景品交換に配送追跡（運送会社・追跡番号・発送日時）を追加し、ユーザーが
--   マイページで確認できるようにする。
-- ============================================================

-- ── プロフィール公開列：ニックネーム / アイコンURL ──
alter table profiles add column if not exists nickname   text;
alter table profiles add column if not exists avatar_url text;

-- ── 配送先（本人のみ閲覧）──
create table if not exists profile_private (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  shipping   jsonb,
  updated_at timestamptz not null default now()
);
alter table profile_private enable row level security;
drop policy if exists "own profile_private" on profile_private;
create policy "own profile_private" on profile_private for select using (user_id = auth.uid());
-- 書き込みは definer RPC のみ（直書きポリシーは作らない）

-- 本人がニックネーム・アイコンを更新
create or replace function update_my_profile(p_nickname text, p_avatar_url text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_nick text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_nick := nullif(btrim(coalesce(p_nickname,'')),'');
  if v_nick is not null and char_length(v_nick) > 20 then raise exception 'nickname_too_long'; end if;
  update profiles set
    nickname   = v_nick,
    avatar_url = nullif(btrim(coalesce(p_avatar_url,'')),'')
  where user_id = v_uid;
  if not found then raise exception 'profile_not_found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function update_my_profile(text, text) to authenticated;

-- 本人が既定の配送先を保存
create or replace function update_my_shipping(p_shipping jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into profile_private(user_id, shipping, updated_at) values (v_uid, p_shipping, now())
    on conflict (user_id) do update set shipping = excluded.shipping, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function update_my_shipping(jsonb) to authenticated;

-- ============================================================
-- 名前表示RPCを nickname 優先＋アバターURL付きで再定義
-- ============================================================

-- 保有者
drop function if exists market_holders(uuid);
create function market_holders(p_market_id uuid)
returns table(outcome_id uuid, display_name text, avatar_url text, shares numeric)
language sql stable security definer set search_path = public
as $$
  select pos.outcome_id,
         coalesce(nullif(btrim(pr.nickname),''), pr.display_name, '匿名'),
         pr.avatar_url,
         pos.shares
  from positions pos
  join outcomes o on o.id = pos.outcome_id and o.market_id = p_market_id
  left join profiles pr on pr.user_id = pos.user_id
  where pos.shares > 0
  order by pos.shares desc
  limit 40;
$$;
grant execute on function market_holders(uuid) to anon, authenticated;

-- 取引履歴（Activity）
drop function if exists market_activity(uuid);
create function market_activity(p_market_id uuid)
returns table(side text, size numeric, price numeric, created_at timestamptz,
              display_name text, avatar_url text, outcome_label text)
language sql stable security definer set search_path = public
as $$
  select o.side, o.size, o.price, o.created_at,
         coalesce(nullif(btrim(pr.nickname),''), pr.display_name, '匿名'),
         pr.avatar_url, oc.label
  from orders o
  join outcomes oc on oc.id = o.outcome_id
  left join profiles pr on pr.user_id = o.user_id
  where o.market_id = p_market_id
  order by o.created_at desc
  limit 50;
$$;
grant execute on function market_activity(uuid) to anon, authenticated;

-- コメント一覧（nickname優先・アバター・返信・いいね・YES/NO保有・非表示除外）
drop function if exists market_comments(uuid);
create function market_comments(p_market_id uuid)
returns table(id bigint, parent_id bigint, body text, created_at timestamptz,
              display_name text, avatar_url text, like_count int, liked boolean, holding text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.parent_id, c.body, c.created_at,
         coalesce(nullif(btrim(pr.nickname),''), pr.display_name, '匿名'),
         pr.avatar_url,
         (select count(*)::int from comment_likes l where l.comment_id = c.id),
         exists(select 1 from comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()),
         (select oc.label from positions p2
            join outcomes oc on oc.id = p2.outcome_id and oc.market_id = p_market_id
            where p2.user_id = c.user_id and p2.shares > 0
            order by p2.shares desc limit 1)
  from comments c
  left join profiles pr on pr.user_id = c.user_id
  where c.market_id = p_market_id and c.is_hidden = false
  order by c.created_at asc
  limit 200;
$$;
grant execute on function market_comments(uuid) to anon, authenticated;

-- ============================================================
-- 景品交換：配送追跡
-- ============================================================
alter table prize_redemptions add column if not exists tracking_carrier text;
alter table prize_redemptions add column if not exists tracking_number  text;
alter table prize_redemptions add column if not exists shipped_at       timestamptz;

-- 本人の交換申込一覧（配送状況・追跡番号を確認）
create or replace function my_redemptions()
returns table(id uuid, prize_name text, image_url text, cost_points bigint, status text,
              tracking_carrier text, tracking_number text, shipped_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select r.id, pz.name, pz.image_url, r.cost_points, r.status,
         r.tracking_carrier, r.tracking_number, r.shipped_at, r.created_at
  from prize_redemptions r
  join prizes pz on pz.id = r.prize_id
  where r.user_id = auth.uid()
  order by r.created_at desc
  limit 100;
$$;
grant execute on function my_redemptions() to authenticated;

-- 管理：交換申込一覧（nickname優先＋追跡を含めて返す）
drop function if exists admin_list_redemptions(text);
create function admin_list_redemptions(p_status text default null)
returns table(
  id uuid, user_id uuid, display_name text,
  prize_id uuid, prize_name text, cost_points bigint,
  status text, shipping jsonb,
  tracking_carrier text, tracking_number text, shipped_at timestamptz,
  created_at timestamptz
) language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  return query
    select r.id, r.user_id,
           coalesce(nullif(btrim(pr.nickname),''), pr.display_name, '—'),
           r.prize_id, pz.name, r.cost_points,
           r.status, r.shipping,
           r.tracking_carrier, r.tracking_number, r.shipped_at,
           r.created_at
    from prize_redemptions r
    join prizes pz   on pz.id = r.prize_id
    left join profiles pr on pr.user_id = r.user_id
    where (p_status is null or r.status = p_status)
    order by r.created_at desc
    limit 500;
end;
$$;
grant execute on function admin_list_redemptions(text) to authenticated;

-- 管理：発送ステータス更新（発送時は運送会社・追跡番号を記録）
-- 旧2引数版を置換。requested|approved|shipped|cancelled。
-- 未発送→cancelled のときのみ返金＋在庫戻し（0024 と同思想）。
drop function if exists admin_set_redemption_status(uuid, text);
create function admin_set_redemption_status(
  p_id uuid, p_status text,
  p_carrier text default null, p_tracking text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_red prize_redemptions%rowtype; v_bal bigint;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_status not in ('requested','approved','shipped','cancelled') then
    raise exception 'invalid_status';
  end if;

  select * into v_red from prize_redemptions where id = p_id for update;
  if not found then raise exception 'redemption_not_found'; end if;

  -- 未発送からの取消：賞品ptを返金（新たな90日有効期限）＋在庫を1戻す
  if p_status = 'cancelled' and v_red.status in ('requested','approved') then
    insert into prize_wallets(user_id, balance) values (v_red.user_id, 0)
      on conflict (user_id) do nothing;
    update prize_wallets set balance = balance + v_red.cost_points
      where user_id = v_red.user_id
      returning balance into v_bal;
    insert into prize_ledger(user_id, delta, reason, redemption_id, expires_at, balance_after)
      values (v_red.user_id, v_red.cost_points, 'adjust', v_red.id,
              now() + interval '90 days', v_bal);
    update prizes set stock = stock + 1 where id = v_red.prize_id and stock is not null;
  end if;

  if p_status = 'shipped' then
    update prize_redemptions set
      status           = 'shipped',
      tracking_carrier = nullif(btrim(coalesce(p_carrier,'')),''),
      tracking_number  = nullif(btrim(coalesce(p_tracking,'')),''),
      shipped_at       = coalesce(shipped_at, now())
    where id = p_id;
  else
    update prize_redemptions set status = p_status where id = p_id;
  end if;

  perform _audit('redemption_status', jsonb_build_object('redemption_id', p_id),
                 jsonb_build_object('from', v_red.status, 'to', p_status,
                                    'carrier', p_carrier, 'tracking', p_tracking));
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;
grant execute on function admin_set_redemption_status(uuid, text, text, text) to authenticated;

-- ============================================================
-- アバター画像 Storage（public 読み取り / 本人フォルダのみ書き込み）
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars', true, 2097152, -- 2MB
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

-- パスの先頭フォルダが自分の uid のときだけ書き込み可
drop policy if exists "avatars own insert" on storage.objects;
create policy "avatars own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars own delete" on storage.objects;
create policy "avatars own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
