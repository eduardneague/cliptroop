#!/usr/bin/env bash
# End-to-end runs of the live job, the TikTok morning copy (1.19.0),
# Outliers' collector (1.27.0) and clearing notifications (1.29.1): a
# throwaway Postgres database with every migration, PostgREST in front of it
# (what Supabase runs), the app's own code, and fake platform APIs.
#
#   TEST_DB_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/e2e/run.sh
#
# Needs PostgREST: POSTGREST_BIN=/path/to/postgrest, or it downloads v12.2.3
# (Linux x64) into a temporary folder. Uses ports 3001 (PostgREST) and 54399
# (the /rest/v1 proxy). Never point TEST_DB_URL at staging or production: it
# creates and drops a database called vplanner_e2e.
set -euo pipefail

: "${TEST_DB_URL:?Set TEST_DB_URL to an admin connection of a throwaway Postgres}"
case "$TEST_DB_URL" in
  *supabase.co*|*supabase.com*|*pooler*) echo "Refusing: TEST_DB_URL looks like a real Supabase database." >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB=vplanner_e2e
E2E_DB_URL="$(printf '%s' "$TEST_DB_URL" | sed -E 's#^(postgres(ql)?://[^/]+)/[^?]*#\1/'"$DB"'#')"
export E2E_DB_URL
TMP="$(mktemp -d)"
PIDS=()

cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  psql "$TEST_DB_URL" -qAtX -c "drop database if exists $DB with (force)" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

# 1. The database: Supabase's parts (the stub), then every migration.
psql "$TEST_DB_URL" -qAtX -v ON_ERROR_STOP=1 -c "drop database if exists $DB with (force)" >/dev/null
psql "$TEST_DB_URL" -qAtX -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
psql "$E2E_DB_URL" -qX -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/supabase-stub.sql" >/dev/null 2>"$TMP/log"
for f in "$ROOT"/supabase/migrations/*.sql; do
  if ! sed -E '/^create extension if not exists (pg_cron|pg_net)/d' "$f" | psql "$E2E_DB_URL" -qX -v ON_ERROR_STOP=1 >/dev/null 2>"$TMP/log"; then
    echo "✗ $(basename "$f") failed:" >&2
    grep -v NOTICE "$TMP/log" >&2 || true
    exit 1
  fi
done
# PostgREST hands the signed-in person over as request.jwt.claims (JSON): the stub reads that too.
psql "$E2E_DB_URL" -qX -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create or replace function auth.uid() returns uuid language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
create or replace function auth.role() returns text language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', current_user::text) $$;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
SQL
echo "✓ database with every migration"

# 2. PostgREST (the secret is the one the .e2e.ts files sign with) and the /rest/v1 proxy.
BIN="${POSTGREST_BIN:-}"
if [ -z "$BIN" ]; then
  curl -sSL -o "$TMP/pgrst.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz"
  tar -xf "$TMP/pgrst.tar.xz" -C "$TMP"
  BIN="$TMP/postgrest"
fi
cat > "$TMP/pgrst.conf" <<CONF
db-uri = "$E2E_DB_URL"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "e2e-secret-that-is-at-least-32-characters-long"
server-port = 3001
server-host = "127.0.0.1"
db-max-rows = 1000
CONF
"$BIN" "$TMP/pgrst.conf" >"$TMP/pgrst.log" 2>&1 &
PIDS+=($!)
node "$ROOT/scripts/e2e/proxy.cjs" >"$TMP/proxy.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:54399/rest/v1/teams?limit=1" && break; sleep 0.25; done
echo "✓ PostgREST on :3001, proxy on :54399"

# 3. The runs (the app's server-only modules load with the react-server condition).
cd "$ROOT"
# E2E_ONLY="outliers" (any of them, space separated) runs just those.
for t in ${E2E_ONLY:-live tiktok-morning youtube-history outliers notifications}; do
  NODE_OPTIONS=--conditions=react-server npx tsx --tsconfig tsconfig.json "scripts/e2e/$t.e2e.ts"
done
