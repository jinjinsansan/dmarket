-- ============================================================
-- 管理コンソール（SPEC-07 §10）受け入れ条件テスト
-- 非管理者拒否 / 市場作成(初期qシード) / 解決 / 訂正(台帳整合) / フラグ / 監査記録。
-- ============================================================
begin;

create or replace function _mku(p_email text) returns uuid
language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at)
    values (v,'authenticated','authenticated',p_email,now(),now());
  insert into profiles(user_id, display_name, contact_verified, signup_completed)
    values (v, split_part(p_email,'@',1), true, true);
  insert into wallets(user_id, balance) values (v, 1000);
  insert into point_ledger(user_id, delta, reason, balance_after) values (v, 1000, 'signup', 1000);
  return v;
end $$;
create or replace function _jwt(p uuid) returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('sub',p::text)::text, false); end $$;

do $$
declare
  adm uuid; alice uuid;
  cat uuid; mkt uuid; yes uuid; no uuid;
  ok boolean; p_yes float8; v_bal bigint; v_sum bigint; v_aud int; r jsonb;
begin
  adm := _mku('admin@x'); alice := _mku('alice@x');
  insert into admin_users(user_id, role) values (adm, 'admin');
  insert into categories(slug,name) values ('ad','Ad') returning id into cat;

  -- 非管理者は create_admin_market を呼べない
  perform _jwt(alice);
  begin
    perform create_admin_market('Q',null,null,cat,'binary',
      '[{"label":"YES","display_order":0},{"label":"NO","display_order":1}]'::jsonb,
      50, now()+interval '1d', now()+interval '2d', 0.6);
    assert false, 'non-admin must be rejected';
  exception when others then
    assert sqlerrm = 'not_admin', format('expected not_admin, got %s', sqlerrm);
  end;

  -- 管理者は作成可。初期YES価格0.6でqがシードされる
  perform _jwt(adm);
  mkt := create_admin_market('BTC上がる?',null,null,cat,'binary',
    '[{"label":"YES","display_order":0},{"label":"NO","display_order":1}]'::jsonb,
    50, now()+interval '1d', now()+interval '2d', 0.6);
  select id into yes from outcomes where market_id=mkt and display_order=0;
  select id into no  from outcomes where market_id=mkt and display_order=1;
  select price into p_yes from lmsr_market_prices(mkt) where outcome_id=yes;
  assert abs(p_yes - 0.6) < 1e-9, format('admin market YES should seed 0.6, got %s', p_yes);

  -- alice が YES 購入 → 管理者が YES で解決 → alice 償還
  perform _jwt(alice); perform buy_shares(yes, 8);
  perform _jwt(adm);   r := admin_resolve(mkt, yes, 'http://src');
  assert (r->>'ok')::boolean, 'admin_resolve should succeed';
  select balance into v_bal from wallets where user_id=alice;
  assert v_bal >= 800, format('alice should be redeemed, balance=%s', v_bal);

  -- 訂正: 勝者を NO に付け替え → alice の償還を逆仕訳。台帳整合を維持
  r := correct_resolution(mkt, no, '誤確定の訂正');
  assert (r->>'ok')::boolean, 'correct_resolution should succeed';
  select balance into v_bal from wallets where user_id=alice;
  select coalesce(sum(delta),0) into v_sum from point_ledger where user_id=alice;
  assert v_bal = v_sum, format('ledger integrity after correction: bal=%s sum=%s', v_bal, v_sum);
  assert (select winning_outcome_id from resolutions where market_id=mkt) = no, 'resolution winner should be NO now';

  -- フラグ: alice を除外対象に
  perform flag_user(alice, 'multi-account');
  assert (select is_flagged from profiles where user_id=alice), 'alice should be flagged';

  -- 監査: すべての操作が記録される
  select count(*) into v_aud from admin_audit where actor=adm
    and action in ('create_market','resolve','correct','flag_user');
  assert v_aud >= 4, format('admin actions should be audited, got %s', v_aud);

  raise notice 'ALL ADMIN ACCEPTANCE CHECKS PASSED';
end;
$$;

rollback;
