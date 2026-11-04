#!/usr/bin/env bash
# ONE TIME per database (staging, then production): tells the Supabase CLI
# which migrations were already run by hand in the SQL editor, so it only
# ever runs the new ones from then on.
#
#   scripts/db/baseline.sh "<session pooler connection string>" 0062
#
# The second argument is the last migration that database already has
# (default 0062). Nothing in the database itself changes: the CLI only writes
# its own list (supabase_migrations.schema_migrations).
set -euo pipefail

DB_URL="${1:?Usage: scripts/db/baseline.sh <db-url> [last-version-already-run, default 0062]}"
LAST="${2:-0062}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# The Supabase CLI 3 (Nov 2 2026): --remote=<address> names the database, --yes confirms the change.
SUPABASE="${SUPABASE_BIN:-npx --yes supabase@3}"

versions=()
for f in "$ROOT"/supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  if [ "$((10#$v))" -le "$((10#$LAST))" ]; then versions+=("$v"); fi
done
[ "${#versions[@]}" -gt 0 ] || { echo "No migrations up to $LAST." >&2; exit 1; }

echo "Marking ${versions[0]} … ${versions[${#versions[@]}-1]} (${#versions[@]} migrations) as already run."
cd "$ROOT"
$SUPABASE migration repair --status applied "${versions[@]}" --yes --remote="$DB_URL"
$SUPABASE migration list --remote="$DB_URL"
