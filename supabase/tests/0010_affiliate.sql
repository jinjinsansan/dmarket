-- ============================================================
-- 参加ポイント獲得（アフィリエイト成果型 / 0026）受け入れテスト
-- 非管理者拒否 / 案件CRUD / クリック発行(token差込) / 手動承認→参加pt付与 /
-- 二重承認拒否 / 不変条件維持。全てロールバック。
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
  v_offer uuid; r jsonb; v_token uuid; v_bal bigint; v_sum bigint; v_rows int;
begin
  adm := _mku('admin@aff'); alice := _mku('alice@aff');
  insert into admin_users(user_id, role) values (adm, 'admin');

  -- 非管理者は案件作成不可
  perform _jwt(alice);
  begin
    perform admin_upsert_offer(null,'X',null,null,100,'a8','https://x/{TOKEN}',true,true,0);
    assert false, 'non-admin upsert must be rejected';
  exception when others then
    assert sqlerrm = 'not_admin', format('expected not_admin, got %s', sqlerrm);
  end;

  -- 管理者: 案件作成
  perform _jwt(adm);
  v_offer := admin_upsert_offer(null, '○○カード発行', '説明', null, 500, 'a8',
                                'https://px.a8.net/abc?sub_id={TOKEN}', true, true, 0);
  assert v_offer is not null, 'offer should be created';

  -- 不正値は弾く
  begin
    perform admin_upsert_offer(null,'Y',null,null,0,'a8','https://x/{TOKEN}',true,true,0);
    assert false, 'zero reward must raise';
  exception when others then
    assert sqlerrm = 'invalid_reward', format('expected invalid_reward, got %s', sqlerrm);
  end;

  -- alice がクリック発行 → token が URL に差し込まれる
  perform _jwt(alice);
  r := create_affiliate_click(v_offer);
  assert (r->>'ok')::boolean, 'click should succeed';
  v_token := (r->>'token')::uuid;
  assert position(v_token::text in (r->>'url')) > 0, format('url must contain token: %s', r->>'url');
  assert (r->>'url') = 'https://px.a8.net/abc?sub_id=' || v_token::text, format('url subst wrong: %s', r->>'url');

  -- 無効案件はクリック不可（管理者で無効化 → alice でクリック失敗）
  perform _jwt(adm); perform admin_set_offer_active(v_offer, false);
  perform _jwt(alice);
  begin
    r := create_affiliate_click(v_offer);
    assert false, 'inactive offer click must raise';
  exception when others then
    assert sqlerrm = 'offer_unavailable', format('expected offer_unavailable, got %s', sqlerrm);
  end;
  perform _jwt(adm); perform admin_set_offer_active(v_offer, true);

  -- 消し込み待ちクリックに出る
  select count(*) into v_rows from admin_recent_clicks() where token = v_token;
  assert v_rows = 1, 'click must appear in recent_clicks before approval';

  -- 管理者が token を承認 → alice に 500 参加pt 付与（1000→1500）
  r := admin_approve_conversion(v_token);
  assert (r->>'ok')::boolean and (r->>'granted')::bigint = 500, format('approve result wrong: %s', r);
  select balance into v_bal from wallets where user_id = alice;
  assert v_bal = 1500, format('alice balance should be 1500, got %s', v_bal);
  assert exists (select 1 from point_ledger where user_id = alice and reason = 'affiliate' and delta = 500),
         'affiliate ledger row must exist';

  -- 承認後は消し込み待ちから消え、成果履歴に出る
  select count(*) into v_rows from admin_recent_clicks() where token = v_token;
  assert v_rows = 0, 'approved click must leave recent_clicks';
  select count(*) into v_rows from admin_list_conversions() where token = v_token and status = 'approved';
  assert v_rows = 1, 'conversion must appear in list';

  -- 二重承認は弾く
  begin
    r := admin_approve_conversion(v_token);
    assert false, 'double approve must raise';
  exception when others then
    assert sqlerrm = 'already_processed', format('expected already_processed, got %s', sqlerrm);
  end;

  -- 不変条件: balance == Σ ledger.delta
  for alice in select user_id from wallets loop
    select balance into v_bal from wallets where user_id = alice;
    select coalesce(sum(delta),0) into v_sum from point_ledger where user_id = alice;
    assert v_bal = v_sum, format('balance(%s) must equal ledger sum(%s) for %s', v_bal, v_sum, alice);
  end loop;

  raise notice 'ALL AFFILIATE CHECKS PASSED';
end;
$$;

rollback;
