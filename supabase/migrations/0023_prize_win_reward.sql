-- ============================================================
-- 0023 二層ポイント制 Phase B：的中報酬（解決時に賞品ptを付与）
--
-- 設計（二層ポイント制_設計案.md §2(A) / 引継ぎ書 §5）:
--   賞品pt = floor(勝ち株数 × prize_win_rate)。レートは platform_settings で運用調整。
--   既定 prize_win_rate = 1（勝ち1株 = 1賞品pt = 参加pt償還100ptの1%）。
--   resolve_market の勝者一括償還に賞品pt付与を set-based で追加（往復1回・大量保有でも安全）。
--   付与の有効期限は now()+90日（grant_prize_points の既定と同一）。
--
-- 不変条件は維持: prize_wallets.balance == Σ prize_ledger.delta。
-- resolve_market は status ガードで冪等 → 二重付与なし。
--
-- 注: platform_settings / admin_set_setting は 0019 で定義済みだが、
--     本MIGは「create table if not exists」「create or replace」で自己完結させ、
--     0019 未適用環境（ローカルテスト等）でも単独で流せるようにする。
-- ============================================================

-- 付与レート設定（勝ち1株あたりの賞品pt）。既定1。
create table if not exists platform_settings (
  key        text primary key,
  value      numeric not null,
  updated_at timestamptz not null default now()
);
insert into platform_settings(key, value) values ('prize_win_rate', 1)
on conflict (key) do nothing;

-- 管理が prize_win_rate を調整できるようホワイトリストへ追加（0019 を上書き）。
create or replace function admin_set_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  if p_key not in ('signup_grant','daily_grant','b_default','prize_win_rate') then
    raise exception 'unknown_key';
  end if;
  if p_value < 0 then raise exception 'negative'; end if;
  insert into platform_settings(key, value, updated_at) values (p_key, p_value, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform _audit('setting', jsonb_build_object('key', p_key), jsonb_build_object('value', p_value));
end;
$$;
grant execute on function admin_set_setting(text, numeric) to authenticated;

-- ============================================================
-- resolve_market：勝ち outcome を確定し、勝ち株×100pt を一括償還（既存）
--   ＋ 的中報酬として賞品pt = floor(勝ち株数 × prize_win_rate) を付与（本MIGで追加）。
-- ============================================================
create or replace function resolve_market(
  p_market_id uuid,
  p_winning_outcome_id uuid,
  p_source_url text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market   markets%rowtype;
  v_count    int;
  v_total    bigint;
  v_rate     numeric;
  v_prize    bigint;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found'; end if;
  if v_market.status not in ('open','closed','resolving') then
    raise exception 'already_resolved';
  end if;
  if not exists (
    select 1 from outcomes where id = p_winning_outcome_id and market_id = p_market_id
  ) then
    raise exception 'invalid_outcome';
  end if;

  update markets set status = 'resolved' where id = p_market_id;
  update outcomes set is_winner = (id = p_winning_outcome_id) where market_id = p_market_id;

  -- 集計（戻り値用）
  select count(*), coalesce(sum((shares * 100)::bigint), 0)
    into v_count, v_total
    from positions where outcome_id = p_winning_outcome_id and shares > 0;

  -- 勝者一括償還（参加ポイント） ＋ 台帳記録（balance_after は更新後の残高）
  with winners as (
    select user_id, (shares * 100)::bigint as payout
    from positions
    where outcome_id = p_winning_outcome_id and shares > 0
  ),
  upd as (
    update wallets w
      set balance = w.balance + winners.payout
      from winners
      where w.user_id = winners.user_id
      returning w.user_id, w.balance as balance_after, winners.payout as payout
  )
  insert into point_ledger(user_id, delta, reason, market_id, outcome_id, shares, balance_after)
  select user_id, payout, 'redeem', p_market_id, p_winning_outcome_id, null, balance_after
  from upd;

  -- ── 的中報酬（賞品ポイント） ─────────────────────────────────
  -- 賞品pt = floor(勝ち株数 × prize_win_rate)。set-based・冪等(status ガード)。
  v_rate := coalesce((select value from platform_settings where key = 'prize_win_rate'), 1);
  if v_rate > 0 then
    -- 勝者の prize_wallet を用意（なければ作成）
    insert into prize_wallets(user_id, balance)
      select distinct user_id, 0 from positions
      where outcome_id = p_winning_outcome_id and shares > 0
      on conflict (user_id) do nothing;

    with awards as (
      select user_id, floor(shares * v_rate)::bigint as amt
      from positions
      where outcome_id = p_winning_outcome_id and shares > 0
    ),
    pos_awards as (
      select user_id, amt from awards where amt > 0
    ),
    upd2 as (
      update prize_wallets pw
        set balance = pw.balance + pos_awards.amt
        from pos_awards
        where pw.user_id = pos_awards.user_id
        returning pw.user_id, pw.balance as balance_after, pos_awards.amt as amt
    )
    insert into prize_ledger(user_id, delta, reason, market_id, expires_at, balance_after)
    select user_id, amt, 'win_reward', p_market_id, now() + interval '90 days', balance_after
    from upd2;
  end if;

  insert into resolutions(market_id, winning_outcome_id, resolution_kind, source_url, resolved_by)
    values (p_market_id, p_winning_outcome_id, v_market.resolution_kind, p_source_url, auth.uid());

  return jsonb_build_object('ok', true, 'winners_count', v_count, 'total_paid', v_total);
end;
$$;

-- 解決RPCは通常サーバー側（自動解決ジョブ=service_role / 管理RPC経由）から呼ぶ。
revoke execute on function resolve_market(uuid, uuid, text) from authenticated, anon;
