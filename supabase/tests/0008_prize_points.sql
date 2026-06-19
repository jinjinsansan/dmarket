-- ============================================================
-- 二層ポイント制：賞品ポイント層（0022）受け入れテスト
-- grant_prize_points / redeem_prize / expire_prize_points と
-- 不変条件 balance == Σ prize_ledger.delta を検証。全てロールバックで後始末。
-- ============================================================

begin;

create or replace function _test_make_user(p_email text) returns uuid
language plpgsql as $$
declare v_uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_uid, 'authenticated', 'authenticated', p_email, now(), now());
  return v_uid;
end $$;

create or replace function _test_set_jwt(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text)::text, false);
end $$;

do $$
declare
  alice uuid;
  bob   uuid;
  carol uuid;
  v_prize uuid;
  v_prize_ltd uuid;
  v_bal bigint;
  v_sum bigint;
  r jsonb;
begin
  alice := _test_make_user('alice@prize.local');
  bob   := _test_make_user('bob@prize.local');
  carol := _test_make_user('carol@prize.local');

  -- ── 付与（的中報酬） ─────────────────────────────
  perform grant_prize_points(alice, 300, 'win_reward');
  select balance into v_bal from prize_wallets where user_id = alice;
  assert v_bal = 300, format('grant should set balance 300, got %s', v_bal);

  -- 不正な付与は弾く
  begin
    perform grant_prize_points(alice, 0, 'win_reward');
    assert false, 'zero grant should raise';
  exception when others then
    assert sqlerrm = 'invalid_amount', format('expected invalid_amount, got %s', sqlerrm);
  end;
  begin
    perform grant_prize_points(alice, 10, 'redeem');  -- redeem は付与理由として不可
    assert false, 'bad reason should raise';
  exception when others then
    assert sqlerrm = 'invalid_reason', format('expected invalid_reason, got %s', sqlerrm);
  end;

  -- ── 確定交換 ─────────────────────────────────────
  insert into prizes(name, cost_points, stock) values ('Amazonギフト100', 100, 5) returning id into v_prize;

  perform _test_set_jwt(alice);
  r := redeem_prize(v_prize, jsonb_build_object('name','テスト太郎','addr','東京'));
  assert (r->>'ok')::boolean, 'redeem should succeed';
  select balance into v_bal from prize_wallets where user_id = alice;
  assert v_bal = 200, format('after redeem balance should be 200, got %s', v_bal);
  -- 在庫が減る
  select stock into v_bal from prizes where id = v_prize;
  assert v_bal = 4, format('stock should drop to 4, got %s', v_bal);
  -- 申込が作られる
  assert exists (select 1 from prize_redemptions where user_id = alice and prize_id = v_prize),
         'redemption row must exist';

  -- 残高不足の交換は弾く（全ロールバック）
  insert into prizes(name, cost_points, stock) values ('高額景品', 10000, 1) returning id into v_prize_ltd;
  begin
    r := redeem_prize(v_prize_ltd, null);
    assert false, 'over-balance redeem should raise';
  exception when others then
    assert sqlerrm = 'insufficient_prize_points', format('expected insufficient_prize_points, got %s', sqlerrm);
  end;

  -- 在庫切れは弾く
  update prizes set stock = 0 where id = v_prize_ltd;
  update prizes set cost_points = 1 where id = v_prize_ltd;  -- 残高は足りる状態に
  begin
    r := redeem_prize(v_prize_ltd, null);
    assert false, 'out of stock redeem should raise';
  exception when others then
    assert sqlerrm = 'out_of_stock', format('expected out_of_stock, got %s', sqlerrm);
  end;

  -- ── FIFO失効 ─────────────────────────────────────
  -- bob: 期限切れlot 100 ＋ 有効lot 200。消費なし → 100だけ失効。
  perform grant_prize_points(bob, 100, 'win_reward', null, now() - interval '1 day');
  perform grant_prize_points(bob, 200, 'win_reward', null, now() + interval '30 day');
  select balance into v_bal from prize_wallets where user_id = bob;
  assert v_bal = 300, format('bob start 300, got %s', v_bal);

  r := expire_prize_points();
  select balance into v_bal from prize_wallets where user_id = bob;
  assert v_bal = 200, format('bob after expiry should be 200, got %s', v_bal);

  -- 再実行は二重失効しない（消費合計に前回の失効が含まれるため）
  r := expire_prize_points();
  select balance into v_bal from prize_wallets where user_id = bob;
  assert v_bal = 200, format('expiry must be idempotent, got %s', v_bal);

  -- carol: 期限切れlot 100 を交換で先に消費 → 失効は0。
  perform grant_prize_points(carol, 100, 'win_reward', null, now() - interval '1 day');
  perform _test_set_jwt(carol);
  r := redeem_prize(v_prize, null);  -- cost 100
  select balance into v_bal from prize_wallets where user_id = carol;
  assert v_bal = 0, format('carol after redeem should be 0, got %s', v_bal);
  r := expire_prize_points();
  select balance into v_bal from prize_wallets where user_id = carol;
  assert v_bal = 0, format('carol should stay 0 (already consumed), got %s', v_bal);

  -- ── 不変条件: balance == Σ ledger.delta ──────────
  for alice in select user_id from prize_wallets loop
    select balance into v_bal from prize_wallets where user_id = alice;
    select coalesce(sum(delta),0) into v_sum from prize_ledger where user_id = alice;
    assert v_bal = v_sum,
      format('prize balance(%s) must equal ledger sum(%s) for %s', v_bal, v_sum, alice);
  end loop;

  raise notice 'ALL PRIZE POINT CHECKS PASSED';
end;
$$;

rollback;
