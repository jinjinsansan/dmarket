-- ============================================================
-- 二層ポイント制 Phase C：景品マスタ管理＆交換申込運用（0024）受け入れテスト
-- 非管理者拒否 / CRUD / 交換→取消で返金＋在庫復元 / 不変条件維持。全てロールバック。
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
  return v;
end $$;
create or replace function _jwt(p uuid) returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('sub',p::text)::text, false); end $$;

do $$
declare
  adm uuid; alice uuid;
  v_prize uuid; v_red uuid; v_stock int; v_bal bigint; v_sum bigint; r jsonb;
  v_rows int;
begin
  adm := _mku('admin@prizeadmin'); alice := _mku('alice@prizeadmin');
  insert into admin_users(user_id, role) values (adm, 'admin');

  -- 非管理者は管理RPCを呼べない
  perform _jwt(alice);
  begin
    perform admin_upsert_prize(null,'X',null,null,100,5,true,0);
    assert false, 'non-admin upsert must be rejected';
  exception when others then
    assert sqlerrm = 'not_admin', format('expected not_admin, got %s', sqlerrm);
  end;

  -- 管理者: 景品作成
  perform _jwt(adm);
  v_prize := admin_upsert_prize(null, 'Amazonギフト500', '説明', null, 200, 3, true, 1);
  assert v_prize is not null, 'prize should be created';
  select stock into v_stock from prizes where id = v_prize;
  assert v_stock = 3, format('stock should be 3, got %s', v_stock);

  -- 更新（コスト・在庫変更）
  perform admin_upsert_prize(v_prize, 'Amazonギフト500', '説明2', null, 150, 5, true, 1);
  select cost_points, stock into v_bal, v_stock from prizes where id = v_prize;
  assert v_bal = 150 and v_stock = 5, format('update failed: cost=%s stock=%s', v_bal, v_stock);

  -- 不正値は弾く
  begin
    perform admin_upsert_prize(null, '', null, null, 100, null, true, 0);
    assert false, 'empty name must raise';
  exception when others then
    assert sqlerrm = 'invalid_name', format('expected invalid_name, got %s', sqlerrm);
  end;
  begin
    perform admin_upsert_prize(null, 'Y', null, null, 0, null, true, 0);
    assert false, 'zero cost must raise';
  exception when others then
    assert sqlerrm = 'invalid_cost', format('expected invalid_cost, got %s', sqlerrm);
  end;

  -- 一覧（無効含む）: 無効化した景品も管理一覧には出る
  perform admin_set_prize_active(v_prize, false);
  select count(*) into v_rows from admin_list_prizes() where id = v_prize and is_active = false;
  assert v_rows = 1, 'inactive prize must appear in admin list';
  perform admin_set_prize_active(v_prize, true);

  -- alice に賞品pt付与 → 交換
  perform grant_prize_points(alice, 500, 'win_reward');
  perform _jwt(alice);
  r := redeem_prize(v_prize, jsonb_build_object('name','テスト太郎','addr','東京'));
  assert (r->>'ok')::boolean, 'redeem should succeed';
  select id into v_red from prize_redemptions where user_id = alice and prize_id = v_prize;
  select balance into v_bal from prize_wallets where user_id = alice;
  assert v_bal = 350, format('after redeem 150 from 500 should be 350, got %s', v_bal);
  select stock into v_stock from prizes where id = v_prize;
  assert v_stock = 4, format('stock should drop 5->4, got %s', v_stock);

  -- 管理: 一覧に表示され、発送ステータスを更新できる
  perform _jwt(adm);
  select count(*) into v_rows from admin_list_redemptions(null) where id = v_red;
  assert v_rows = 1, 'redemption must appear in admin list';
  r := admin_set_redemption_status(v_red, 'approved');
  assert (r->>'ok')::boolean, 'status update should succeed';

  -- 取消（未発送）→ 賞品pt返金＋在庫復元
  r := admin_set_redemption_status(v_red, 'cancelled');
  assert (r->>'ok')::boolean, 'cancel should succeed';
  select balance into v_bal from prize_wallets where user_id = alice;
  assert v_bal = 500, format('cancel should refund to 500, got %s', v_bal);
  select stock into v_stock from prizes where id = v_prize;
  assert v_stock = 5, format('cancel should restore stock to 5, got %s', v_stock);
  assert (select status from prize_redemptions where id = v_red) = 'cancelled', 'status should be cancelled';

  -- 不変条件: balance == Σ prize_ledger.delta
  select balance into v_bal from prize_wallets where user_id = alice;
  select coalesce(sum(delta),0) into v_sum from prize_ledger where user_id = alice;
  assert v_bal = v_sum, format('prize balance(%s) must equal ledger sum(%s)', v_bal, v_sum);

  raise notice 'ALL PRIZE ADMIN CHECKS PASSED';
end;
$$;

rollback;
