# e2e: the live job against a real database

`run.sh` builds a throwaway Postgres database with every migration (and the
stand-in for Supabase's own parts, `supabase/tests/supabase-stub.sql`), puts
PostgREST in front of it the way Supabase does, and runs the app's own code
against it with fake YouTube, TikTok, Instagram and Facebook APIs:

- `live.e2e.ts`: the 10-minute live job (1.19.0, `modules/analytics/lib/live.ts`):
  a full pass that finds every video, the next call reading only the hot
  ones, what teammates (and only they) see through `analytics_live_gains` /
  `analytics_live_hours`, the reach reports (impressions and CTR), a TikTok
  pass that runs out of time and goes on from its cursor, Instagram, Facebook
  (a Reel kept as a Page post isn't added twice), `LIVE_MINUTES`, and the
  note when the YouTube Reporting API is off. Through PostgREST as a teammate
  (1.20.0, 0084): `analytics_live_buckets` (10-minute slots adding up to the
  last hour's gains) and `analytics_top_content` (platforms as a JSON array;
  nothing for someone else's team).
- `tiktok-morning.e2e.ts`: the morning copy reading every TikTok and working
  out yesterday's views video by video.
- `youtube-history.e2e.ts` (1.21.0, 0085): the morning copy going back a year
  per report to the channel's first day (Lifetime starts on the first day with
  views; days YouTube leaves out are zeros; Shorts vs long, money and the
  per-day splits go back too; the next copy doesn't ask again), the whole-life
  window snapshots (countries), a video's own splits and days for its page,
  the videos behind a day's revenue, `analytics_sync_now` through PostgREST
  (masters and schedulers only), and another account starting the history
  over.

```bash
TEST_DB_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/e2e/run.sh
```

It needs PostgREST: `POSTGREST_BIN=/path/to/postgrest`, or it downloads
v12.2.3 for Linux x64 from GitHub. Ports 3001 and 54399. It creates and drops
a database called `vplanner_e2e`: never point `TEST_DB_URL` at staging or
production (it refuses Supabase addresses). Not part of CI (CI has no
PostgREST); run it after changing the live job, the morning copy, 0083, 0084
or 0085.
