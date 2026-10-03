# dev-mock: the real pages with sample data, no database

A tiny stand-in for Supabase (Auth + the REST API) so the REAL app pages
render locally with sample data: for checking layouts and taking
screenshots. It never touches a real Supabase project.

```bash
# 1. the stand-in database (port 54321); MOCK_LOG=1 prints every query,
#    MOCK_LAYOUT=1 gives the sample user a dashboard with the analytics widgets,
#    MOCK_PALETTE=ocean picks a colour theme, MOCK_TT_FIRST=1 a just-connected TikTok,
#    MOCK_WINNERS=0..3 how many thumbnails of long #42 are starred (2 = an A/B test),
#    MOCK_SENT=1 short #231's script already sent to review, MOCK_GLOBE=1 the map
#    widget as a globe of all platforms, MOCK_CURRENCY=EUR the revenue currency,
#    MOCK_STALE=1 analytics last copied 50 h ago (the catch-up starts),
#    MOCK_STATUS_BAD=1 the status page with failed posts, errors and a reconnect
node scripts/dev-mock/server.cjs

# 2. the app pointed at it (dummy keys, NEVER the real .env.local; sample exchange rates)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
SUPABASE_SERVICE_ROLE_KEY=dummy FX_RATES_URL=http://127.0.0.1:54321/fx/latest/USD npx next dev -p 3456

# 3. a signed-in screenshot (Playwright): path, file name, width, height, dark, full|view
node scripts/dev-mock/shot.cjs /shorts shorts 1440 900 "" full

# 4. open every page signed in: status code, time, browser errors, error screens
node scripts/dev-mock/sweep.cjs
```

- `fixtures.cjs`: the sample team, people, shorts, long videos and
  analytics numbers. Rows carry every embedded relation the pages select,
  so one row answers any query on its table.
- `server.cjs`: understands `eq/neq/in/is/gte/lte/gt/lt` filters on plain
  columns, `limit` / `offset` (`.range()` paging), Range headers and
  single-row requests; writes are accepted and ignored (an update answers with
  the rows its filters match, like `update … returning`); `/storage/v1/bucket` lists one bucket; `rpc/*` answers from
  `fixtures.rpc`. Filters on embedded tables are ignored on purpose. Signed
  storage links (`createSignedUrls`) point at generated sample pictures, so
  the Thumbnail Studio shows real-looking thumbnails.
- `cookie.cjs`: the session cookie (`sb-127-auth-token`) for the sample user.
- Don't stop the server with `pkill -f "node server.cjs"` from a shell whose
  own command line contains that text: stop it by port (`fuser -k 54321/tcp`).
