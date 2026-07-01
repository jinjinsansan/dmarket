-- ============================================================
-- 0049 称号ランク（XP/Lv・アバター枠）フェーズA
-- ・profiles.xp / rank_level（単調非減少）＋ xp_events（監査・日次上限）
-- ・add_xp（内部専用）＋ my_rank
-- ・XP発生源を各所に配線：的中(+40)/連続ログイン(+10/日)/いいね獲得(+5・50/日)/
--   シェア(+10/日)/市場承認(+30)/乗っかり(+15)
-- ・market_comments / market_holders に rank_level を追加（アバター枠用）
-- ============================================================

alter table profiles add column if not exists xp int not null default 0;
alter table profiles add column if not exists rank_level smallint not null default 1;

create table if not exists xp_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  amount     int  not null,
  ref_id     text,
  created_at timestamptz not null default now()
);
create index if not exists xp_events_user_idx on xp_events(user_id, kind, created_at);

-- XP → Lv（しきい値）
create or replace function rank_level_for_xp(p_xp int)
returns smallint language sql immutable as $$
  select (case
    when p_xp >= 12000 then 8 when p_xp >= 6000 then 7 when p_xp >= 3000 then 6
    when p_xp >= 1500 then 5 when p_xp >= 700 then 4 when p_xp >= 300 then 3
    when p_xp >= 100 then 2 else 1 end)::smallint;
$$;

-- kindごとの日次上限（0=上限なし）
create or replace function _xp_daily_cap(p_kind text)
returns int language sql immutable as $$
  select case p_kind when 'like' then 50 when 'share' then 30 when 'login' then 10 else 0 end;
$$;

