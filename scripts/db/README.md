# Database changes

Every change to the database is a numbered file in `supabase/migrations`
(`0064_performance.sql` …). The **Database** GitHub Action runs them for you,
so nothing has to be pasted into the SQL editor any more.

## How it runs

| When | What happens |
| --- | --- |
| Every push to `staging` | Staging gets any new migration (dry run first, then for real); if there's none it says "up to date". |
| Every push to `main` | Production gets any new migration — after staging, because that's the order the branches move in. |
| Actions → Database → Run workflow | Run it by hand: pick staging or production, *push* or *baseline*, or *status* to just look. |
| Every push / pull request (CI) | Every migration is run on an empty database to prove it works from scratch, plus the type check, lint, tests and a full build. |

A migration that fails stops right there (each one runs in a transaction) and
the Action turns red, so nothing half-applied is left behind.

## One-time setup

1. **Connection strings.** In each Supabase project: *Connect* → *Session
   pooler* (port 5432 — GitHub can't reach the direct `db.…supabase.co`
   address). Put the database password in it.
2. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   `STAGING_DB_URL` and `PRODUCTION_DB_URL`.
3. **Baseline, once per database.** The CLI doesn't know which migrations you
   already ran by hand. Easiest: open each project's SQL editor and run
   `scripts/db/baseline.sql` (it marks 0001–0062 as run; change 62 to the last
   one you ran by hand). It only writes the CLI's own list, nothing else.
   Or: Actions → Database → Run workflow → `baseline` (this needs the workflow
   file on `main` first, which is why the SQL editor is easier the first time).
   After that, `push` only ever runs what's new. A push to a database that
   isn't baselined is refused (it checks that 0001 is marked as run).

Same thing from your own computer, if you prefer:

```bash
scripts/db/baseline.sh "$STAGING_DB_URL" 0062   # once
npx supabase@2 db push --db-url "$STAGING_DB_URL" --dry-run
npx supabase@2 db push --db-url "$STAGING_DB_URL"
```

## Writing a new migration

* Next number, short name: `0065_what_it_does.sql`.
* Make it safe to run twice (`if not exists`, `create or replace`, `drop … if exists`):
  CI runs the newest migration a second time to check.
* `npm run db:test` runs everything on a throwaway local Postgres
  (`TEST_DB_URL=postgres://postgres:postgres@localhost:5432/postgres`).
