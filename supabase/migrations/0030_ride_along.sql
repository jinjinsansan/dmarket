-- ============================================================
-- 0030 乗っかり1%（シェア帰属＋解決時ボーナス）
-- シェアURL(?ref=コード)から乗った人(rider)を記録し、市場が解決して
-- rider の勝ちポジションがあれば、シェア元(sharer)へ rider 払戻しの1%を
-- 参加ポイント(換金不可・reason='ride')で付与。
-- resolve_market（0023版）に set-based ブロックを追加（全解決経路をカバー・冪等）。
-- ============================================================

-- reason 拡張（ride 追加）
alter table point_ledger drop constraint if exists point_ledger_reason_check;
alter table point_ledger add constraint point_ledger_reason_check
  check (reason in ('signup','daily','buy','sell','redeem','refund','admin_grant','admin_burn','affiliate','share','referral','ride'));

-- 乗っかり帰属（市場×rider で一意・最初のシェア元が有効）
create table if not exists ride_shares (
  market_id  uuid not null references markets(id) on delete cascade,
  rider_id   uuid not null references auth.users(id),
  sharer_id  uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (market_id, rider_id)
);
alter table ride_shares enable row level security;
drop policy if exists "own ride_shares" on ride_shares;
create policy "own ride_shares" on ride_shares for select using (rider_id = auth.uid() or sharer_id = auth.uid());

-- 乗っかり記録（open のときのみ・自分のシェアは無効）
create or replace function record_ride(p_market_id uuid, p_sharer_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sharer uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  select user_id into v_sharer from profiles where ref_code(user_id) = upper(trim(p_sharer_code)) limit 1;
  if v_sharer is null or v_sharer = v_uid then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if not exists(select 1 from markets where id = p_market_id and status = 'open') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  insert into ride_shares(market_id, rider_id, sharer_id) values (p_market_id, v_uid, v_sharer) on conflict do nothing;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function record_ride(uuid, text) to authenticated;

-- resolve_market を再定義（0023版 ＋ 乗っかりボーナス）
create or replace function resolve_market(
  p_market_id uuid,
  p_winning_outcome_id uuid,
  p_source_url text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_market markets%rowtype;
  v_count int;
  v_total bigint;
  v_rate  numeric;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found'; end if;
  if v_market.status not in ('open','closed','resolving') then raise exception 'already_resolved'; end if;
  if not exists (select 1 from outcomes where id = p_winning_outcome_id and market_id = p_market_id) then
    raise exception 'invalid_outcome';
  end if;

  update markets set status = 'resolved' where id = p_market_id;
  update outcomes set is_winner = (id = p_winning_outcome_id) where market_id = p_market_id;

  select count(*), coalesce(sum((shares * 100)::bigint), 0) into v_count, v_total
    from positions where outcome_id = p_winning_outcome_id and shares > 0;

  -- 勝者一括償還（参加ポイント）
  with winners as (
    select user_id, (shares * 100)::bigint as payout
    from positions where outcome_id = p_winning_outcome_id and shares > 0
  ),
  upd as (
    update wallets w set balance = w.balance + winners.payout
      from winners where w.user_id = winners.user_id
      returning w.user_id, w.balance as balance_after, winners.payout as payout
  )
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
  select user_id, payout, 'redeem', p_market_id, p_winning_outcome_id, null, balance_after from upd;

  -- 的中報酬（賞品ポイント）
  v_rate := coalesce((select value from platform_settings where key = 'prize_win_rate'), 1);
  if v_rate > 0 then
    insert into prize_wallets(user_id, balance)
      select distinct user_id, 0 from positions
      where outcome_id = p_winning_outcome_id and shares > 0
      on conflict (user_id) do nothing;
    with awards as (
      select user_id, floor(shares * v_rate)::bigint as amt
      from positions where outcome_id = p_winning_outcome_id and shares > 0
    ),
    pos_awards as (select user_id, amt from awards where amt > 0),
    upd2 as (
      update prize_wallets pw set balance = pw.balance + pos_awards.amt
        from pos_awards where pw.user_id = pos_awards.user_id
        returning pw.user_id, pw.balance as balance_after, pos_awards.amt as amt
    )
    insert into prize_ledger(user_id, delta, reason, market_id, expires_at, balance_after)
    select user_id, amt, 'win_reward', p_market_id, now() + interval '90 days', balance_after from upd2;
  end if;

  -- ── 乗っかりボーナス（シェア元へ的中rider払戻しの1%・参加pt） ──
  with rides as (
    select rs.sharer_id, floor((p.shares * 100) * 0.01)::bigint as amt
    from ride_shares rs
    join positions p on p.user_id = rs.rider_id
                    and p.outcome_id = p_winning_outcome_id and p.shares > 0
    where rs.market_id = p_market_id
  ),
  agg as (
    select sharer_id, sum(amt) as amt from rides group by sharer_id having sum(amt) > 0
  ),
  updr as (
    update wallets w set balance = w.balance + agg.amt
      from agg where w.user_id = agg.sharer_id
      returning w.user_id, w.balance as balance_after, agg.amt as amt
  )
  insert into point_ledger(user_id, delta, reason, market_id, balance_after)
  select user_id, amt, 'ride', p_market_id, balance_after from updr;

  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, p_winning_outcome_id, v_market.resolution_kind, p_source_url, auth.uid());

  return jsonb_build_object('ok', true, 'winners_count', v_count, 'total_paid', v_total);
end;
$$;
revoke execute on function resolve_market(uuid, uuid, text) from authenticated, anon;
