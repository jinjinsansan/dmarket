-- ============================================================
-- リーダーボード（SPEC-06 §8）受け入れ条件テスト
-- net_worth ランキング・的中率と最低試行・連勝・バッジ一度きり・賞品ゼロ。
-- ============================================================
begin;

create or replace function _mku(p_email text) returns uuid
language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at)
    values (v, 'authenticated','authenticated', p_email, now(), now());
  insert into profiles(user_id, display_name, contact_verified, signup_completed)
    values (v, split_part(p_email,'@',1), true, true);
  insert into wallets(user_id, balance) values (v, 1000);
  return v;
end $$;
create or replace function _jwt(p uuid) returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('sub',p::text)::text, false); end $$;

do $$
declare
  alice uuid; bob uuid;
  cat uuid; mkt uuid; yes uuid; no uuid;
  sa record; sb record;
  v_badge int;
begin
  alice := _mku('alice@x'); bob := _mku('bob@x');

  insert into categories(slug,name) values ('lb','LB') returning id into cat;
  insert into markets(category_id,question,b_param,source,resolution_kind,status,close_time,resolve_time)
    values (cat,'Q',50,'admin','manual','open', now()+interval '1d', now()+interval '2d') returning id into mkt;
  insert into outcomes(market_id,label,display_order) values (mkt,'YES',0) returning id into yes;
  insert into outcomes(market_id,label,display_order) values (mkt,'NO',1) returning id into no;

  -- alice→YES, bob→NO
  perform _jwt(alice); perform buy_shares(yes, 8);
  perform _jwt(bob);   perform buy_shares(no, 8);

  -- 解決 YES（alice 的中 / bob 外し）
  perform resolve_market(mkt, yes, 'src');

  -- 集計
  perform refresh_user_stats();

  select * into sa from user_stats where user_id = alice;
  select * into sb from user_stats where user_id = bob;

  assert sa.resolved_count = 1 and sa.win_count = 1, format('alice should be 1/1, got %s/%s', sa.win_count, sa.resolved_count);
  assert sb.resolved_count = 1 and sb.win_count = 0, format('bob should be 0/1, got %s/%s', sb.win_count, sb.resolved_count);
  assert sa.best_streak = 1 and sa.current_streak = 1, format('alice streak should be 1, got %s/%s', sa.current_streak, sa.best_streak);
  assert sb.best_streak = 0, 'bob streak should be 0';

  -- net_worth ランキング: alice（償還で増）> bob
  assert sa.net_worth > sb.net_worth, format('alice net_worth(%s) should exceed bob(%s)', sa.net_worth, sb.net_worth);

  -- first_win は alice のみ、sharpshooter は最低試行(10)未満なので誰にも付かない
  select count(*) into v_badge from user_badges where user_id = alice and badge_id = 'first_win';
  assert v_badge = 1, 'alice should have first_win';
  select count(*) into v_badge from user_badges where badge_id = 'first_win' and user_id = bob;
  assert v_badge = 0, 'bob should not have first_win';
  select count(*) into v_badge from user_badges where badge_id = 'sharpshooter';
  assert v_badge = 0, 'sharpshooter must require min 10 resolved (none qualify)';

  -- バッジは一度きり（二重付与なし）：再集計しても増えない
  perform refresh_user_stats();
  select count(*) into v_badge from user_badges where user_id = alice and badge_id = 'first_win';
  assert v_badge = 1, 'first_win must be granted once';

  -- 賞品ゼロの担保: balance を増やすRPCは signup/daily/redeem/refund のみ
  -- （リーダーボード由来で wallets を更新する経路が存在しないことを確認）
  assert not exists (
    select 1 from information_schema.routines
    where routine_schema='public'
      and routine_definition ilike '%update wallets%'
      and routine_name in ('refresh_user_stats')
  ), 'leaderboard aggregation must never touch wallets';

  raise notice 'ALL LEADERBOARD ACCEPTANCE CHECKS PASSED';
end;
$$;

rollback;
