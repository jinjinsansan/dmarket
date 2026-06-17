-- ============================================================
-- 中核（SPEC-02 §10）受け入れ条件テスト
-- 実行: ローカル Supabase に対して
--   npx supabase db reset            # migrations を全適用
--   psql "$LOCAL_DB_URL" -f supabase/tests/0001_core_acceptance.sql
-- auth.uid() は request.jwt.claims の sub から解決されるため、
-- ユーザー切替は set_jwt() ヘルパで行う。全テストはロールバックで後始末。
-- 失敗時は ASSERT が例外を投げてトランザクションが落ちる。
-- ============================================================

begin;

-- 認証ユーザーを擬似的に作る（FK: auth.users）
create or replace function _test_make_user(p_email text) returns uuid
language plpgsql as $$
declare v_uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_uid, 'authenticated', 'authenticated', p_email, now(), now());
  return v_uid;
end $$;

-- auth.uid() を切り替える
create or replace function _test_set_jwt(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text)::text, false);
end $$;

do $$
declare
  alice uuid;
  bob   uuid;
  v_cat uuid;
  v_mkt uuid;
  v_yes uuid;
  v_no  uuid;
  r     jsonb;
  p_yes float8;
  p_no  float8;
  v_bal bigint;
  v_ledger_sum bigint;
  v_shares numeric;
begin
  -- ユーザーと初期付与
  alice := _test_make_user('alice@test.local');
  bob   := _test_make_user('bob@test.local');

  perform _test_set_jwt(alice);
  perform grant_signup_bonus();
  select balance into v_bal from wallets where user_id = alice;
  assert v_bal = 1000, format('signup grant should be 1000, got %s', v_bal);

  -- 冪等: 2回目は二重付与しない
  perform grant_signup_bonus();
  select balance into v_bal from wallets where user_id = alice;
  assert v_bal = 1000, 'signup grant must be idempotent';

  perform _test_set_jwt(bob);
  perform grant_signup_bonus();

  -- デイリー付与（1日1回）
  perform _test_set_jwt(alice);
  r := claim_daily_grant();
  assert (r->>'ok')::boolean, 'first daily claim should succeed';
  r := claim_daily_grant();
  assert (r->>'ok')::boolean = false and r->>'reason' = 'already_claimed',
         'second daily claim same day must be already_claimed';
  -- 後続テストの残高を読みやすくするため alice を 1000 に戻す
  update wallets set balance = 1000 where user_id = alice;
  delete from point_ledger where user_id = alice and reason = 'daily';

  -- 二択市場（q=0,0 → 0.5/0.5）
  insert into categories(slug, name) values ('test', 'Test') returning id into v_cat;
  insert into markets(category_id, question, b_param, source, resolution_kind, status, close_time, resolve_time)
    values (v_cat, 'Will it rain?', 50, 'admin', 'manual', 'open', now() + interval '1 day', now() + interval '2 day')
    returning id into v_mkt;
  insert into outcomes(market_id, label, display_order) values (v_mkt, 'YES', 0) returning id into v_yes;
  insert into outcomes(market_id, label, display_order) values (v_mkt, 'NO', 1)  returning id into v_no;

  select price into p_yes from lmsr_market_prices(v_mkt) where outcome_id = v_yes;
  select price into p_no  from lmsr_market_prices(v_mkt) where outcome_id = v_no;
  assert abs(p_yes - 0.5) < 1e-9, format('YES price should be 0.5, got %s', p_yes);
  assert abs(p_no  - 0.5) < 1e-9, format('NO price should be 0.5, got %s', p_no);

  -- alice が YES を買う → YES↑ NO↓ 合計=1
  perform _test_set_jwt(alice);
  r := buy_shares(v_yes, 8);
  assert (r->>'ok')::boolean, 'buy should succeed';
  select price into p_yes from lmsr_market_prices(v_mkt) where outcome_id = v_yes;
  select price into p_no  from lmsr_market_prices(v_mkt) where outcome_id = v_no;
  assert p_yes > 0.5, format('YES price should rise above 0.5, got %s', p_yes);
  assert p_no  < 0.5, format('NO price should fall below 0.5, got %s', p_no);
  assert abs((p_yes + p_no) - 1.0) < 1e-9, format('prices must sum to 1, got %s', p_yes + p_no);

  -- buy→即sellで端数だけ損して概ね戻る
  select balance into v_bal from wallets where user_id = alice;
  r := sell_shares(v_yes, 8);
  assert (r->>'ok')::boolean, 'sell should succeed';
  select balance into v_bal from wallets where user_id = alice;
  assert v_bal <= 1000 and v_bal >= 995, format('round-trip should lose only rounding, balance=%s', v_bal);

  -- 残高不足の buy は insufficient_balance で全ロールバック
  begin
    r := buy_shares(v_yes, 100000);
    assert false, 'huge buy should have raised';
  exception when others then
    assert sqlerrm = 'insufficient_balance', format('expected insufficient_balance, got %s', sqlerrm);
  end;

  -- 解決と償還: alice が再び YES を買って解決
  r := buy_shares(v_yes, 8);
  select shares into v_shares from positions where user_id = alice and outcome_id = v_yes;
  select balance into v_bal from wallets where user_id = alice;
  perform resolve_market(v_mkt, v_yes, 'https://example.test/source');
  select balance into v_bal from wallets where user_id = alice;
  -- 償還で shares×100 が増える（買値は別途引かれている）
  assert v_bal >= 8 * 100, format('winner should be redeemed at 100/share, balance=%s', v_bal);

  -- 二重解決は弾く
  begin
    perform resolve_market(v_mkt, v_yes, 'x');
    assert false, 'double resolve should raise';
  exception when others then
    assert sqlerrm = 'already_resolved', format('expected already_resolved, got %s', sqlerrm);
  end;

  -- 解決後の取引は market_closed
  begin
    r := buy_shares(v_yes, 1);
    assert false, 'trade after resolve should raise';
  exception when others then
    assert sqlerrm = 'market_closed', format('expected market_closed, got %s', sqlerrm);
  end;

  -- 監査: 全ユーザーで balance == Σ ledger.delta
  for alice in select user_id from wallets loop
    select balance into v_bal from wallets where user_id = alice;
    select coalesce(sum(delta),0) into v_ledger_sum from point_ledger where user_id = alice;
    assert v_bal = v_ledger_sum,
      format('balance(%s) must equal ledger sum(%s) for user %s', v_bal, v_ledger_sum, alice);
  end loop;

  raise notice 'ALL CORE ACCEPTANCE CHECKS PASSED';
end;
$$;

rollback;
