# dev-mock: the real pages with sample data, no database

A tiny stand-in for Supabase (Auth + the REST API) so the REAL app pages
render locally with sample data: for checking layouts and taking
screenshots. It never touches a real Supabase project.

```bash
# 1. the stand-in database (port 54321); MOCK_LOG=1 prints every query,
#    MOCK_LAYOUT=1 gives the sample user a dashboard with the analytics widgets
#    (MOCK_LAYOUT=all: every widget once),
#    MOCK_PALETTE=ocean picks a colour theme, MOCK_TT_FIRST=1 a just-connected TikTok,
#    MOCK_WINNERS=0..3 how many thumbnails of long #42 are starred (2 = an A/B test),
#    MOCK_SENT=1 short #231's script already sent to review, MOCK_DONE=1 its script marked done, MOCK_GLOBE=1 the map
#    widget as a globe of all platforms, MOCK_CURRENCY=EUR the revenue currency,
#    MOCK_STALE=1 analytics last copied 50 h ago (the catch-up starts),
#    MOCK_STATUS_BAD=1 the timer down now (status, developer, Posting), a failed + a late post, Facebook uploading on #234
#    and an Instagram account to reconnect (the status bars always have 3 days of sample history),
#    MOCK_DELAY=1500 every answer that many ms late (to see the loading screens),
#    MOCK_FEEDBACK_FAIL=1 sending a report fails (hourly limit), MOCK_UPLOAD_FAIL=1 report files are refused (413)
#    MOCK_TOUR=1 the sample user hasn't seen Clip's tour yet (it starts on the dashboard),
#    1.27.5: MOCK_SCRIPT=/path/doc.json the first script's document (a TipTap JSON), MOCK_COMMENTS=many comments on every
#    third paragraph of it, MOCK_MEETING=soon the sample meeting 3 hours from the real "now" (Next meeting's answers),
#    MOCK_STRANGER=1 someone on none of the sample user's teams (/u/radu: Invite to team), MOCK_GLASS=1 the glass look,
#    MOCK_DASH_BG=jpg|gif|webm|mp4 a dashboard background of that kind (MOCK_DASH_BG_FILE=/path/to/file serves it, else a
#    drawn dusk; MOCK_DASH_BG_DIM=0..80); uploads (storage.upload) and copies are accepted, MOCK_UPLOAD_FAIL=1 refuses them,
#    1.28.0: MOCK_GLASS_STYLE=liquid, MOCK_GLASS_SCOPE=everywhere, MOCK_GLASS_SIDEBAR=1, MOCK_GLASS_LEVEL=0..100 (with
#    MOCK_GLASS=1); MOCK_WALLPAPERS=1..3 saved wallpapers and MOCK_WALL_LUMA=0..100|null how bright the one in use is (with
#    MOCK_DASH_BG); MOCK_PROFILE_FRAME=glow|orbit|… edu's picture frame, MOCK_PROFILE_BG=1 his wallpaper behind his profile,
#    MOCK_PRIVATE=maria|radu that profile is private; profile_stats and get_visible_teams answer from the fixtures;
#    MOCK_WRITES=profile_wallpapers,profiles remembers adding, switching and removing wallpapers (deletes too),
#    MOCK_USER=2 (3, 4) signed in as Maria (Andrei, Ioana), not a master (set it for shot.cjs too),
#    MOCK_NOTIFS=0 no notifications (otherwise 13 over the last 12 days, for the bell and its History),
#    MOCK_FILES=1 an uploaded video on every short past Script (the Video files card shows the total),
#    MOCK_VIDEO=/path/to/any.mp4 the file those videos play (Posting card preview, review player;
#    use a .webm for Playwright: its Chromium can't play H.264),
#    MOCK_FB_ANALYTICS_ONLY=1 the Facebook Page connected before posting existed (no pages_manage_posts),
#    MOCK_NO_COMMENT=1 the server says the sample user may not comment on scripts (can_comment_script),
#    MOCK_FB_NO_EARNINGS=1 the Facebook Page isn't in Content Monetization (no Facebook earnings in Revenue),
#    MOCK_POSTS=1 a busy posting week around the real "now" (Posting's filters, the Posting today widget),
#    MOCK_USAGE_FULL=1 the developer's Usage page with the database nearly full (Free plan),
#    MOCK_TEAM_TASKS=team (or masters) the team shares everyone's tasks (My tasks → Team),
#    MOCK_WRITES=table1,table2 those tables keep what's inserted / updated (daily_word_plays always does),
#    MOCK_OBJECTIVES=1 eight objectives with 12 weeks of shorts and a year of long videos around the real "now"
#    (objectives.cjs; extra shorts and long videos appear on the other pages too), MOCK_CHEER=1 their wins of the
#    last two days not seen yet (the "While you were away" card), MOCK_LAYOUT=objectives the Objectives widget at
#    MOCK_OBJ_SIZE=6x3 (columns x rows; MOCK_OBJ_SHOW=week one cadence, MOCK_OBJ_IDS=1,2 picked objectives),
#    MOCK_PROJECTIONS=1 (with MOCK_OBJECTIVES=1) eight projections with a value per day since each was set
#    (projections.cjs: running, reached, ended, money), MOCK_SWITCHED=1 the Facebook Page replaced 5 days ago
#    (Analytics says whose numbers it shows), MOCK_LIVE=0 no live counts yet (Realtime waits for its first reads),
#    MOCK_LIVE_FRESH=1 realtime started 3 hours ago, MOCK_NO_REACH=1 no impressions / CTR yet (the YouTube
#    Reporting API isn't on: Analytics says so),
#    Outliers (1.27.0, outliers.cjs): a sample of ~2,200 tech videos and the Explore niches, made by
#    `npx tsx scripts/dev-mock/make-outliers.ts` (writes scripts/dev-mock/.outliers.json, git-ignored; restart
#    the server after), MOCK_OUTLIERS_EMPTY=1 the team has no niche yet (Explore and the setup card),
#    MOCK_OUTLIERS_NEW=1 its niche was just added (collecting), MOCK_OUTLIERS_ACCESS=0 no way to read YouTube
#    Always on: Analytics' realtime (live.cjs: the last ~56 hours of counts around the real "now",
#    every 10 minutes for the busiest videos; 0084's 10-minute slots and top content work out the
#    same way as the database), YouTube's impressions and CTR per day (Shorts and long videos apart),
#    the app search's `global_search` (empty: its videos come from searchVideos), and Analytics → Advanced's sample numbers (advanced.cjs: splits, retention curves, each video's
#    money, more videos per platform with patterns to find, hooks in their scripts; 1.21.0: the channel's
#    whole-life windows (span 0) and views by country for every window, and the 12 newest YouTube videos'
#    own splits for their pages' Reach and Audience tabs; YouTube's per-video days carry subscribers, the
#    average view and impressions). Calls to YouTube itself (a video's details, Revenue's videos of a day)
#    fail in the mock: the pages show their error or waiting states; with MOCK_FILES=1 the
#    versions have a frames_path (the mock has no image for it: stub `**/storage/v1/object/**/video-frames/**`
#    and `**/api/analytics/thumb**` with page.route in Playwright to test Download for Claude's PDF).
node scripts/dev-mock/server.cjs

# 2. the app pointed at it (dummy keys, NEVER the real .env.local; sample exchange rates)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
SUPABASE_SERVICE_ROLE_KEY=dummy FX_RATES_URL=http://127.0.0.1:54321/fx/latest/USD npx next dev -p 3456

# 3. a signed-in screenshot (Playwright): path, file name, width, height, dark, full|view
#    (with MOCK_OBJECTIVES=1 the analytics numbers run up to the real "now": better for Analytics shots)
node scripts/dev-mock/shot.cjs /shorts shorts 1440 900 "" full

# 4. open every page signed in: status code, time, browser errors, error screens
node scripts/dev-mock/sweep.cjs

# 5. Outliers' tabs and panels on a phone, a laptop and a big screen (thumbnails are drawn from the sample's
#    colours: YouTube's images can't load here); SHOT_FONTS=<folder with @fontsource-variable/{fraunces,inter}>
#    when Google Fonts can't be reached
node scripts/dev-mock/outliers-shot.cjs /tmp/shots "" --size=phone [--dark] [--view]
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
