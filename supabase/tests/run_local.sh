#!/usr/bin/env bash
# ローカル検証ランナー（Docker不要）
# Windows にインストール済みの PostgreSQL バイナリで使い捨てクラスタを立て、
# Supabase スタブ → migrations → テスト を順に流す。
#
# 使い方:
#   PG_BIN="/c/Program Files/PostgreSQL/16/bin" bash supabase/tests/run_local.sh
#
# Supabase 本番/ステージングでは `npx supabase db push` で migrations を適用し、
# テストは `psql "$DB_URL" -f supabase/tests/0001_core_acceptance.sql` で実行する。
set -euo pipefail

PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/16/bin}"
PGDATA="${PGDATA:-/tmp/dmarket_pg}"
PORT="${PORT:-55432}"
DB="dmarket_test"
export PGPASSWORD=postgres

psqlc() { "$PG_BIN/psql.exe" -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }
cleanup() { "$PG_BIN/pg_ctl.exe" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$PGDATA"; mkdir -p "$PGDATA"
"$PG_BIN/initdb.exe" -D "$PGDATA" -U postgres -A trust --encoding=UTF8 >/dev/null 2>&1
"$PG_BIN/pg_ctl.exe" -D "$PGDATA" -o "-p $PORT" -l /tmp/dmarket_pg.log -w start >/dev/null
"$PG_BIN/createdb.exe" -p "$PORT" -U postgres "$DB"

echo "→ stub"; psqlc -f supabase/tests/_local_stub.sql
# 0009_cron はリモート専用（pg_cron/pg_net 必須）のためローカルでは適用しない
for f in 0001_core_tables 0002_lmsr_functions 0003_grant_rpcs \
         0004_trade_rpcs 0005_resolve_rpcs 0006_realtime 0007_supply_resolution \
         0008_market_creation 0010_profiles 0011_leaderboard 0012_admin \
         0013_monetization_antifraud 0014_admin_dashboard 0015_market_creation_fix 0016_line_auth 0017_detail_tabs \
         0022_prize_points 0023_prize_win_reward 0024_prize_admin 0026_affiliate_points; do
  echo "→ migration $f"; psqlc -f "supabase/migrations/$f.sql"
done

echo "→ core acceptance"; psqlc -f supabase/tests/0001_core_acceptance.sql
echo "→ rls";             psqlc -f supabase/tests/0002_rls.sql
echo "→ supply";          psqlc -f supabase/tests/0003_supply.sql
echo "→ leaderboard";     psqlc -f supabase/tests/0004_leaderboard.sql
echo "→ admin";           psqlc -f supabase/tests/0005_admin.sql
echo "→ antifraud";       psqlc -f supabase/tests/0006_antifraud.sql
echo "→ admin dashboard"; psqlc -f supabase/tests/0007_admin_dashboard.sql
echo "→ prize points";    psqlc -f supabase/tests/0008_prize_points.sql
echo "→ prize admin";     psqlc -f supabase/tests/0009_prize_admin.sql
echo "→ affiliate";       psqlc -f supabase/tests/0010_affiliate.sql
echo "ALL TESTS PASSED"
