#!/usr/bin/env bash
# Runs every migration, in order, on an EMPTY Postgres database, then runs the
# newest one a second time (a migration that stopped halfway must be safe to
# run again).
#
#   TEST_DB_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/db/test-from-scratch.sh
#
# Uses supabase/tests/supabase-stub.sql in place of Supabase's own parts
# (sign-in, files, timers). Never point this at staging or production: it
# creates and drops a database called vplanner_scratch.
set -euo pipefail

: "${TEST_DB_URL:?Set TEST_DB_URL to an admin connection of a throwaway Postgres}"
case "$TEST_DB_URL" in
  *supabase.co*|*supabase.com*|*pooler*) echo "Refusing: TEST_DB_URL looks like a real Supabase database." >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB=vplanner_scratch
# Same server, the scratch database instead of the one in the URL.
SCRATCH_URL="$(printf '%s' "$TEST_DB_URL" | sed -E 's#^(postgres(ql)?://[^/]+)/[^?]*#\1/'"$DB"'#')"
LOG="$(mktemp)"

cleanup() {
  psql "$TEST_DB_URL" -qAtX -c "drop database if exists $DB with (force)" >/dev/null 2>&1 || true
  rm -f "$LOG"
}
trap cleanup EXIT

psql "$TEST_DB_URL" -qAtX -v ON_ERROR_STOP=1 -c "drop database if exists $DB with (force)" >/dev/null
psql "$TEST_DB_URL" -qAtX -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
psql "$SCRATCH_URL" -qX -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/supabase-stub.sql" >/dev/null 2>"$LOG"

apply() {
  # pg_cron / pg_net only exist on Supabase: the stub stands in for them.
  if ! sed -E '/^create extension if not exists (pg_cron|pg_net)/d' "$1" \
    | psql "$SCRATCH_URL" -qX -v ON_ERROR_STOP=1 >/dev/null 2>"$LOG"; then
    echo "✗ $(basename "$1") failed${2:+ ($2)}:" >&2
    grep -v -E 'NOTICE:' "$LOG" >&2 || true
    exit 1
  fi
}

files=("$ROOT"/supabase/migrations/*.sql)
for f in "${files[@]}"; do apply "$f"; done
echo "✓ ${#files[@]} migrations applied to an empty database"

last="${files[${#files[@]}-1]}"
apply "$last" "second run"
echo "✓ $(basename "$last") is safe to run twice"
