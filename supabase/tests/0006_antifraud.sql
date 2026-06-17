-- ============================================================
-- マネタイズ・不正対策（SPEC-08 §2/§6）受け入れ条件テスト
-- 「賭博にならない」ことを機能の【不在】として担保する（静的検査）。
-- ============================================================
begin;

do $$
declare
  v_offenders text[];
  v_bad int;
  v_flagged int;
  u1 uuid; u2 uuid; u3 uuid;
begin
  -- (1) wallets.balance を更新する関数は正規ホワイトリストのみ。
  --     （新規ポイントの源は signup/daily/redeem/refund。buy/sell/correct は閉じた経済内の移動）
  select array_agg(p.proname order by p.proname) into v_offenders
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosrc ~* 'update\s+wallets'
    and p.proname not in (
      'grant_signup_bonus','claim_daily_grant','buy_shares','sell_shares',
      'resolve_market','void_market','correct_resolution'
    );
  assert v_offenders is null,
    format('unexpected function(s) update wallets: %s', v_offenders);

  -- (2) 決済（stripe/payment）と wallets を同時に触る関数が存在しない
  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosrc ~* '(stripe|payment|webhook|checkout)'
    and p.prosrc ~* 'wallets';
  assert v_bad = 0, 'no function may touch both payments and wallets';

  -- (3) ポイントの購入/換金/譲渡を示唆する RPC が存在しない
  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname ~* '(transfer|withdraw|cashout|cash_out|exchange|buy_points|purchase_points|topup|top_up|deposit|redeem_to_cash|send_points|gift)';
  assert v_bad = 0, 'no purchase/exchange/transfer point RPC may exist';

  -- (4) grant_entitlement は wallets / point_ledger に一切触れない（隔離）
  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'grant_entitlement'
    and (p.prosrc ~* 'wallets' or p.prosrc ~* 'point_ledger');
  assert v_bad = 0, 'grant_entitlement must not touch points';

  -- (5) entitlements は BET 関連列（points/market/outcome/shares/balance）を持たない
  select count(*) into v_bad
  from information_schema.columns
  where table_schema = 'public' and table_name = 'entitlements'
    and column_name ~* '(point|market|outcome|share|balance|wallet)';
  assert v_bad = 0, 'entitlements must not carry BET-economy columns';

  -- (6) 不正検知: 同一IPに3アカウント → fraud_flags 起票
  u1 := gen_random_uuid(); u2 := gen_random_uuid(); u3 := gen_random_uuid();
  insert into auth.users(id, aud, role, created_at, updated_at) values
    (u1,'authenticated','authenticated',now(),now()),
    (u2,'authenticated','authenticated',now(),now()),
    (u3,'authenticated','authenticated',now(),now());
  insert into account_signals(user_id, signup_ip) values
    (u1,'203.0.113.7'),(u2,'203.0.113.7'),(u3,'203.0.113.7');
  perform detect_fraud_signals(3);
  select count(*) into v_flagged from fraud_flags where rule='shared_ip_cluster';
  assert v_flagged = 3, format('shared IP cluster should flag 3 accounts, got %s', v_flagged);

  -- 冪等: 再実行で二重起票しない（open が既にある）
  perform detect_fraud_signals(3);
  select count(*) into v_flagged from fraud_flags where rule='shared_ip_cluster';
  assert v_flagged = 3, 'detection must not double-insert open flags';

  -- (7) entitlements 付与は wallets を変えない
  perform grant_entitlement(u1, 'theme_dark', null);
  assert not exists (select 1 from wallets where user_id = u1),
    'granting entitlement must not create/modify a wallet';

  raise notice 'ALL ANTIFRAUD/COMPLIANCE ABSENCE CHECKS PASSED';
end;
$$;

rollback;
