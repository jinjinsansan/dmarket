-- ============================================================
-- 0044 自作市場の自己ディール対策（インサイダー×乗っかりの悪用を抑制）
-- ユーザー作成市場(source='user')では、作成者(created_by)を
--   ・景品ポイント（ゴリラコイン＝実質価値あり・景品交換可）の付与対象から除外
--   ・乗っかりボーナス（自分の市場を自分のリンクで拡散する自己ファーミング）から除外
-- 作成者の報酬は「作成者テラ銭（参加pt・換金不可）」のみとする。
-- ※ 共謀アカウントは is_flagged 除外（0043）＋景品交換の管理者承認で最終ブロック。
-- resolve_market（0043版）の該当2ブロックのみ変更。
-- ============================================================
create or replace function resolve_market(p_market_id uuid, p_winning_outcome_id uuid, p_source_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_market markets%rowtype;
  v_count int;
  v_total bigint;
  v_rate numeric;
  v_ride numeric;
  v_ride_cap numeric;
  v_vig numeric;
  v_vol bigint;
  v_cb bigint;
  v_is_user_market boolean;
  v_creator uuid;
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

  -- 勝者の払戻し（参加pt）は「保留」に記録（作成者本人も参加ptは受け取れる＝価値ゼロのため）
  insert into pending_winnings(user_id, market_id, outcome_id, amount)
    select user_id, p_market_id, p_winning_outcome_id, (shares * 100)::bigint
    from positions where outcome_id = p_winning_outcome_id and shares > 0
    on conflict (user_id, market_id) do nothing;

  -- 的中報酬（ゴリラコイン＝実質価値あり）※自作市場では作成者を除外
  v_rate := coalesce((select value from platform_settings where key = 'prize_win_rate'), 1);
  if v_rate > 0 then
    insert into prize_wallets(user_id, balance)
      select distinct user_id, 0 from positions
      where outcome_id = p_winning_outcome_id and shares > 0
        and not (v_is_user_market and user_id = v_creator)
      on conflict (user_id) do nothing;
    with awards as (
      select user_id, floor(shares * v_rate)::bigint as amt
      from positions
      where outcome_id = p_winning_outcome_id and shares > 0
        and not (v_is_user_market and user_id = v_creator)
    ),
    pos_awards as (select user_id, amt from awards where amt > 0),
    upd2 as (
      update prize_wallets pw set balance = pw.balance + pos_awards.amt from pos_awards where pw.user_id = pos_awards.user_id
        returning pw.user_id, pw.balance as balance_after, pos_awards.amt as amt
    )
    insert into prize_ledger(user_id, delta, reason, market_id, expires_at, balance_after)
    select user_id, amt, 'win_reward', p_market_id, now() + interval '90 days', balance_after from upd2;
  end if;

  -- 乗っかりボーナス ※フラグ付き除外（0043）＋自作市場の作成者をシェア元から除外
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
        and coalesce(prr.is_flagged, false) = false
        and coalesce(prs.is_flagged, false) = false
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

  -- 作成者テラ銭（参加pt・換金不可）※作成者の正規報酬
  if v_is_user_market then
    v_vig := coalesce((select value from platform_settings where key = 'creator_vig'), 0.10);
    select coalesce(sum(-delta), 0) into v_vol from point_ledger where market_id = p_market_id and reason = 'buy';
    if v_vig > 0 and v_vol > 0 then
      update wallets set balance = balance + floor(v_vol * v_vig)::bigint
        where user_id = v_creator returning balance into v_cb;
      if v_cb is not null then
        insert into point_ledger(user_id, delta, reason, market_id, balance_after)
          values (v_creator, floor(v_vol * v_vig)::bigint, 'creator', p_market_id, v_cb);
      end if;
    end if;
  end if;

  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, p_winning_outcome_id, v_market.resolution_kind, p_source_url, auth.uid());

  return jsonb_build_object('ok', true, 'winners_count', v_count, 'total_paid', v_total);
end; $$;
revoke execute on function resolve_market(uuid, uuid, text) from authenticated, anon;
