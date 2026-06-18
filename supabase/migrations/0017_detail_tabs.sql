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
