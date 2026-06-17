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
for f in supabase/migrations/0001_core_tables 0002_lmsr_functions 0003_grant_rpcs \
         0004_trade_rpcs 0005_resolve_rpcs 0006_realtime; do
  base="supabase/migrations/$(basename "$f").sql"
  echo "→ migration $(basename "$f")"; psqlc -f "$base"
done

echo "→ core acceptance"; psqlc -f supabase/tests/0001_core_acceptance.sql
echo "→ rls";             psqlc -f supabase/tests/0002_rls.sql
echo "ALL TESTS PASSED"