-- XP付与（内部専用・日次上限・rank_level 再計算＝単調非減少）
create or replace function add_xp(p_user uuid, p_kind text, p_amount int, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap int; v_sum int; v_grant int; v_xp int; v_old smallint; v_new smallint;
begin
  if p_user is null or p_amount is null or p_amount <= 0 then return jsonb_build_object('ok', false); end if;
  if not exists(select 1 from profiles where user_id = p_user) then return jsonb_build_object('ok', false); end if;
  v_cap := _xp_daily_cap(p_kind);
  v_grant := p_amount;
  if v_cap > 0 then
    select coalesce(sum(amount), 0) into v_sum from xp_events
      where user_id = p_user and kind = p_kind
        and created_at >= (date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo');
    v_grant := least(p_amount, greatest(0, v_cap - v_sum));
  end if;
  if v_grant <= 0 then return jsonb_build_object('ok', false, 'reason', 'capped'); end if;
  insert into xp_events(user_id, kind, amount, ref_id) values (p_user, p_kind, v_grant, p_ref);
  update profiles set xp = xp + v_grant where user_id = p_user returning xp, rank_level into v_xp, v_old;
  v_new := greatest(v_old, rank_level_for_xp(v_xp));
  if v_new <> v_old then update profiles set rank_level = v_new where user_id = p_user; end if;
  return jsonb_build_object('ok', true, 'xp', v_xp, 'rank_level', v_new, 'leveled_up', v_new > v_old, 'granted', v_grant);
end; $$;
revoke execute on function add_xp(uuid, text, int, text) from anon, authenticated;

-- 自分のランク（マイページ用）
create or replace function my_rank()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_xp int; v_lv smallint; thr int[] := array[0,100,300,700,1500,3000,6000,12000];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select xp, rank_level into v_xp, v_lv from profiles where user_id = v_uid;
  v_xp := coalesce(v_xp, 0); v_lv := coalesce(v_lv, 1);
  return jsonb_build_object('level', v_lv, 'xp', v_xp,
    'xp_current_floor', thr[v_lv],
    'xp_for_next', case when v_lv >= 8 then thr[8] else thr[v_lv + 1] end);
end; $$;
grant execute on function my_rank() to authenticated;

-- ============================================================
-- XP発生源の配線（既存関数を再定義）
-- ============================================================

-- 連続ログイン +10/日（0047版＋add_xp）
create or replace function complete_line_signup(p_display_name text, p_line_user_id text, p_avatar text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into profiles(user_id, display_name, avatar_id, line_user_id, contact_verified, signup_completed, login_count)
    values (v_uid, coalesce(nullif(p_display_name,''),'プレイヤー'), p_avatar, p_line_user_id, true, true, 1)
    on conflict (user_id) do update set
      display_name = excluded.display_name, avatar_id = excluded.avatar_id, line_user_id = excluded.line_user_id,
      contact_verified = true, signup_completed = true, login_count = profiles.login_count + 1;
  perform grant_signup_bonus();
  perform add_xp(v_uid, 'login', 10, null);
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function complete_line_signup(text, text, text) to authenticated;

-- いいね獲得 +5（コメント作者へ・自己いいね除外・0017版＋add_xp）
create or replace function toggle_comment_like(p_comment_id bigint)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_liked boolean; v_author uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if exists(select 1 from comment_likes where comment_id = p_comment_id and user_id = v_uid) then
    delete from comment_likes where comment_id = p_comment_id and user_id = v_uid;
    v_liked := false;
  else
    insert into comment_likes(comment_id, user_id) values (p_comment_id, v_uid);
    v_liked := true;
    select user_id into v_author from comments where id = p_comment_id;
    if v_author is not null and v_author <> v_uid then
      perform add_xp(v_author, 'like', 5, p_comment_id::text);
    end if;
  end if;
  return v_liked;
end; $$;
grant execute on function toggle_comment_like(bigint) to authenticated;

-- シェアボーナス +10 XP（0028版＋add_xp）
create or replace function claim_share_bonus()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Tokyo')::date; v_balance bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into share_grants(user_id, grant_date) values (v_uid, v_today) on conflict do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_claimed'); end if;
  update wallets set balance = balance + 20 where user_id = v_uid returning balance into v_balance;
  if v_balance is null then raise exception 'no_wallet'; end if;
  insert into point_ledger(user_id, delta, reason, balance_after) values (v_uid, 20, 'share', v_balance);
  perform add_xp(v_uid, 'share', 10, null);
  return jsonb_build_object('ok', true, 'granted', 20, 'balance', v_balance);
end; $$;
grant execute on function claim_share_bonus() to authenticated;

-- 市場承認 +30 XP（作成者へ・0033版＋add_xp）
create or replace function admin_approve_market(p_market_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_creator uuid;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  update markets set status = 'open' where id = p_market_id and source = 'user' and status = 'draft'
    returning created_by into v_creator;
  if not found then raise exception 'not_pending'; end if;
  if v_creator is not null then perform add_xp(v_creator, 'market_approved', 30, p_market_id::text); end if;
  perform _audit('market_approve', jsonb_build_object('market_id', p_market_id), '{}'::jsonb);
  return true;
end; $$;
grant execute on function admin_approve_market(uuid) to authenticated;

-- 解決時：的中 +40 / 乗っかり +15（0044版＋add_xp 2ループ）
create or replace function resolve_market(p_market_id uuid, p_winning_outcome_id uuid, p_source_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_market markets%rowtype; v_count int; v_total bigint; v_rate numeric; v_ride numeric; v_ride_cap numeric;
  v_vig numeric; v_vol bigint; v_cb bigint; v_is_user_market boolean; v_creator uuid; r record;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found'; end if;
  if v_market.status not in ('open','closed','resolving') then raise exception 'already_resolved'; end if;
  if not exists (select 1 from outcomes where id = p_winning_outcome_id and market_id = p_market_id) then raise exception 'invalid_outcome'; end if;

  v_is_user_market := (v_market.source = 'user' and v_market.created_by is not null);
  v_creator := v_market.created_by;

  update markets set status = 'resolved' where id = p_market_id;
  update outcomes set is_winner = (id = p_winning_outcome_id) where market_id = p_market_id;

  select count(*), coalesce(sum((shares * 100)::bigint), 0) into v_count, v_total
    from positions where outcome_id = p_winning_outcome_id and shares > 0;

  insert into pending_winnings(user_id, market_id, outcome_id, amount)
    select user_id, p_market_id, p_winning_outcome_id, (shares * 100)::bigint
    from positions where outcome_id = p_winning_outcome_id and shares > 0
    on conflict (user_id, market_id) do nothing;

  v_rate := coalesce((select value from platform_settings where key = 'prize_win_rate'), 1);
  if v_rate > 0 then
    insert into prize_wallets(user_id, balance)
      select distinct user_id, 0 from positions
      where outcome_id = p_winning_outcome_id and shares > 0 and not (v_is_user_market and user_id = v_creator)
      on conflict (user_id) do nothing;
    with awards as (
      select user_id, floor(shares * v_rate)::bigint as amt from positions
      where outcome_id = p_winning_outcome_id and shares > 0 and not (v_is_user_market and user_id = v_creator)
    ),
    pos_awards as (select user_id, amt from awards where amt > 0),
    upd2 as (
      update prize_wallets pw set balance = pw.balance + pos_awards.amt from pos_awards where pw.user_id = pos_awards.user_id
        returning pw.user_id, pw.balance as balance_after, pos_awards.amt as amt
    )
    insert into prize_ledger(user_id, delta, reason, market_id, expires_at, balance_after)
    select user_id, amt, 'win_reward', p_market_id, now() + interval '90 days', balance_after from upd2;
  end if;

  v_ride := coalesce((select value from platform_settings where key = 'ride_rate'), 0.01);
  v_ride_cap := coalesce((select value from platform_settings where key = 'ride_max_per_market'), 0);
  if v_ride > 0 then
    with rides as (
      select rs.sharer_id, floor((p.shares * 100) * v_ride)::bigint as amt
      from ride_shares rs
      join positions p on p.user_id = rs.rider_id and p.outcome_id = p_winning_outcome_id and p.shares > 0
      left join profiles prr on prr.user_id = rs.rider_id
      left join profiles prs on prs.user_id = rs.sharer_id
      where rs.market_id = p_market_id
        and coalesce(prr.is_flagged, false) = false and coalesce(prs.is_flagged, false) = false
        and not (v_is_user_market and rs.sharer_id = v_creator)
    ),
    agg0 as (select sharer_id, sum(amt) as amt from rides group by sharer_id having sum(amt) > 0),
    agg as (select sharer_id, case when v_ride_cap > 0 then least(amt, v_ride_cap::bigint) else amt end as amt from agg0),
    updr as (
      update wallets w set balance = w.balance + agg.amt from agg where w.user_id = agg.sharer_id
        returning w.user_id, w.balance as balance_after, agg.amt as amt
    )
    insert into point_ledger(user_id, delta, reason, market_id, balance_after)
    select user_id, amt, 'ride', p_market_id, balance_after from updr;
  end if;

  if v_is_user_market then
    v_vig := coalesce((select value from platform_settings where key = 'creator_vig'), 0.10);
    select coalesce(sum(-delta), 0) into v_vol from point_ledger where market_id = p_market_id and reason = 'buy';
    if v_vig > 0 and v_vol > 0 then
      update wallets set balance = balance + floor(v_vol * v_vig)::bigint where user_id = v_creator returning balance into v_cb;
      if v_cb is not null then
        insert into point_ledger(user_id, delta, reason, market_id, balance_after)
          values (v_creator, floor(v_vol * v_vig)::bigint, 'creator', p_market_id, v_cb);
      end if;
    end if;
  end if;

  -- XP：的中 +40 / 乗っかり +15
  for r in select distinct user_id from positions where outcome_id = p_winning_outcome_id and shares > 0 loop
    perform add_xp(r.user_id, 'hit', 40, p_market_id::text);
  end loop;
  for r in select distinct user_id from point_ledger where market_id = p_market_id and reason = 'ride' loop
    perform add_xp(r.user_id, 'ride_bonus', 15, p_market_id::text);
  end loop;

  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, p_winning_outcome_id, v_market.resolution_kind, p_source_url, auth.uid());

  return jsonb_build_object('ok', true, 'winners_count', v_count, 'total_paid', v_total);
end; $$;
revoke execute on function resolve_market(uuid, uuid, text) from authenticated, anon;

-- ============================================================
-- アバター枠用に rank_level を返す（0036版＋rank_level）
-- ============================================================
drop function if exists market_holders(uuid);
create function market_holders(p_market_id uuid)
returns table(outcome_id uuid, display_name text, avatar_url text, rank_level smallint, shares numeric)
language sql stable security definer set search_path = public as $$
  select pos.outcome_id,
         coalesce(nullif(btrim(pr.nickname),''), pr.display_name, '匿名'),
         pr.avatar_url, coalesce(pr.rank_level, 1), pos.shares
  from positions pos
  join outcomes o on o.id = pos.outcome_id and o.market_id = p_market_id
  left join profiles pr on pr.user_id = pos.user_id
  where pos.shares > 0
  order by pos.shares desc limit 40;
$$;
grant execute on function market_holders(uuid) to anon, authenticated;

drop function if exists market_comments(uuid);
create function market_comments(p_market_id uuid)
returns table(id bigint, parent_id bigint, body text, created_at timestamptz,
              display_name text, avatar_url text, rank_level smallint, like_count int, liked boolean, holding text)
language sql stable security definer set search_path = public as $$
  select c.id, c.parent_id, c.body, c.created_at,
         coalesce(nullif(btrim(pr.nickname),''), pr.display_name, '匿名'),
         pr.avatar_url, coalesce(pr.rank_level, 1),
         (select count(*)::int from comment_likes l where l.comment_id = c.id),
         exists(select 1 from comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()),
         (select oc.label from positions p2
            join outcomes oc on oc.id = p2.outcome_id and oc.market_id = p_market_id
            where p2.user_id = c.user_id and p2.shares > 0
            order by p2.shares desc limit 1)
  from comments c
  left join profiles pr on pr.user_id = c.user_id
  where c.market_id = p_market_id and c.is_hidden = false
  order by c.created_at asc limit 200;
$$;
grant execute on function market_comments(uuid) to anon, authenticated;

-- ============================================================
-- バックフィル：既存の的中回数からXPを付与し rank_level を再計算
-- （XPは win_count × 40 の近似。過去の的中を実力として反映）
-- ============================================================
update profiles p set xp = coalesce(s.win_count, 0) * 40
  from user_stats s where s.user_id = p.user_id and coalesce(s.win_count,0) > 0;
update profiles set rank_level = rank_level_for_xp(xp) where xp > 0;
