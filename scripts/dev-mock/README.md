# dev-mock: the real pages with sample data, no database

A tiny stand-in for Supabase (Auth + the REST API) so the REAL app pages
render locally with sample data: for checking layouts and taking
screenshots. It never touches a real Supabase project.

```bash
# 1. the stand-in database (port 54321); MOCK_LOG=1 prints every query,
#    MOCK_LAYOUT=1 gives the sample user a dashboard with the analytics widgets
node scripts/dev-mock/server.cjs

# 2. the app pointed at it (dummy keys, NEVER the real .env.local)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
SUPABASE_SERVICE_ROLE_KEY=dummy npx next dev -p 3456

# 3. a signed-in screenshot (Playwright): path, file name, width, height, dark, full|view
node scripts/dev-mock/shot.cjs /shorts shorts 1440 900 "" full
```

- `fixtures.cjs`: the sample team, people, shorts, long videos and
  analytics numbers. Rows carry every embedded relation the pages select,
  so one row answers any query on its table.
- `server.cjs`: understands `eq/neq/in/is/gte/lte/gt/lt` filters on plain
  columns, `limit`, ranges and single-row requests; writes are accepted and
  ignored; `rpc/*` answers from `fixtures.rpc`. Filters on embedded tables
  are ignored on purpose.
- `cookie.cjs`: the session cookie (`sb-127-auth-token`) for the sample user.
- Don't stop the server with `pkill -f "node server.cjs"` from a shell whose
  own command line contains that text: stop it by port (`fuser -k 54321/tcp`).
