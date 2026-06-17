-- ============================================================
-- 管理ダッシュボード（SPEC-07 §2/§4/§5）テスト
-- KPI・フィード現況(gap)・カテゴリ/テンプレ CRUD・非管理者拒否。
-- ============================================================
begin;

create or replace function _mku(p_email text) returns uuid
language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at)
    values (v,'authenticated','authenticated',p_email,now(),now());
  insert into wallets(user_id, balance) values (v, 1000);
  return v;
end $$;
create or replace function _jwt(p uuid) returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('sub',p::text)::text, false); end $$;

do $$
declare
  adm uuid; alice uuid; cat uuid; tpl uuid;
  k jsonb; ov record; n int;
begin
  adm := _mku('admin@x'); alice := _mku('alice@x');
  insert into admin_users(user_id) values (adm);
  insert into categories(slug,name,display_order) values ('news','News',1) returning id into cat;

  -- 非管理者は KPI を取れない
  perform _jwt(alice);
  begin
    perform admin_kpis();
    assert false, 'non-admin must be rejected';
  exception when others then
    assert sqlerrm = 'not_admin', format('expected not_admin, got %s', sqlerrm);
  end;

  perform _jwt(adm);

  -- フィード設定を入れると overview の to_generate に反映（target10/poly_max15/poly_min3 → 10）
  perform upsert_feed_settings(cat, 10, 3, 15, 20, '{}'::int[], 'volume_24hr', false, 'balanced');
  select * into ov from admin_feed_overview() where category_id = cat;
  assert ov.target_active = 10, 'overview should reflect target_active';
  assert ov.to_generate = 10, format('empty news should want 10 poly, got %s', ov.to_generate);

  -- KPI: users_count=2, active_markets=0
  k := admin_kpis();
  assert (k->>'users_count')::int = 2, format('users_count should be 2, got %s', k->>'users_count');
  assert (k->>'active_markets')::int = 0, 'no markets yet';

  -- カテゴリCRUD: 並び替え更新
  perform upsert_category(cat, 'news', 'ニュース', 5, true);
  assert (select display_order from categories where id=cat) = 5, 'category should be reordered';

  -- テンプレCRUD
  tpl := upsert_template(null, cat, 'BTCしきい値', 'BTCは{date}に{th}を超えるか',
    '{"date":"today"}'::jsonb, '0 9 * * *',
    '{"kind":"price_threshold","feed":"crypto"}'::jsonb, '{"source":"flat"}'::jsonb, true);
  select count(*) into n from market_templates where id = tpl;
  assert n = 1, 'template should be created';
  perform delete_template(tpl);
  select count(*) into n from market_templates where id = tpl;
  assert n = 0, 'template should be deleted';

  raise notice 'ALL ADMIN DASHBOARD CHECKS PASSED';
end;
$$;

rollback;
