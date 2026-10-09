# Building ClipTroop

The conventions every feature follows. The README is the front door; this
is the workshop. The full history (every migration, every release) lives in
`VPLANNER_HANDOFF.md`.

## Running it

```bash
npm install
cp .env.example .env.local   # the STAGING project's values, never production
npm run dev                  # http://localhost:3000
```

Accounts are created by a team owner (invites) or in the Supabase
dashboard; there's no public sign-up. For real pages with sample data and
no database at all, use the stand-in Supabase in `scripts/dev-mock/`.

## Branches, CI and migrations

- `staging` deploys to staging.cliptroop.com, `main` to app.cliptroop.com.
  Merge with a pull request staging → main, "Create a merge commit" (never
  squash), and never delete `staging`.
- Every push runs **CI**: type check, lint, `npm test`, a production build,
  and every migration on an empty database.
- Files in `supabase/migrations/` run in order on both Supabase projects.
  The **Database** GitHub Action applies them (push to `staging` → staging,
  push to `main` → production); see `scripts/db/README.md`. A migration
  ships in the same push as the code that needs it. Migrations are additive:
  expand now, contract in a later release. Personal one-off SQL goes in
  `supabase/scratch/` (gitignored).

## Security model (read before adding features)

- **RLS is the real boundary.** Every table has Row Level Security. The UI
  hiding a button is convenience, never protection.
- **Users can only edit columns they genuinely own.** Since migration 0022,
  column-level grants restrict what a signed-in user can UPDATE. A new
  editable column needs its own `grant update (col) on … to authenticated`.
- **Admin client golden rule.** `createAdminClient()` bypasses RLS. Use it
  only in server actions, only after checking the caller is allowed, and
  only with values the user could NOT have edited themselves.
  `import "server-only"` makes the build fail if it ever reaches the browser.
- **Notifications are server-created only**: always `sendNotifications()`
  in `lib/notify.ts`.
- **Never trust a teamId from the browser for a privileged action.** Derive
  the team from the row being acted on (see `requireProjectMaster`).
- **Database triggers enforce the invariants:** only a Master changes a
  project's stage; projects never change team; the owner can't be removed
  and is always Master; only the owner grants or removes Master.

## Timers and daily jobs

Supabase's pg_cron is the only clock. Each job calls the app through
`posting_call()` (pg_net) at `/api/cron/posting`, with the cron secret and,
when set, Vercel's protection bypass:

| Job | When | Body | What it does |
|---|---|---|---|
| `vplanner-posting` | every minute, when something is due | `{}` | posts, meeting reminders |
| `vplanner-status` | every 10 minutes | `{"status": true}` | the status page's hourly bars, alerts |
| `vplanner-cleanup` | 03:30 UTC | `{"job": "cleanup"}` | deletes posted shorts' video files after the team's choice, refreshes sign-ins |
| `vplanner-analytics` | 05:10 UTC | `{"job": "analytics"}` | copies every team's numbers |

Vercel Cron isn't used (it only runs on the production deployment). The
daily jobs live in `lib/daily-jobs.ts`; `/api/cron/cleanup-media` and
`/api/cron/analytics` run them by hand.

## Times, dates and the browser (no React #418)

