-- ============================================================
-- 0003 ポイント発行RPC（SPEC-02 §6）
-- 無償発行の2経路。これと償還/返金(0005)以外に balance を増やす経路は存在しない。
-- 定数: SIGNUP_GRANT=1000 / DAILY_GRANT=100 / TZ=Asia/Tokyo
-- ============================================================

-- 新規登録時1回（冪等）。wallet 作成 ＋ SIGNUP_GRANT 付与 ＋ ledger 'signup'。
create or replace function grant_signup_bonus()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into wallets(user_id, balance)
    values (v_uid, 1000)
    on conflict (user_id) do nothing;

  -- FOUND は実際に行が挿入されたときのみ true（既存walletなら false）→ 冪等
  if found then
    insert into point_ledger(user_id, delta, reason, balance_after)
      values (v_uid, 1000, 'signup', 1000);
  end if;
end;
$$;

-- デイリー付与（1日1回・全員同額・JST基準）。daily_grants 複合PKで冪等。
create or replace function claim_daily_grant()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date := (now() at time zone 'Asia/Tokyo')::date;
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into daily_grants(user_id, grant_date)
    values (v_uid, v_today)
    on conflict do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update wallets set balance = balance + 100
    where user_id = v_uid
    returning balance into v_balance;

  if v_balance is null then
    -- wallet 未作成（complete_signup 未実行）。daily_grants 挿入ごとロールバック。
    raise exception 'no_wallet';
  end if;

  insert into point_ledger(user_id, delta, reason, balance_after)
    values (v_uid, 100, 'daily', v_balance);

  return jsonb_build_object('ok', true, 'granted', 100, 'balance', v_balance);
end;
$$;

-- PostgREST から呼べるよう実行権限を付与（RLSは definer がバイパス）
grant execute on function grant_signup_bonus()  to authenticated;
grant execute on function claim_daily_grant()   to authenticated;
