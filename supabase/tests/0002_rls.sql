-- ============================================================
-- RLS テスト（SPEC-02 §10 末尾 / §7）
-- authenticated ロールでの直接書き込みが効かないこと（書き込みはRPCのみ）。
-- 本番では Supabase が anon/authenticated にテーブル権限を付与し RLS で制御する。
-- ローカルでも同様に権限付与し、RLS が write を遮断することを確認する。
-- ============================================================
begin;

-- Supabase 相当のテーブル権限を authenticated に付与（RLS が最終ゲート）
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- テスト用ユーザーと wallet を用意（postgres= owner なので RLS バイパスで作れる）
do $$
declare v_uid uuid := gen_random_uuid();
begin
  insert into auth.users(id, aud, role, email, created_at, updated_at)
    values (v_uid, 'authenticated','authenticated','rls@test.local', now(), now());
  insert into wallets(user_id, balance) values (v_uid, 1000);
  perform set_config('app.test_uid', v_uid::text, false);
end $$;

-- ここから authenticated として振る舞う
set role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.test_uid'))::text, false);

do $$
declare
  v_uid uuid := current_setting('app.test_uid')::uuid;
  v_before bigint;
  v_after  bigint;
  v_insert_blocked boolean := false;
begin
  -- 自分の wallet は SELECT できる（own wallet ポリシー）
  select balance into v_before from wallets where user_id = v_uid;
  assert v_before = 1000, 'authenticated should read own wallet';

  -- 直接 UPDATE は RLS（UPDATEポリシー不在）で対象0行＝無効
  update wallets set balance = balance + 999999 where user_id = v_uid;
  select balance into v_after from wallets where user_id = v_uid;
  assert v_after = 1000, format('direct wallet UPDATE must have no effect, got %s', v_after);

  -- 直接 INSERT は RLS（INSERTポリシー不在）で拒否される
  begin
    insert into point_ledger(user_id, delta, reason, balance_after)
      values (v_uid, 1000000, 'signup', 1000000);
  exception when others then
    v_insert_blocked := true;
  end;
  assert v_insert_blocked, 'direct point_ledger INSERT must be blocked by RLS';

  raise notice 'ALL RLS CHECKS PASSED';
end;
$$;

reset role;
rollback;