The server renders in UTC; people don't. A client component that shows a
date or time while rendering must look exactly like the server's HTML until
the page is live, or React throws that part away (production error #418).

- Dates and numbers are always formatted in the app's language: `"en-US"`,
  never `undefined` (the browser's language would differ from the server's).
- Times in the viewer's zone: `useLocalFormat()` (`lib/hooks/use-hydrated.ts`)
  formats like the server first, then locally. `<Ago>` and `<LocalTime>`
  already do this.
- Anything else that depends on the device (the current minute, "today",
  its time zone): render it after `useHydrated()` is true, with a
  placeholder of the same shape before (see `SchedulePanel`).
- Things that only appear after a click (dialogs, menus) are fine as they are.
- To check: run the preview server with `TZ=UTC` and a browser in another
  zone and language (e.g. `Pacific/Kiritimati`, `ro-RO`).

## Performance conventions (follow these for every new feature)

**Database**
- Every new column you filter, join or sort by gets an index in the same
  migration. Postgres does NOT index foreign keys automatically.
- Read (SELECT) policies check membership with the set helpers, never a
  per-row function: `team_id in (select my_team_ids())`,
  `project_id in (select my_project_ids())`,
  `recipient_id = (select auth.uid())`, masters with
  `team_id in (select my_master_team_ids())`. The `(select …)` wrapper makes
  Postgres evaluate it once per query instead of once per row.
- Never write a single `FOR ALL` policy: split into insert / update /
  delete so reads don't pay for write checks.
- Select only the columns a screen needs; filter child rows in the query.

**Server (pages & actions)**
- Independent queries go in ONE `Promise.all`, never awaited one by one.
- Don't wait for your roles before loading what doesn't depend on them:
  read it in the same batch as `getMembership()` and drop it afterwards for
  people who can't see it (see `app/(dashboard)/team/page.tsx`).
- A promise started early and awaited later gets `.catch(() => {})` right
  away, so an early failure isn't reported twice.
- Anything two places in the same request need is wrapped in React
  `cache()` (`modules/long-videos/lib/queries.ts`, `lib/supabase/get-user.ts`).
- `getCachedUser()` reuses the identity middleware already verified.
  Security-sensitive server ACTIONS still call `supabase.auth.getUser()`.

**Client**
- Call server actions through `useAction()` (`lib/hooks/use-action.ts`):
  consistent toasts, and an `optimistic` hook paired with `useOptimistic`.
- Realtime handlers patch the exact rows that changed (see
  `notification-bell.tsx`) or debounce `router.refresh()`.
- Every route has a `loading.tsx` built from `components/ui/skeleton.tsx`.
  Same-page navigations use `PendingNav` / `PendingLink` / `PendingSwap`
  (`components/ui/pending-nav.tsx`).
- Images: upload through `compressImage()` with an `IMAGE_PRESETS` entry
  and `UPLOAD_CACHE_CONTROL`; render with `loading="lazy" decoding="async"`.

## UI conventions

- **Breakpoints:** `lib/breakpoints.ts` (sm 640, md 900 = the sidebar
  appears, lg 1180, xl 1400, 2xl 1600) is Tailwind's `screens` and what code
  passes to `matchMedia` (`minWidth("lg")`). Never hard-code a width.
- **Icons:** SVG components from `components/ui/icons.tsx` only, never
  Unicode symbols (iOS renders many as emoji).
- **Stage colours mean state, not identity:** `stageState()` +
  `STAGE_STATE_COLOR` (orange = current, teal = done, neutral = upcoming).
- **Overlays that must escape the header** render through a portal on
  `document.body` (the sticky header's `backdrop-blur` traps fixed children).
- **People link to profiles** via `profileHref()` / `MemberAvatarLink` /
  `MemberNameLink`.
- **Roles next to a name:** `<RolePills roles={…} />` (max 2 + "+N").
- **Colour themes** (Settings → Preferences) apply inside the app only. The
  brand pages (home, sign-in, status, legal, invite and password pages,
  `BRAND_PAGES_RE` in `lib/public-pages.ts`) always wear the brand colours;
  light and dark still follow the person.
- **Moments worth a celebration:** `<DoneBurst title subtitle />` with
  `sounds.celebrate()`, for something finished, not every save.
- **Destructive or hard-to-undo clicks ask first:** `useConfirm()` (or
  `useConfirmSafe()` outside the app shell) with `danger: true`. Clearing a
  date uses `CLEAR_DATE_CONFIRM`; marking anything done or posted uses
  `markDoneConfirm(text)`; every Post now asks.

## Status, errors and alerts (who sees what)

- **`/status`** (public): is the app as a whole working. Levels only, never
  details. History: `status_samples` (0067), written every 10 minutes.
  Never pass `detail` to the page's client parts.
- **`/developer`** (developer accounts only, else 404): errors with Mark
  fixed, every check in full, the reason per hour, incidents, reports, the
  last status call and why it failed.
- **Developers** = `DEVELOPER_EMAILS`, else the owner of the first team
  (`developers()` / `isDeveloper()` in `lib/errors.ts`). Only they get
  app-wide alerts.
- **One team's problems** (a failed post, an account to reconnect) go on
  that team's Posting page, never app-wide.
- A dropped connection isn't an error (`lib/network-noise.ts`).
- **Reports** (Settings → Account): `submit_feedback()` (0068), files in the
  private `feedback` bucket. Only developers see them.

## Features with their own rules

**Home page and sign-in.** `/` is `components/landing/` (signed in →
`/dashboard`). Each scene is a small looping demo in HTML/CSS
(`vignettes.tsx`); demos only run on screen (`<Play>` sets `data-on`), and
the base styles are the finished frame, so animations off still reads.
`/login` honours `?next=` (same-site paths only). Link previews:
`public/og-image.png` + `publicMetadata()` in `lib/public-pages.ts`. Tab icon: `icons` in `app/layout.tsx` (keep every
entry listed: a config `icons` replaces the automatic one).

**Clip's tour.** `components/tutorial/tutorial.tsx`: starts once per person
on `/dashboard` (`profiles.tutorial_done_at`, 0069); Settings → Account →
"Show me around again" or `/dashboard?tour=1` replays it. Steps point at
`data-tour="…"` anchors (`nav-<path>`, `nav-more`, `search`, `bell`,
`settings`): keep them when moving those, and add a step (computer and
phone) for a new main area.

**Notifications.** The bell shows the latest 25 and patches itself from
realtime. History (in the bell's header) loads the last 2 weeks, 40 at a
time, through `getNotificationHistory()`.

**Video files.** Shorts' uploads (bucket `review-videos`) are deleted by the
nightly clean-up once a short is posted everywhere, after the team's choice
(`teams.media_keep_days`: 7, 14, 21 or 30 days; Team → Defaults → Video
files; 0070). The short itself always stays. Code: `lib/media-cleanup.ts`.

**Posting.** One `social_posts` row per short and platform (YouTube,
Instagram, Facebook, TikTok), moved forward one step at a time by
`lib/social/worker.ts`; each platform's steps live in
`lib/social/publishers/<platform>.ts` and save their progress in `state`
after every step (a timeout never loses work). Platforms never post for
each other: Instagram doesn't share API posts to Facebook, so Facebook is its
own post (a Reel on the team's Page, `pages_manage_posts`). A permission
added after people connected (YouTube's edit scope, Facebook's posting) is
never required to connect: the account card asks to reconnect and the
Posting card refuses until it's there. The Posting card always has the exact
file that gets posted (`post-video-preview.tsx`): a closed bar, Watch opens the
review player. How long a
short may be per platform lives in `lib/short-length.ts` (used by the cards and
by the server before scheduling).
The Posting page reads unfinished posts (soonest first) and the latest 100
published ones separately, then `posting/post-sections.tsx` filters them in
the browser (platform, #number/title, day). Platform chips everywhere are
`modules/short-videos/components/platform-filter.tsx` (also the dashboard's
Posting today widget, `compact`).

**Developer accounts.** `isDeveloper(user)` (lib/errors.ts) compares the
email the person is signed in with (the verified session, never the copy in
profiles) with `DEVELOPER_EMAILS`. No list: nobody in production; staging and
your computer fall back to the first team's owner. Every developer page and
action checks it itself. `/developer` has tabs (Overview, Usage, Problems,
Status; only the open one loads); Usage reads `developer_usage()` (0075,
service role only). `SUPABASE_PLAN=pro` switches the limits it measures against.

**Team tasks.** `tasks` stay readable by their owner, plus everyone's in a team
whose `tasks_visibility` (0076: own / masters / team) allows it
(`shared_task_team_ids()`). So queries for "my tasks" must filter by
`user_id` themselves (listMyTasks, listDone do).

**Daily word.** `lib/word/` (answers and valid guesses are server-only;
`score.ts` is shared). Plays (`daily_word_plays`, 0077) are written only by the
server after checking a guess (`modules/word/lib/state.ts`); people read their
own; `daily_word_team()` gives teammates' tries. The day is the team's time
zone. Finished plays count on the contribution grid (listDone).

**Revenue.** `analytics_revenue_daily` holds what the sync copies: YouTube's
estimate (with Shorts/long and stream splits) and, since 0074, a Facebook
Page's Content Monetization earnings (`platform = 'facebook'`, content
`all`). Meta's value shape isn't documented well, so
`modules/analytics/lib/fb-money.ts` reads any of them (tests/fb-money.test.ts).
TikTok and Instagram have no earnings API: masters add those by hand
(`revenue_entries`).

**Who may change what.** Dates (Calendar moves, long video dates): masters and
schedulers, enforced in the database (shorts' functions, 0073 for long videos).
Script comments and editing ideas: the video's scripters, its Review/Staging
people and masters (`can_comment_script`, 0072); the rest of the team reads.

**Forms.** Don't use `<form action={…}>` for anything that can fail: React 19
empties every uncontrolled box after the action, error or not. Use onSubmit +
`startTransition(() => formAction(fd))` (or controlled inputs), and answer
every save with a toast (it plays the sound).

**Search.** `global_search()` (0024) is SECURITY INVOKER on purpose: RLS
decides what anyone can find. To make something searchable, add a trigram
index on `lower(column)`, a section in the function, then a section in
`components/search/global-search.tsx`.

**Short videos.** Script → Editing → In review → Ready to post → Posted.
"Posted" follows `short_video_posts` (every planned platform marked).
`short_guard_update` (0026) decides who may change which field;
`modules/short-videos/lib/permissions.ts` mirrors it for the UI. History is
written only by triggers; numbers come from `next_team_number()`.

**Scheduling queue (0027).** Auto-dated shorts are dated by the database
(`recalc_short_queue`). The app only sets `planned_date` (a pin) or
`schedule_mode = 'auto'`, and reorders through `move_short()`.
