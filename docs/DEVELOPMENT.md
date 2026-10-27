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
- Every push runs **CI**: type check, lint, `npm test`, the vulnerability
  gate, a production build (which runs the gate first too, as Vercel's
  does), and every migration on an empty database, followed by the access checks in
  `supabase/tests/*.test.sql` (plain SQL that signs in as different people
  and raises when someone can read or write what they shouldn't; start with
  `objectives.test.sql`). Run it yourself with `npm run db:test` and a
  throwaway Postgres (`TEST_DB_URL`).
- Not in CI: `scripts/e2e/run.sh` runs the live job and the TikTok morning
  copy end to end (every migration, PostgREST like Supabase, fake platform
  APIs; see `scripts/e2e/README.md`). Run it after changing either, or 0083.
- Files in `supabase/migrations/` run in order on both Supabase projects.
  The **Database** GitHub Action applies them (push to `staging` → staging,
  push to `main` → production); see `scripts/db/README.md`. A migration
  ships in the same push as the code that needs it. Migrations are additive:
  expand now, contract in a later release. Personal one-off SQL goes in
  `supabase/scratch/` (gitignored).
- Supabase runs migrations as `postgres`, which isn't a superuser (CI's empty
  database runs them as one, so it can't catch this). A function with
  `set pg_trgm.…` is refused there unless pg_trgm is loaded earlier in the
  same migration: call one of its functions first (0089, section 7). The
  from-scratch check refuses a new migration that doesn't.

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
- **Every server action and API route checks who's asking (1.31.12)**:
  `auth.getUser()` (actions that decide something), `getMembership()` /
  `requireMaster()` / `requireSocialManager()` / `requireProjectMaster()`
  for a team or a role, `requireDeveloper()` / `isDeveloper()` for the
  developer's pages, `teamForRequest()` in Analytics' routes,
  `cronAuthorized(header, process.env.CRON_SECRET)` (`lib/cron-auth.ts`)
  for scheduled jobs. One that leaves it to the database (RLS, or a
  database function that checks the role) is listed in
  `tests/access.test.ts` with the reason, and may not use the service key;
  the test fails for a new action or route with neither.
- **The app's own addresses (1.31.13):** a write (POST, PUT, PATCH,
  DELETE) to `/api/*` from another site is turned away by the middleware
  (`crossSiteWrite`, `lib/request-guard.ts`: Origin, else
  Sec-Fetch-Site), except `/api/cron/*` (the timer's secret) and
  `/api/auth/*`. No route sends CORS headers. Anything that costs per call
  (reads another site, asks a platform, sends a notification or an email)
  takes `overLimit(bucket, user.id, max, windowMs)` (`lib/rate-limit.ts`,
  per server instance) and answers 429. There are no inbound webhooks: a
  new one verifies the sender's signature (constant time) before reading
  the body, and goes in `tests/api.test.ts`' list of routes that take
  writes.
- **Database triggers enforce the invariants:** only a Master changes a
  project's stage; projects never change team; the owner can't be removed
  and is always Master; only the owner grants or removes Master; a team's
  default people (shorts and long videos) are active members of that team.
- **The database's own locks (1.31.14, 0107):** someone who isn't signed
  in (anon) has no rights on any table, sequence or function in `public`.
  Postgres still gives every NEW function to everyone, so each migration
  ends a function with `revoke all on function f(…) from public, anon;`
  and `grant execute … to authenticated` (and/or `service_role`) as it
  needs; a trigger function or a helper only other definer functions call
  needs no grant at all. Signed-in people never get TRUNCATE, TRIGGER or
  REFERENCES; a table with no row rules (the server's only) gets
  `revoke all on … from anon, authenticated`. Views read past RLS, so
  there are none (use a function that checks). A SECURITY DEFINER
  function always has `set search_path = public`. No rule is `using
  (true)`. `supabase/tests/database-locks.test.sql` fails for any of these,
  on every table and function, new ones included.
- **Forms and what's shown (1.31.15):** text people type is checked on
  the server (type and length, with a message: `tooLong` and
  `FORM_LIMITS` in `lib/form-limits.ts`), and every text column a
  signed-in person can write has a CHECK limit in the database (0108;
  `supabase/tests/form-limits.test.sql` fails for a new one without).
  React escapes text and blocks `javascript:` in `href` / `src`; raw HTML
  (`dangerouslySetInnerHTML`, `innerHTML =`, `document.write`) and
  addresses opened in code (`window.open`, `location.assign` …) are only
  in the files `tests/forms.test.ts` lists, each with why it's safe: a
  new one escapes what it shows (`escapeHtml`) and opens only a web
  address (`webUrl`, `pictureSrc`) or the app's own page. Spreadsheet
  exports go through `csvText` (`lib/csv.ts`), which keeps a would-be
  formula as text.
- **What a page may run (1.31.16):** every page carries a Content
  Security Policy with a new nonce (`lib/csp.ts`, sent by the middleware;
  Next.js puts the nonce on its own scripts). A `<script>` of the app's own
  takes `nonce={(await headers()).get("x-nonce")}`; a library loaded by the
  app's code (`document.createElement("script")`) is fine ('strict-dynamic'),
  but nothing from another site is put straight into a page. A new kind of
  source (another site's script, a websocket elsewhere) goes into
  `buildCsp` and `tests/headers.test.ts`. No page is built ahead of time
  (`force-static`, `revalidate`): its scripts would carry an old nonce. HTML
  written by hand in a route sets its own `Content-Security-Policy`.
  Emergency only: `CSP_MODE=report-only` (or `off`) in Vercel, redeploy.
- **Profiles (1.31.14):** the `profiles` table shows you your own row,
  everyone on (and who was on, `team_past_members`) a team you're on, the
  people with a live invite to a team you're a Master of, and whoever
  invited you (`visible_profile_ids()`). For anyone else use
  `profile_card(handle)` (a profile page's card, no email or settings),
  `people_to_invite(team, term)` (Team → Invite people) or `search_people`
  (inside `global_search`). An email is never sent to someone who can't see
  that profile, and finds someone only when typed in full.
- **Passwords (1.31.10):** chosen in three places only: `/set-password`
  (an invite's first step), `/reset-password` (a reset link) and Settings →
  Account → Password (`changePassword` in `settings/account-actions.ts`).
  All three use `lib/auth/password-rules.ts` (`checkPassword`: 8 characters
  or more, 72 bytes at most, not common or a run, not the person's email
  or name; `passwordSaveError` for Supabase's answers) and
  `<NewPasswordFields>` (`components/ui/new-password.tsx`, the checklist).
  Only a session that came from an email link (the token's `amr`:
  `fromEmailLink`) chooses one without the current password; changing it
  in Settings checks the current one with the sign-in limits (0105) and
  signs in again first (a fresh session, which Supabase's "Secure password
  change" wants). Supabase signs out every other session on any password
  change (they stop when their access token runs out, up to an hour).
  `tests/password-rules.test.ts` fails if a fourth place calls
  `updateUser({ password })`.
- **Sessions (1.31.11):** Log out is this device only (`signOutHere()` in
  `app/(dashboard)/actions.ts`: `signOut({ scope: "local" })`; supabase-js
  signs every device out by default, so never call `auth.signOut()` bare).
  Settings → Account → Sign out everywhere else is `signOutElsewhere()`
  (`scope: "others"`). A device signed out from elsewhere, or by a new
  password, also stops getting notifications (`forgetOtherDevices`,
  `lib/push/devices.ts`). Every cookie the app sets is `Secure` on https:
  the Supabase clients take `cookieOptions: sessionCookieOptions(protocol)`
  (`lib/supabase/cookie-options.ts`); a new cookie does the same. An
  email's link never swaps the signed-in account without asking: `/welcome`
  verifies on a side client when someone is signed in and asks "Continue as
  … / Stay as …" (`lib/auth/link-swap.ts`); old-style `#access_token` links
  are handed to `/welcome?swap=1` by `AuthHashHandler`.

## Timers and daily jobs

Supabase's pg_cron is the only clock. Each job calls the app through
`posting_call()` (pg_net) at `/api/cron/posting`, with the cron secret and,
when set, Vercel's protection bypass:

| Job | When | Body | What it does |
|---|---|---|---|
| `vplanner-posting` | every minute, when something is due | `{}` | posts, meeting reminders |
| `vplanner-status` | every 10 minutes | `{"status": true}` | the status page's hourly bars, alerts, the objectives' safety-net count |
| `vplanner-cleanup` | 03:30 UTC | `{"job": "cleanup"}` | deletes posted shorts' and long videos' files and Thumbnail Studio's thumbnails that didn't win, after the team's choices; refreshes sign-ins |
| `vplanner-analytics` | 05:10 UTC | `{"job": "analytics"}` | copies every team's numbers |
| `vplanner-live` | every 10 minutes (:05, :15…) | `{"job": "live", "team", "platform"}` per account | every video's counts, realtime, impressions and CTR (0083) |
| `vplanner-outliers` | every 30 minutes (:17, :47) | `{"job": "outliers", "team"}` per team with a niche, `{"job": "outliers", "explore": true}` once | Outliers' collector: searches, channels' uploads, stats, thumbnails, insights, alerts, the Monday summary (0091) |

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
  `team_id in (select my_master_team_ids())`, money with
  `team_id in (select revenue_team_ids())`, a role with
  `team_id in (select my_role_team_ids('publisher'))` (0109). The
  `(select …)` wrapper makes Postgres evaluate it once per query instead of
  once per row; `supabase/tests/reads-once.test.sql` fails for a read rule
  that calls `can_*` / `is_*` / `has_team_role` / a bare `auth.uid()`, and
  for a foreign key without an index.
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
- One row, one read: the frame's profile columns come from
  `getShellProfile()` (lib/look-server.ts); a new column the dashboard
  layout needs goes into its `SHELL_COLUMNS`, not a read of its own.
- Speed depends most on where things run (1.32.1, App setup card 11): the
  server's region next to the database's, and sign-ins checked with JWT
  signing keys (then `getClaims()` in the middleware asks nobody).
- Real visitors' speed is on Developer → Speed (1.32.4): the 75th
  percentile of LCP, INP, CLS, FCP and TTFB over 7 days, phones and
  computers, per page. Look there before and after a change meant to make
  something quicker; a page that's slow there is the one to work on.

**Client**
- Call server actions through `useAction()` (`lib/hooks/use-action.ts`):
  consistent toasts, and an `optimistic` hook paired with `useOptimistic`.
- Realtime handlers patch the exact rows that changed (see
  `notification-bell.tsx`) or debounce `router.refresh()`.
- Every route has a `loading.tsx` built from `components/ui/skeleton.tsx`.
  Same-page navigations use `PendingNav` / `PendingLink` / `PendingSwap`
  (`components/ui/pending-nav.tsx`).
- Coming in from another part of the app, Next shows the OUTERMOST new
  `loading.tsx` first (a task → `/shorts/<id>/script` showed the shorts
  list's). So the outer ones (`shorts/`, `shorts/[id]/`, `videos/`,
  `videos/[id]/`, `analytics/`, `meetings/`) are client components that pick
  the skeleton of the page further in from `usePathname()` (1.18.0). A new
  nested page with its own `loading.tsx` gets a line in its parent's.
- Images: upload through `compressImage()` with an `IMAGE_PRESETS` entry
  and `UPLOAD_CACHE_CONTROL`; render with `loading="lazy" decoding="async"`.
- A picture kept large and shown small comes from a route with `?w=`
  (`lib/picture-size.ts`: `studioThumb(entry, w)`, `sketchThumb(id, w)`;
  160 for list rows, 640 for cards and details; `resizePicture()` makes the
  copy). Never a signed link for a picture a page shows on every visit: it's
  a new address each time (downloaded again) and one more trip to storage
  per render. Private pictures go through a route at an address that never
  changes, `private, max-age=2592000, immutable` (1.32.3).
- Fonts: every file of one `next/font` call is preloaded on every page. A
  style or font only a few pages use gets a call of its own with
  `preload: false` (Fraunces' italic, `--font-display-italic`).
- Code that only one tab, dialog or widget needs is loaded with
  `next/dynamic` from a `"use client"` file (in a server component it does
  NOT split: both sides end up in the page's chunk). Examples:
  `app/(dashboard)/objectives/views.tsx`, `app/(dashboard)/team/lazy-tabs.tsx`,
  the dashboard widgets in `modules/dashboard/components/studio.tsx`. A big
  library used on one action (tus uploads) is `await import()`ed there.
- A list that grows without end either pages ("Show more", like Outliers
  and Analytics) or, when it's drawn on the server, renders its rows and
  cards in groups of `LIST_CHUNK` / `WIDE_CHUNK` (lib/chunks.ts) in a
  `.list-chunk` / `.list-chunk-cards` (globals.css, content-visibility: auto):
  groups, never each row (a thousand watched rows stutter). What opens from a
  row must open in a portal (a group clips what's drawn inside it). A query
  for a list that can pass 1000 rows reads with `allPages()` (lib/all-pages.ts):
  Supabase cuts every answer at 1000 rows without saying so (1.32.5).
- Dashboard widgets: a new one gets its `dynamic()` line and its `PRELOAD`
  entry in `studio.tsx` (the board's widgets start downloading while the page
  hydrates; Customize fetches the rest for the library). Each renders inside
  `WidgetBoundary`, so one failing widget shows its own Try again instead of
  taking the dashboard down. A widget with a choice that should stay (Top
  videos', Views', Followers' and Upcoming shorts' platform, 1.34.4–1.34.5;
  Upcoming shorts' Only and editor, Upcoming longs' editor, 1.35.1) gets
  `settings` in its `CATALOG` entry (layout.ts), `HAS_SETTINGS` and a form
  in `WidgetSettings`, and `settings` / `onSettings={update}` in
  `renderWidget` (its own chips call `onSettings`, which saves the layout).
  New followers per day: `modules/analytics/lib/followers.ts`
  (`followerGains`: gained − lost where the platform says, else the change
  in the count, a gap's change on the day after it; `sumSeries`).
  Every widget's filter chips are `FilterChips` (`filter-chips.tsx`, 1.35.1:
  a radio group, the picked chip ink on paper, arrow keys, Tab on the picked
  one; SoundSync ticks any role="radio" or role="checkbox" click, so a
  filter needs no sound of its own). Several of a widget's settings changed
  by one click go in ONE `onSettings({...})` call: `updateSettings` starts
  from the layout as it was rendered, so two calls in a row lose the first.
  Upcoming shorts and longs filter with `modules/dashboard/lib/upcoming-filters.ts`
  (pure, tested: `goesTo` a platform or only it, `editedBy`, `editorsOf`,
  `editorPick`, `nothingFor`); an editor is their team membership's id. A
  card's top-right link (`GridCardMeta.link`, from `widgetMeta`) is Top
  videos' "View all" (`topVideosHref`, layout.ts).
  Views and Followers (1.34.5) share their parts in `analytics-widgets.tsx`:
  `PlatformChips` (the filters, each with the number you see when you pick
  it) and `usePlatformPick` (the saved pick); a day of either graph shows a
  popup (`useDayPointer`: under the mouse, or a finger, where a tap reads the
  graph instead of following the widget's link; gone on leaving, a touch
  elsewhere or a scroll; `DayTip` in a portal, as `.dash-item` clips). Which
  day is under the pointer, and the Views week (up to the last day every
  picked platform has reported), are `modules/analytics/lib/day-graph.ts`
  (pure, tested).
- **The frame is on every page** (the dashboard layout and the client
  components it draws: sidebar, header, bell, search, What's new, the tour,
  the celebrations), so it stays light (1.32.2). What only shows when opened
  lives in a file of its own, `lazy(() => import(…))`-loaded from the light
  part inside a `LaterBoundary` (components/ui/later-boundary.tsx: its code
  not arriving, or breaking, never takes the page down), warmed with
  `whenIdle()` (lib/idle.ts) and when pointed at, with a fallback in the real
  thing's shape: `global-search.tsx` → `search-palette.tsx`,
  `notification-bell.tsx` → `notification-cards.tsx`, `whats-new.tsx` →
  `whats-new-notes.tsx`, `tutorial.tsx` → `tour.tsx`. Listeners that aren't
  needed for the first paint start once idle (`celebrations-host.tsx`,
  `xp-cheers-host.tsx`, `useIdle()`). What the frame needs from a big module
  is worked out on the server and passed down (`whatsNewFacts()`), and small
  helpers live apart from big lists (`lib/changelog-meta.ts`,
  `lib/profile/levels.ts`): a client component never imports
  `lib/changelog.ts`. `tests/bundle.test.ts` walks the frame's imports and
  fails when one of those comes back, or the frame passes its budget.

## UI conventions

- **Breakpoints:** `lib/breakpoints.ts` (sm 640, md 900 = the sidebar
  appears, lg 1180, xl 1400, 2xl 1600) is Tailwind's `screens` and what code
  passes to `matchMedia` (`minWidth("lg")`). Never hard-code a width.
- **Icons:** SVG components from `components/ui/icons.tsx` only, never
  Unicode symbols (iOS renders many as emoji).
- **Stage colours mean state, not identity:** `stageState()` +
  `STAGE_STATE_COLOR` (orange = current, teal = done, neutral = upcoming).
- **Words in a colour (1.35.0, light mode's contrast pass).** Every colour
  token comes in two: the fill (`--amber`, `--teal`…: `bg-`, `border-`,
  `ring-`, `fill-`, `stroke-`) and the word shade (`--amber-text`…), which
  `text-amber` and the rest use (`tailwind.config.ts` `textColor`): deeper
  in light mode, lighter in dark, 4.5:1 on every theme's cards, paper,
  hovers and the colour's own 5–15 % chips. A theme sets its own
  `--amber-text`; a team's short / long colours get theirs from
  `kindColorCss` (`lib/kind-colors.ts`, through `wordsIn` in
  `lib/contrast.ts`, which also has `contrast`, `textShade`, `forWhite` and
  `WORST`, the darkest light and lightest dark backgrounds of any theme).
  In an inline style, words take `wordColor(c)` (`lib/word-color.ts`): an
  app colour becomes its word shade, any other is mixed toward the ink
  (`--word-mix`). Fills that carry white words (the accent in every theme
  and both modes, green, gold, red, teal, the avatar `PALETTE`) are 4.5:1
  with white; initials on a colour that isn't take `onFill(color)`. In light
  mode filled buttons darken a little on hover (they brightened past it),
  and the glass's wash keeps its colours light (OKLCH lightness ≥ 0.84), so
  words on the page read on it. A wallpaper behind a page's words (every
  page but the dashboard) is covered by enough paper for grey words, from
  its measured brightness (`.wall-cover[data-words]`). `tests/light-contrast.test.ts` recomputes
  all of it from globals.css for every theme; a new theme, colour or fill
  with words on it must pass there. The harness's `t-contrast.mjs` checks
  the rendered pages (each word against the pixels behind it).
- **Overlays that must escape the header** render through a portal on
  `document.body` (the sticky header's `backdrop-blur` traps fixed children).
- **Pop-ups leave the way they came (1.34.0).** Anything that floats over
  the page and closes (a window, prompt, menu, picker, sheet, side panel,
  card) sits inside `<Leaves>` (`components/ui/leaves.tsx`; `lock` when it
  holds the page still) with the condition that shows it OUTSIDE: `{open &&
  <Leaves>…</Leaves>}`, or inside a component the condition removes. Its
  moving parts carry a `pop-*` class instead of an `animate-[…]` one
  (`pop-dim` the dimmed page, `pop-modal`, `pop-menu` with an `origin-*`,
  `pop-drop`, `pop-sheet`, `pop-drawer`, `pop-card`, `pop-fade`;
  globals.css "Pop-ups"). On close `lib/pop-ghost.ts` leaves a still,
  inert copy playing the way in backwards. Something that grows inside the
  page (a panel opening in place) keeps its one-way entrance and is listed
  in `tests/pop-ups.test.ts` with why.
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
  `markDoneConfirm(text)`; every Post now asks. Archiving asks too (not
  `danger`: it can be undone).
- **Shapes (1.16.0): rounded squares, not pills or circles.** Buttons,
  chips, tags, badges and inputs `rounded-md` / `rounded-lg`, small dots and
  thin bars `rounded-[2px]`–`rounded-[3px]`, cards `rounded-2xl`.
  `rounded-full` is kept for avatars, spinners, progress rings and large
  decorative circles only.
- **One choice out of a few** (views, tabs inside a page, short filters):
  `<Segmented>` (`components/ui/segmented.tsx`: a radio group, arrow keys,
  optional counts). On phones put it in a `-mx-4 px-4 overflow-x-auto
  no-scrollbar sm:mx-0 sm:px-0` row so it scrolls instead of overflowing.
  (1.31.9: Objectives' six cadences didn't, and the page went wider than a
  phone and off centre. The layout's `<main>` is `overflow-x-clip` now, so a
  page can't scroll sideways, but a row that's cut off is still a bug.)
- **Pictures of people, team logos and account pictures (1.31.9):**
  `<AvatarImg src={url} fallback={initials} />`
  (`components/ui/avatar-img.tsx`) inside the coloured circle, never
  `{url ? <img …/> : initials}`. It loads eagerly (lazy pictures never
  started on some iPhones and the circle stayed a plain colour), sends no
  referrer, retries once past the cache and then shows the fallback.
  `tests/phone-glass.test.ts` fails on a bare `<img>` whose src is an
  avatar, logo or picture without its own `onError`.
- **A video shown as a picture** (a tile, a preview, a paused wallpaper):
  `src={stillSrc(url)}` (`lib/video-still.ts`, adds `#t=0.1`) with
  `preload="metadata"`: an iPhone draws nothing for a video that hasn't
  played.
- **What sticks under the top bar** sticks at `var(--shell-top,3.5rem)`, not
  `top-14` / 56px: with the glass look on a computer the bar floats (1.31.9,
  10 px down, 52 px tall) and `--shell-top` is 72px. Inside Outliers, what
  sticks under its own bar adds `var(--ol-bar)` (its measured height):
  `top-[calc(var(--shell-top,3.5rem)+var(--ol-bar,104px)+0.75rem)]`.
  `[data-shell="edge"]` (layout) blurs what scrolls under the floating bar;
  a new sticky bar of a page's own gets `data-shell="subbar"` and z-index 15
  (above the edge, z 14; under the top bar, z 20). Since 1.34.1 the top bar
  floats at every glass level (at 0 it's a solid pane, not the old full-width
  bar), and a `subbar` is glass like it, in every style: on a computer a pane
  of its own under the top bar (margins −12px / −16px from xl undo its page
  padding of 32 / 40 px, so it lines up with the top bar), on a phone a
  tinted band. Give it the page padding `-mx-4 px-4 sm:-mx-8 sm:px-8
  xl:-mx-10 xl:px-10` like Outliers' bar (`tests/glass-bars.test.ts`).
- **A tab's underline** sits inside its row: `absolute left-… right-…
  bottom-0 h-[2.5px] rounded-t-[2px] bg-amber`, never `-bottom-px`. A row of
  tabs scrolls sideways (`overflow-x-auto`), which clips whatever hangs
  below it, so the old underline showed half its height or none
  (`tests/glass-bars.test.ts`).
- **Toasts** (`useToast()`): their time comes from `toastDuration()`
  (3.5 s, an error 5.5 s, with an action 6.5 s); pass `duration` only for a
  reason. They go with their ×, a swipe sideways, up on a phone (they sit
  at the top) or down on a computer.
- **Popups:** lock the page with `useScrollLock(open)` or `lockScroll()`
  (`lib/hooks/use-scroll-lock.ts`). The locks are counted, so popups can
  close in any order; never set `document.body.style.overflow` yourself.
  Callbacks a popup's listeners call go through `useLatest()`, so a parent's
  inline `onClose` doesn't re-run its setup (focus jumping, locks taken
  again). A popup with a form fills it with `useFillOnOpen(open, key, fill)`
  (`lib/hooks/use-fill-on-open.ts`): when it opens, never again while it
  stays open, so a live update can't wipe what someone is typing.
- **"/" and ⌘K / Ctrl+K open the app's search** everywhere
  (`components/search/global-search.tsx`). Pages don't get their own search
  box (1.20.0: Analytics → Content's is gone): the palette finds videos with
  their numbers too (`use-video-search.ts` → `searchVideos()`). A new page,
  tab, setting or action goes in `lib/search/catalog.ts` (who sees it, the
  other words people use for it), or nobody can find it there (1.26.0).
- **A link to a part of a page** is `…#id`: give the part an `id` and
  `scroll-mt-24`; it scrolls into view and glows once it's on screen
  (`components/ui/hash-flash.tsx`, `lib/flash.ts`, `[data-flash]` in
  globals.css). Something a link should open (a window, Customize) reads a
  query parameter and tidies the address with `history.replaceState` once
  it's done (`?new=1`, `?invite=1`, `?customize=1&add=…`, `?claude=1`,
  `?find=` in a script).
- **`next/dynamic` and `useId`**: a component loaded with `dynamic()` and
  rendered on the server can get other `useId()` values in the browser (a
  hydration mismatch). Don't put SVG ids from `useId` inside one (1.20.0:
  the Instagram logo's gradient is a CSS background; Analytics → Advanced
  is imported normally); the Mascot's clip paths still warn on the
  Projections empty state.
- A `<fieldset>` only shrinks below its content with `min-w-0` (browsers
  give it `min-width: min-content`): add it to any fieldset inside a grid or
  a phone-width dialog.
- **A table with a Cards option** (1.18.0: Objectives, Projections):
  `components/ui/table-bits.tsx`: `useStoredView(key, allowed, fallback)`
  (kept on the device), `<LayoutSwitch>`, `<SortTh>` + `nextSort()` for
  headings that sort. Phones get the same rows as a list (`md:hidden` list,
  `hidden md:block` table); columns join in by breakpoint
  (`hidden lg:table-cell`).
- **Posted, on a calendar:** `<PostedTick>` (`components/ui/posted-tick.tsx`),
  the filled teal tick, at the end of the title (never crossed out).
- **SVG ids are per instance:** a gradient or clip path inside a component
  used more than once gets `useId()` (InstagramIcon) or an `id` prop
  (ClipLogo). With one shared id every copy uses the first one's, and when
  that one sits in a hidden part of the page (a phone-only list on a
  computer) browsers draw the rest without it.

## Status, errors and alerts (who sees what)

- **`/status`** (public): is the app as a whole working. Levels only, never
  details. History: `status_samples` (0067), written every 10 minutes.
  Never pass `detail` to the page's client parts.
- **`/developer`** (developer accounts only, else 404): errors with Mark
  fixed, every check in full, the reason per hour, incidents, reports, the
  last status call and why it failed.
- **Developers** = `DEVELOPER_EMAILS`, else the owner of the first team
  (`developers()` / `isDeveloper()` in `lib/errors.ts`). Only they get
  app-wide alerts, as notifications. The emails (alerts, "back to normal",
  test alerts, reports) go to ONE address, `alertsEmail()`: `ALERTS_EMAIL`,
  else `NEXT_PUBLIC_CONTACT_EMAIL`, else hello@ the app's domain (1.19.0).
  Never send app-wide emails to the developer accounts themselves.
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

**The website (1.33.0).** Features, Platforms, Pricing, Security, Changelog,
About and Contact are server pages in `app/(site)/<page>/page.tsx`, each
inside `<SitePage current="/<page>">` (`components/site/site-chrome.tsx`:
the header and footer the home page and the legal pages share, `PageHead`,
`SiteSection`, `FactList`, `SiteCta`, `askHref()`). A new page needs all of:
`EXACT` in `lib/public-paths.ts`, `PUBLIC_PAGES` (sitemap, robots) and
`BRAND_PAGES_RE` in `lib/public-pages.ts`, `publicMetadata("/<page>", …)`
with `robots: { index: true, follow: true }`, and a link in `SITE_NAV` or
`SITE_FOOTER`; `tests/website.test.ts` fails without any of them. The words
live beside the code that makes them true: `lib/site/platforms.ts` lists
exactly the permissions `lib/social/providers.ts` asks for (add a scope
there and the test asks for its line here, with what it's for), and
`lib/site/plans.ts` is the owner's prices. The look is the home page's:
one dark slate band per page (stripes on it are `ld-stripes-light`), no
all-caps labels, no arrows on links, no script of a page's own (the phone
menu is a `<details>`, monthly / yearly is CSS). Every claim on Security
must be something the app does today: change the page with the feature.
`/.well-known/security.txt` comes from `lib/security-txt.ts`.

**A video's name (1.33.1).** The heading of a short's or a long video's
page is `EditableTitle` (`components/ui/editable-title.tsx`: click to rename,
Save / Cancel, a toast from the caller's `useAction`), and both Settings
windows start with `NameField`. Names go through `cleanName`
(`lib/names.ts`) on both sides. A long video's name is its picked title
idea's too (`renameLongVideo`, `setPrimaryTitle`, `updateTitleText` keep
them equal).

**Clip's tour.** `components/tutorial/tutorial.tsx`: starts once per person
on `/dashboard` (`profiles.tutorial_done_at`, 0069); Settings → Account →
"Show me around again" or `/dashboard?tour=1` replays it. Steps point at
`data-tour="…"` anchors (`nav-<path>`, `nav-more`, `search`, `bell`,
`settings`): keep them when moving those, and add a step (computer and
phone) for a new main area.

**Notifications.** The bell shows the latest 25 and patches itself from
realtime. History (in the bell's header) loads the last 2 weeks, 40 at a
time, through `getNotificationHistory()`. Since 1.29.1 (0095) the bell lists
only the ones not cleared (`loadBell()` in `lib/notification-select.ts`; a
database without 0095 lists them all): the X on one (`clearOne`) and Clear
all (`clearAllButQuestions`, `lib/notification-clear.ts`) set
`notifications.cleared_at` and `is_read` with the person's own client (RLS,
and the two columns they may update). Clear all leaves an invite or an
ownership request still waiting for an answer, and reaches older ones the
bell hasn't shown. History keeps cleared ones. A clear from another tab or
device arrives over realtime (an UPDATE with `cleared_at`) and leaves the
bell there too.

**Video files.** Shorts' uploads (bucket `review-videos`) are deleted by the
nightly clean-up once a short is posted everywhere, after the team's choice
(`teams.media_keep_days`; Team → Defaults → Video files; 0070, 2 weeks by
default). The short itself always stays. Code: `lib/media-cleanup.ts`.
Since 1.25.0 the same job deletes a posted long video's edits (bucket
`long-review-videos`) after `teams.long_media_keep_days` (1 week by default),
counted from the last platform in `long_video_posts`;
`long_video_projects.keep_media` skips it (masters and schedulers, through
`long_set_keep_media`). Thumbnail Studio's thumbnails that didn't win go
(rows and files) after `teams.studio_keep_days` (1 month by default); winners
always stay (with none picked, the first one). Before 0089 both just do
nothing. Since 1.27.5 (0092) all three take the same choices, from
`lib/media-keep.ts` (`KEEP_CHOICES`): 1, 3, 7, 14, 21, 30, 60, 90, 180 or 365
days, or null = never deleted (the clean-up skips that team); `readKeep()`
reads a stored value, anything unknown is the default.

**Glass and dashboard backgrounds (1.27.5, 0092).** `profiles.glass_ui` is
the glass look: `components/ui/glass.tsx` keeps `<html data-glass>` and
localStorage `vp-glass` in step with the account (the first-paint script in
`app/layout.tsx` applies it early; brand pages drop it). The CSS is one block
in `app/globals.css`: the wash is `body::before`; `bg-surface` /
`bg-surface-2` turn see-through through Tailwind's `--tw-bg-opacity`; real
blur (`backdrop-filter`) only on `[data-shell]` bars, `.dash-item` and
`.glass-pane` (Dialog, AnchoredMenu, Select). Don't put `backdrop-filter` on
ordinary cards: it makes them the frame for any `position: fixed` pop-up
inside them. A dashboard background is `profiles.dashboard_bg_path` (a file
in the public `dashboard-backgrounds` bucket, `<user id>/<time>-<name>.<ext>`,
25 MB, pictures, GIFs, MP4 and WebM; `lib/dashboard-bg.ts` checks the same
as the database), shown when `dashboard_bg_on`, darkened by
`dashboard_bg_dim` % (0–80). The dashboard page draws it
(`modules/dashboard/components/backdrop.tsx`) inside `[data-dash-bg]`, which
frosts the widgets and the top bar; Settings → Preferences uploads it
(`settings/dashboard-background.tsx`, `updateDashboardBackground` removes the
file it replaces).

**Glass choices, wallpapers and profiles (1.28.0, 0093).** The look is
`lib/look.ts` (`Look`: on, style simple | liquid, scope cards | everywhere,
sidebar, level 0–100), saved in `profiles.glass_*` and in localStorage
`vp-look`, put on `<html>` as `data-glass`, `data-glass-style`,
`data-glass-scope`, `data-glass-sidebar` and `--glass-level` (0–1). Every
glass number in `globals.css` comes from `--glass-level`; add new glass rules
there, never as inline styles. "Everywhere" blurs positioned pop-ups with a
shadow, so anything `fixed` they open must be portaled to `<body>` (Select,
DatePicker and AnchoredMenu already are). Wallpapers are rows of
`profile_wallpapers` (3 per person, enforced by the database); the one in use
is still `profiles.dashboard_bg_path`. Upload with `startUpload()`
(`lib/upload/resumable.ts`: progress and cancel), measure the picture first
(`measureFile()`) and save its `luma`, so words over it can pick dark or white
in CSS (`.wall-tone` with `--bg-luma` and `--bg-dim`; `lib/wallpapers.ts`
`wordsDark()` is the same rule for tests). Removing deletes the storage file
first, then the row; the database moves "in use" and profile backgrounds
along. Profiles: XP, levels and frames are decided in SQL (`vp_task_xp`,
`vp_level_for`, `vp_frame_level`, `profile_stats`); `lib/profile/progress.ts`
mirrors the numbers for display and tests, so change both together.
`profile_pages` holds what a profile shows (bio, showcases, frame,
background, public); its RLS hides a private page from everyone else and
`profile_stats` answers null for it, so never read someone's profile data
with the service key. Showcases use the dashboard's board
(`modules/dashboard/components/grid-board.tsx`, `GridBoard`): a new showcase
is an entry in `modules/profile/layout.ts` `SHOWCASES` plus a case in
`modules/profile/components/showcases.tsx`. Leaving a team is `leave_team()`;
deleting an account is `settings/account-actions.ts` (password checked again,
no teams, then the person's storage folders and `auth.admin.deleteUser`;
every foreign key to `profiles` cascades or sets null, except
`teams.owner_id`, which is why owners transfer or delete their teams first).

**Glass on or off, the slider, the colours behind it (1.29.2, 0096).** Off
means nothing is see-through anywhere: no `[data-dash-bg]` rule frosts
anything without `html[data-glass]`, and the bars (`[data-shell]` header,
subbar, bottom nav; the phone top bar over a wallpaper) are solid paper /
surface with no `backdrop-filter`. The slider: `--glass-tint` is 1 at level 0
(and `data-glass-opaque` sets `--glass-blur: none`, so no blur is worked out
at all; any `var(--glass-blur) …` list then falls back to none), about 0.56
(Simple) / 0.46 (Liquid) at 50 like before, 0.04 / 0.03 at 100. The wash
(`lib/washes.ts`): `Look.wash` is "theme" (stored as null), "none", a theme's
id (`THEME_WASHES`: its accent in light and dark, the same numbers as
`components/ui/palette.tsx`; `tests/look.test.ts` doesn't import that client
file, keep them in step by hand), a blend's id (`BLENDS`) or "custom" with
`washColors` (three `#rrggbb`). `lookAttributes()` turns it into
`data-glass-wash` ("one" → `--wash-light` / `--wash-dark`, "three" →
`--wash-1…3`, "none" hides `body::before`); `--wash-base` feeds the wash's
gradients. localStorage `vp-look` also keeps `paint` (what the first-paint
script puts on `<html>`; it checks every name and value). Before 0096
`getLook()` marks the look `washStored: false` and this device's colours are
used; `setLook` saves the rest. Over a wallpaper with glass on, the picture's
brightness is on `<html>` too (DashboardBackdrop's `<style>`, from its `luma`
prop), so the bars can read it: `--wall-lift` dims (dark mode) or lifts
(light mode) the backdrop of every pane by as much as the picture is too
bright or too dark for the words, `--wall-floor` keeps a little of the pane
over very dark (light mode) or very bright (dark mode) pictures, and
`--ink-soft` / `--ink-faint` are a step stronger on those panes. A picture
that suits the words changes nothing (as clear as the slider).

**Liquid reworked, Halo, Preferences (1.29.3, 0097).** Liquid has no sheen
and no white glow along the top any more: `--liquid-rim` is a hairline of
light on the top edge and a faint one round the rest, `--glass-edge` is
faint, shadows are soft, and the top bar's fade carries only a little paper
(`--glass-tint`-based). The pointer's light is per pane: `LiquidLight`
(`components/ui/glass.tsx`) finds the pane under the pointer (`.dash-item`,
`.glass-pane`, the phone tab bar) and sets `--mx` / `--my` on it; the CSS
draws a rim (`::after`, ring mask) and a faint light under the words
(`::before`, `z-index: -1`) only on `:hover`, in `--glint-rgb` (the wash's
first colour). Nothing on touch. Halo (`glass_style = 'halo'`, 0097): a ring
(`::before`, ring mask) in `--halo-a / b / c` (the wash's colours: the base
and its two neighbours, or a blend's / your own three), a glow of
`--halo-a`, brighter on hover; ordinary cards get a tinted border and glow.
A scroll container can't carry these pseudo-element rings (they'd scroll
with it), so the side bar and scrolling menus get a border or shadow
instead. All `.glass-pane` pop-ups (dialogs, the search palette, the bell,
menus) follow the slider (`--glass-pop`) in both scopes. At level 0
(`data-glass-opaque`) the bars are solid too. Settings → Preferences is in
four sections (`#look` with `#appearance` and `#colours`, `#glass`,
`#background`, `#motion` with `#animations` and `#sounds`); the search
catalog and HashFlash use those ids, keep them.

**Settings → Account, Help & feedback, the Danger zone (1.34.2).** The
tabs are `SETTINGS_TABS` (`app/(dashboard)/settings/skeletons.tsx`):
Profile, Teams, Notifications & app, Preferences, Account, Help &
feedback. Account (`account-tab.tsx` `AccountOverview`) is cards of rows
(`account-parts.tsx` `Group` and `Row`: what it is on the left, its value
or button on the right; the skeleton draws the same rows with the same
`TEXT`): Signing in (`#email`, `#password`), Devices (`#sessions`), the
developer's pages, then one quiet row into the **Danger zone**, Account's
own sub-page `?tab=account&view=danger` (`settingsView`, `DangerZone`,
`#delete-account`). Anything that can't be undone goes there, never on a
tab. Help & feedback (`HelpTab`): `#report` (the form, what you sent
before) and `#tutorial`. Their data loads only on their own view. Old
`?tab=account#report` / `#tutorial` / `#delete-account` links are sent to
where those are now (`moved-here.tsx`). `tests/settings-account.test.ts`.

**Small wallpapers, on every page (1.29.4, 0098).** Every wallpaper is made
small in the browser before it's uploaded (`lib/wallpaper-convert.ts`
`prepareWallpaper`; the pure rules and tests in `lib/wallpaper-plan.ts`):
pictures are drawn into a canvas and saved as WebP at the first size
(2560×1600 down to 1280×800) and quality that fit in 2 MB (`WALL_MAX_BYTES`);
videos and anything that moves (GIF, APNG, animated WebP / AVIF, found by
their bytes) are played into a canvas and recorded as WebM with
`MediaRecorder` at `bitrateFor(seconds)` (a long one at 1280×720), keeping
the first 30 seconds; it takes as long as the video plays, so the tile shows
its progress and can be stopped. A recording has no length in its header:
`webmWithDuration` writes the Duration into its Info. A WebM already under
2 MB stays as it is; a small moving GIF stays a GIF where the browser can't
record. The bucket takes 2 MB at most (0098), so nothing bigger gets in
another way. Settings lists each file's size (storage `list`), and one from
before over 2 MB gets "Make it lighter" (fetches it, runs the same steps,
replaces it). `profiles.dashboard_bg_everywhere`: the layout reads it with
`getEverywhereBackground()` and draws `EverywhereBackdrop` (`data-global-bg`)
once, inside a `[data-dash-bg]` wrapper round every page, so it never
remounts between pages; the dashboard then skips its own. Other pages darken
it to at least `EVERYWHERE_DIM` (70 %) so words made for the paper read over
it; ordinary cards there keep at least 0.8 of their pane with glass on (no
blur of their own). A page with its own (`data-own-bg`, a profile's) hides
the global one. `DashboardBackdrop` keeps the old picture until a new one
has loaded and fades it in (no flash when switching or saving a profile);
the profile keeps the saved background from the moment Save is pressed. A
page with a wallpaper fades in instead of rising (`.motion-page >
[data-dash-bg]`): the rise's transform made the fixed wallpaper fill only
the page's box while it ran.

**A profile's colours (1.29.5, 0099).** Levels have a colour each 10
(`LEVEL_TINTS` in `lib/profile/progress.ts`: grey, yellow, lime, green,
cyan, blue, purple, pink, red, orange); the level badge always wears it.
The frame, the XP bar (and with it What I do's bars and the Numbers icons)
and the header's glow each follow `profile_pages.frame_color` /
`bar_color` / `glow_color`: 'level' (that colour), 'theme' (the viewer's
`--amber`), '#rrggbb', and for the glow 'off' (`lib/profile/colors.ts`,
pure, tested). `ProfileView` turns them into CSS once (`colorCss`) and
passes strings down (`--pg` on `.prof-head`, the frame's `--pf`,
`ShowcaseData.barTint` / `frameAt`), so changing one only changes CSS. Reads
and writes go through `modules/profile/page-data.ts` with the person's own
client (`readProfilePage` falls back to the columns before 0099; Save sends
`colors` only when they changed; `saveProblem` checks a missing colour column
before 0093's missing table, since PostgREST's message names the table too).
`scripts/e2e/profiles.e2e.ts` runs it against PostgREST, a database without
0099 included. Your own picture is a button (`useAvatarUpload`, shared with
Settings: the compressor is imported only once a file is picked). About me
saves from its own window (`AboutDialog`: while customizing it saves the
draft and stays; otherwise just that showcase), and only the owner gets a
showcase's gear.

**Achievement cards, more achievements (1.29.6, 0100).** A profile keeps
ONE card for the whole page (`AchievementCards` in
`modules/profile/components/achievements.tsx`, round `ProfileView`); a medal
drawn with `interactive` only tells it "show me, here" (its rect), so a page
of 50 medals costs 50 small handlers and one card. Leave `interactive` off
where a medal sits inside a button (the featured picker). The card measures
itself in a layout effect before it paints, so it never shows in the wrong
place, and goes away on scroll, resize, Esc, blur or a tap elsewhere. Its
animations are CSS only (`.pf-card*`; `--mp` is registered with `@property`
so a locked medal's ring can fill). Every achievement has `text` (what to do)
and `why` (what it means, in the card); ids are what a Featured showcase
saves, so keep them. Counting stays in the database: `profile_stats` (0100)
adds `more` (early, night, dawn, videos as `{ n, at }` via `vp_marks`) and a
few more marks for streaks, levels and teams; night and dawn use the team's
time zone (`vp_safe_tz`, once per team) and leave publishing out. The four
new showcases (Streak, Next up, Milestones, Busiest days) only read the
numbers already loaded.

**Clip cheers your XP (1.29.7, 0101).** `XpCheers` (in the dashboard layout)
listens to realtime UPDATEs on your own `tasks` rows (0101 adds the table
to `supabase_realtime`; the filter is `user_id=eq.<you>`). A burst of rows
is settled for 700 ms, then `my_progress()` gives your XP; the popup shows
the difference from what this tab last saw (sessionStorage), never a number
worked out in the browser, so whatever the database didn't count (a skipped
step, one counted before) shows nothing. Only the visible tab cheers; the
others just remember the new total. The pure part is `lib/profile/xp.ts`
(`xpChange`, `mergeXp`). The runner game behind Clip's seven taps
(`clip-runner.tsx`) is loaded with next/dynamic only when it's opened, draws
on one canvas in world units, and runs its loop only while it moves (and
not in a hidden tab); keep it that way so the dashboard pays nothing for it.

**Clip's "new look" screen (1.29.8).** Anything that switches the colour
theme, light or dark, or glass on / off / its style goes through
`changeLook(what, apply)` (`lib/look-screen.ts`), never straight to the
attributes on `<html>`: `LookScreenHost` (dashboard layout) puts Clip's
solid screen up, applies the change once that screen has been drawn, and
takes it away after the new look has been drawn (at least 750 ms). The
restyle (every glass pane's blur at once) happens under it instead of as a
visible stutter. Small changes (the see-through slider, the colours behind
the glass) stay instant and don't use it. Outside the app shell
`changeLook` just applies. A change that takes a while (1.35.1: the
wallpaper, Settings → Preferences → Wallpaper, turned on or off, picked,
uploaded, removed while showing, on every page or not) passes an `apply` that
returns a promise: the screen stays up until it settles (`runChanges`, at
most `LOOK_MAX_WAIT`, 8 s; a failure or a throw just lets it go). The
wallpaper's settle when the server action has saved, the page has been asked
for again and has it (`refreshed()` in `dashboard-background.tsx`: a
`router.refresh()` in a transition, done when the transition is) and its new
picture has loaded (`wallpaperDrawn()`, DashboardBackdrop's hidden layer).
The darkness slider stays instant. Loading skeletons are `.skeleton` (or the
`Skeleton` component) everywhere, so they take the theme's tint; don't draw
loading blocks with greys of their own.

**Outliers' panel, menus and colours (1.29.9).** The video and channel
panels share ONE `PanelFrame` (`modules/outliers/components/panel.tsx`,
mounted by the page itself while `ctx.panel` is set, 1.31.8): a panel's
own component renders `PanelContent` (its label, the bar's middle and its
body), never a shell of its own, so moving between a video and a channel
changes what's inside without closing and re-opening anything (no replayed
slide-in, no backdrop flash, no scroll lock churn). Give a new panel kind
the same treatment, in the same `panels.tsx` chunk. A button that opens a
channel passes what it knows (`openChannel(id, { title, avatar, subs })`)
so the panel shows the name at once. `AnchoredMenu` sits
above popups (z 125; `Dialog` is 110, `Select` and `DatePicker` 130),
places itself with `placeMenu` (`lib/menu-place.ts`: under its button, or
over it when there's no room below) and takes Escape before the popup
behind it. A multiplier's colour comes only from `heat()` / `HEAT`
(`modules/outliers/lib/heat.ts`): red, yellow, green, never `--amber`;
put a number on a fill with `heat(x).on`, not white. An empty list that's
empty because a niche has no videos yet passes `finding` to `EmptyNote`.

**Outliers: the panel opens at once, and the usual (1.31.8, 0106).** The
frame is in the page's own code (`outliers-view.tsx`); only what's inside
(`PanelBody` in `panels.tsx`) is a lazy piece, behind
`<Suspense fallback={<PanelLoading panel={…} />}>`
(`panel-preview.tsx`, which the panels also use while their numbers load,
so nothing jumps). The video's panel renders the same `VideoTop` (player,
then what's beside and under it) while its numbers load and once they're
in, so a video started at once goes on playing (1.34.5: the player used to
be built anew when they arrived, and stopped); a `Player` built anew just
after a press (the stand-in swapped for the panels' code) plays at once
(`pressed`, forgotten 1.5 s after its player goes). A list row
(`VideoRow`) is laid out by its own width (`.vrow`, a container query in
globals.css), not the window's: under 540px the multiplier is on the
picture and the title has the width. General rule: a `dynamic()` (or `lazy()`) component that
first renders after a click needs a `loading` (or its own `<Suspense>`):
without one it suspends up to the route's loading.tsx and the whole page
flashes its loading screen. Wherever a usual sits next to a ×, it's
`usualThen(v)` (`lib/scores.ts`: views ÷ score, the median of the channel's
videos just before it, which the score keeps as the views move), never
`channel.usual` / `longMedian` (the channel's usual now); say both only
when `usualsDiffer`. Engaged views exist only for the team's own videos
(`VideoDetail.own`, from `analytics_content`). A tab, niche or kind change
calls `toTop()`. "Your viewers watch it" comes from
`outlier_audience.pairs` (0106, ≤ 12 `{ours, from, views}`), which
`buildAudience` fills through `AudienceReads` / `audienceRows`
(`lib/audience-pairs.ts`: a pair seen in two reads counts once, at its
bigger number).

**Scroll bars (1.29.10).** One look, drawn in `globals.css` (the
"Scroll bars" block) only where the system's bars take room: the root
layout's first script measures and sets `<html data-bars="classic">`
(Windows, Linux, a Mac set to always show them); phones and a Mac's
floating bars stay native (`color-scheme` makes them light in dark mode).
Never set `scrollbar-width` or `scrollbar-color` outside the Firefox-only
`@supports not selector(::-webkit-scrollbar)` block: Chrome ignores every
`::-webkit-scrollbar` rule on a box that has either (inherited too) and
Windows then draws its own bar with arrow buttons. Classes: nothing for a
plain scroller, `.styled-scroll` for a rounded box, popup body or menu (the
bar keeps clear of the corners), `.widget-scroll` for a list in a widget,
`.side-scroll` for the side bar, `.no-scrollbar` for swipe rows. A
scroller that only goes up and down gets `overflow-x-hidden` (otherwise a
too wide child makes it scroll sideways), and a table or strip that
scrolls sideways gets `overscroll-x-contain` (a swipe past its end stays
there instead of going back a page). A bar that changes when its box is
pointed at needs the box's own style to change too (`--bar-hover`), or
Chrome doesn't repaint it.

**Outliers' Audience tab (1.29.11).** Its list logic is pure in
`modules/outliers/lib/audience.ts` (`audienceMatches`, `audienceList`):
search and sort there, never in the component. A card's Add goes straight
to `ctx.niche` when it's one of the team's (or to the team's only niche)
and only offers a menu otherwise; the multi-pick flow (Select) is a mode,
not checkboxes on every card. Channels added in this visit are kept in the
tab (`inNiche`) until the page is read again.

**Search's filter bar (1.30.0).** Search's filters are pills over the
results (`FilterBar`, `modules/outliers/components/filter-bar.tsx`); what a
pill says and clears, and what sits under More filters, is pure in
`modules/outliers/lib/filter-bar.ts`. A new filter goes either into a pill
(one that people use all the time: give `pillValue` and `clearPill` a case)
or into `MoreFilters` (add its key to `MORE_KEYS` and a chip to
`moreChips`, so it counts and can be removed). A pill's choices are an
`AnchoredMenu` with `role="dialog"`; choices from a list close it, chips
leave it open. `AnchoredMenu` follows its button on scroll and closes when
the button leaves the screen, so a menu can open from a row that scrolls
sideways.

**Taking a channel out of a niche, and rows that fit (1.30.1, 0102).**
What a video's panel offers to take its channel out of is
`VideoDetail.niches` (since 0102 exactly the niches it shows in); a
channel's is `countsIn(d.niches)` (`modules/outliers/lib/membership.ts`).
A change to a channel's niches goes through `changeNiche` and the shared
caches in `modules/outliers/components/detail-cache.ts`: update the panel on
screen and its cache entry, then `forgetChannel` (with the niche's id) so
its other panels and that niche's list of channels are read again. `setChannelHidden` takes a channel with no row in the niche
(hiding it writes a hidden row; the niche is checked to be the team's
first). Rows of chips or buttons never slide sideways on a computer: they
wrap from `sm` (`sm:flex-wrap sm:overflow-visible`) and swipe only on
phones; a row of underlined tabs gets `<TabOverflow />` as its last child
(`components/ui/tab-overflow.tsx`, its `<nav>` needs `relative` and each
tab a `data-label`), so the ones that don't fit go under More. Check a
page with the harness sweep: no element with `overflow-x: auto` whose
content is wider than it, at 1024 to 1920 wide.

**Secrets (1.31.0).** A key or secret is read only on the server: in a
route, a `"use server"` file, or a module that starts with
`import "server-only"`, and never with a `NEXT_PUBLIC_` name (those are
built into every browser). Never pass one to a browser component as a prop
or in an action's answer; a page that needs to show it shows whether it's
set. Every new setting gets a few lines in `.env.example` (no value).
Tokens kept in the database are sealed with `encryptToken` and their
columns stay out of the browser's grants. An endpoint that spends one of
the app's own keys (Giphy, LanguageTool, YouTube) checks the signed-in
person itself, not only through the middleware, and takes `overLimit`
(`lib/rate-limit.ts`). In a GitHub workflow, never write `${{ … }}` inside
a `run:` script: put it in `env:` and use the variable. `tests/secrets.test.ts`
checks all of this, and scans the code for anything shaped like a key.

**Public addresses and public files (1.31.1, 0103).** A page or API
that should open without signing in goes into `lib/public-paths.ts` as an
exact address (or a folder ending in `/`), never a prefix of a name.
Anything that anyone can call and that does real work (like
`/api/health`) answers from a short memo instead of working on every call.
Public buckets take only what they're for: a picture bucket lists its
types in `allowed_mime_types` (the same `PICTURE_TYPES` the app checks
before uploading, never SVG or HTML) and has a size limit, and its files
get random names. A file of any kind (comment attachments) goes up with
`storedTypeFor(type)`: a kind on `ATTACHMENT_TYPES` as itself, anything
else (a page, an SVG, a script) as a plain download; the bucket takes the
same list (0107, `tests/database.test.ts` compares them). Drawings and
other uploads the server prepares go through a signed upload link, not a
storage rule. No `console.log` in the app (`console.warn` / `error` for what
someone must look at), and an error screen shows the digest, never the
error.

**Packages (1.31.2).** Add a package only when nothing in the app or the
platform does the job, and remove it in the same change that stops using
it: `tests/packages.test.ts` fails on a listed package nothing uses, on a
lock that doesn't match package.json, and on any new package that runs an
install script (look at what it runs, then add it to the reviewed list).
Dependabot opens one pull request a week into staging with the small
updates; a major version is a change of its own, by hand.

**Vulnerability gate (1.31.7).** `npm run build` runs `scripts/audit.mjs`
before Next builds anything, on your computer, in CI and on Vercel, so a
version with a known vulnerability never builds and never deploys (CI's
"Known vulnerabilities" job runs the same check, so the red ✗ says why). It
asks npm twice: what the app ships (`--omit=dev`) stops the build from
**moderate** up, the build tools (devDependencies only) from **high** up;
the rest is printed. When it stops a build:
1. Read the log: the package, where it sits (`postcss (inside next)`), the
   advisory and what would fix it.
2. A fixed version within range: `npm install <package>@<version>` (or
   `npm update`), push package.json and package-lock.json together.
3. Only a new major version fixes it (npm says "isSemVerMajor"): first look
   for a newer release of the package that holds it; otherwise make
   everything use a fixed copy with `overrides` in package.json, as 1.31.7
   did for PostCSS inside Next.js 15 (`"overrides": { "postcss": "$postcss" }`
   with postcss itself at the fixed version in devDependencies). Never
   `npm audit fix --force` (it jumps or even downgrades majors).
4. No fix exists and it can't reach the app: a waiver in
   `security/audit-waivers.json` (`id` = the GHSA, `package`, a `reason`,
   `until` at most 90 days ahead). After the date it lets nothing through;
   one npm no longer reports is pointed out so it can go.
If npm can't be reached the build stops too (nothing unchecked goes out);
during a real npm outage, `AUDIT_UNREACHABLE=allow` in Vercel's settings lets
one deploy through unchecked; take it out right after. The rules are pure
(`scripts/audit-rules.mjs`) and `tests/audit.test.ts` checks them, the
wiring, and that the lock holds one PostCSS of 8.5.10 or newer.

**Pictures (1.31.3, 0104).** Anywhere a picture can be picked, check it
with `pictureTooBig(file)` (5 MB) or `pictureTooBig(file, "thumbnail")`
(15 MB) from `lib/image/limits.ts` before anything else, then
`compressImage(file, IMAGE_PRESETS.x)` before it goes up. A preset is the
biggest the picture is ever shown, three times over for a sharp phone, and
`cover` when it's shown cropped to a square. Keep the original's own
numbers only where they mean something about the file someone made (Thumbnail
Studio's YouTube checks). A new public bucket for pictures gets the same
size limit and `PICTURE_TYPES`.

**Notifications and toasts (1.31.4).** Anything someone does in the bell
shows at once: put it in the overlay (`lib/notification-optimism.ts`) and
on the list, call the server, then `settle` on success or take it back
exactly as it was, with a toast, on failure. Every list that arrives (the
layout's, a refresh, a realtime refetch) goes through `withOverlay` /
`rowWithOverlay` first. A card leaves by `startLeave` (it slides out, then
its slot closes; never remove it from the list straight away) and arrives
by `enter`. Something else that can be swiped away uses `useSwipeAway`
with `touch-action: pan-y` on the card. A server action the bell calls
returns `{ error?: string }` instead of throwing.

**Glass pop-ups (1.31.5).** A new pop-up gets the glass look with
`glass-pane` on its `bg-surface` box (the rule is `.bg-surface.glass-pane`,
so it outranks the one that keeps other floating boxes nearly solid), and
`glass-lift` too when it sits over a dimmed page. A new rule that sets
`--tw-bg-opacity` on floating `bg-surface` boxes must not be more specific
than that: `tests/glass-popups.test.ts` checks.

**Sign-in limits (1.31.6, 0105).** Anything that checks a password
(signing in, deleting an account, changing it) gets `signInKeysFor(email)`,
asks `signInWait(keys)` first and stops while it's above 0 (`waitText`),
then tells `noteSignIn(keys, ok)` how it went: counted as wrong only when
`signInOutcome(error)` says "wrong", never when Supabase is busy or
unreachable. The limits let everyone through when they can't be read:
never make signing in depend on them.

**Long video review (1.25.0, 0089).** `long_video_versions` and
`long_video_comments` mirror the shorts' tables (0038), keyed by
`project_id`. `modules/review/` serves both: `ReviewKind` ("short" or
"long") picks the tables (`lib/queries.ts`), the actions (shorts:
`app/(dashboard)/shorts/[id]/review/actions.ts`, long videos:
`app/(dashboard)/videos/[id]/review/actions.ts`), the bucket and the shape
(long videos are 16:9). Masters, schedulers and editors upload while the
video is at Edit. Reviewing in ClipTroop is the video's `in_app_review`
(only masters change it: `long_review_fields_guard`) or else the team's
`long_in_app_review`; when on, `long_mark_edited` refuses until a version is
uploaded. Approving (`long_review`) records the latest version as
`approved_version_id`; the Post step shows that file to watch or download
(`videos/[id]/video-file.tsx`). Files can be up to `NEXT_PUBLIC_MAX_LONG_VIDEO_MB`
(at most 3072, the bucket's own limit; unset = the shorts' limit), and
Supabase's global file size limit must allow it too.

**Thumbnail Studio (1.25.0).** `modules/studio/`: the thumbnails are one row
on top at every size and the preview gets the whole width (`ScaleFrame` with
`fill` draws the desktop pages at the real width instead of scaling up).
Compare and Titles show several thumbnails, or one thumbnail with several
titles (`package_titles`, 0089, plus the video's title ideas), up close
(`FocusFrame`: the page at its real size, cropped around the element marked
`data-mine`) or as whole pages. Search and the long videos list show a
video's winning thumbnail through `/api/package-thumb/<entry>` (a stable
address, cached by the browser), else its first sketch from Ideate.

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
by the server before scheduling). Since 1.34.3 the card (`schedule-panel.tsx`)
says where each platform is in that platform's own row (1.34.5: the row of
tiles that repeated it over the card is gone); When is In 30 min,
Team's times (`teams.post_time_*` on the planned day, where a short planned
for a later day starts) or Choose (`post-times.ts`, pure and tested; every
check, the review and what's sent go through `whenOf`); one caption for
Instagram, TikTok and Facebook unless one gets its own (`captionOf`); the
plan and the buttons stick to the bottom of the window; published and quietly
waiting posts fold to one line (`calm`). TikTok's required parts (nickname,
privacy with no default, comment / duet / stitch, commercial disclosure,
Music Usage Confirmation) stay on the card: TikTok's review checks them.
**A platform's logo** is always in full colour; posted there, it gets the
teal tick: `PlatformMark` (`modules/short-videos/components/platform-mark.tsx`),
never a greyed-out logo for "not posted" (greyed is for off: a picker's
unchosen platform, an account not connected).
The Posting page (a dashboard since 1.24.0) reads unfinished posts (soonest
first), the latest 100 published ones, the platforms' copies of the last 30
days (`analytics_content`, the connected accounts only) and the shorts
marked as posted; `modules/posting/lib/dashboard.ts` (pure, tested) works
out the lists, who posted what (ClipTroop's posts carry its logo), the
numbers on top and each platform's card, and `modules/posting/components/`
shows them in tabs kept in the address (`?tab=…&platform=…`), filtered in
the browser. Posts not out yet use a frame of their video as the thumbnail
(`/api/frames/<version>`, the strip saved at upload). Platform chips
everywhere are `modules/short-videos/components/platform-filter.tsx` (also
the dashboard's Posting today widget, `compact`).

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

**When a task is done (1.35.2).** A video's step task is done the moment the
video moves past the step (`sync_item_tasks`), whatever its date: the date
is only when it's due. One exception was a short's Ready to post task
("Schedule the posts"), which waited for the short to become Posted (its
last post out, on the day). Since 0111 it's done once every platform the
short goes to has its post set up (`short_ready_scheduled`: a
`social_posts` row not failed or cancelled, or a `short_video_posts` row),
marked `done_by_schedule`, and only such a task comes back (the same row)
if a post is then cancelled or fails while the short is still at Ready to
post; `sync_item_tasks` never adds a second one then. `social_posts`
(insert, delete, a change of status only, never its progress),
`short_video_posts` and a change of a short's platforms re-sync it. A
finished task keeps the date it had (`due_date`): the history (My tasks →
Done, a day on Contributions) says "Done early on Oct 26, due Oct 29"
when it was done before that day where you are (`doneEarly`,
`modules/dashboard/lib/done-early.ts`).

**Daily word.** `lib/word/` (answers are server-only; the list of valid
guesses, `words.ts`, is shared since 1.15.0 so the board can refuse a
non-word at once; `score.ts` is shared). Plays (`daily_word_plays`, 0077) are written only by the
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

**Objectives (0078).** `objectives` holds each goal (masters write it: a
metric id, a period, a target, `filters` jsonb, a colour, its position,
paused), `objective_targets` a different target for one period (0 = that
period off), and `objective_periods` the server's record of the current and
previous periods (value, `reached_at`, the winner). Only the service role
writes that record, through `objective_record()`: a period is won once per
target (raising the target past the count can win again), and masters' own
changes record quietly (no confetti). Progress itself is never stored: it's
worked out from the data every time by `modules/objectives/lib/`:
`periods.ts` (days, weeks Monday to Sunday, months, quarters, years in the
team's time zone), `metrics.ts` (what each metric is, its filters and words),
`hits.ts` (what counted and on which day: pure and tested),
`compute.ts` (pace, forecast, streaks), `sources.ts` (loads only the rows the
goals need), `board.ts` (the page, widget and Team tab data) and `sync.ts`
(records wins and congratulates the whole team with `sendNotifications`, kind
`objective_reached`). The count runs after every change that can move a goal
(shorts and long video actions, the posting worker, the analytics sync:
`queueObjectivesSync*`), when a page or widget loads (at most every 30 s per
team, `objective_claim_sync()`), and in the 10-minute status job. Screens
listen to `objective_periods` (plus `objectives`, `objective_targets`) and
reload through `loadObjectivesBoard()`; `ObjectiveCelebrations` (app shell)
throws the confetti for new wins and for the ones missed in the last two
days. A new metric = an entry in `METRICS` and its case in `hitsFor()` (with
a test); the database only checks the id's shape, so no migration.
A goal only judges the time since it was set (1.15.0): periods before its
creation day are `before`, a finished period with no platform numbers is
`nodata`, and streaks, bests and "reached N of M" come from `statsOf()` over
the counted periods only (`firstCounted()`, `compute.ts`). The editor's
preview (`whatIf`) still shows how the target would have gone.

**Win streak (1.18.0, no migration).** `modules/objectives/lib/streak.ts`
(pure, tested in tests/streak.test.ts): a win is any `objective_periods` row
with `reached_at`, counted on the day it was reached but never after its
period's last day (`winDay()`: late numbers count for their period). The
streak counts in the shortest period the active goals use (`streakUnit()`:
days with a daily goal, else weeks…), from the first goal of that length; a
finished period without a win breaks it, the current one only adds once it
has a win, and a period every goal of that length was switched off for
(an `objective_targets` target of 0) neither breaks nor counts. Also the
best run (`bestBefore` = before the current period: "New best!"), days since
the last win (any win) and the strip (`slots`: this week's days, or the last
7 weeks, 6 months…). `getWinStreak()` in `board.ts` loads it (the page's
board with `streak: true`, `loadWinStreak()` for the dashboard's Win streak
widget through `useLiveStreak()`). `ObjectiveCelebrations` shows the
streak's card after a win's, once per period and device
(`vp-streak-cheers`, keyed by team, unit and the period's start).

**Whose numbers (0079).** Analytics only ever shows the accounts connected
now. `analytics_syncs.account_ref` says whose numbers a platform's rows are
(the platform's own id, or `name:<name>` for rows from before 0079) and
`account_since` when that account was connected. `adoptAccount()`
(`modules/analytics/lib/accounts.ts`) runs on every connect, reconnect and
Facebook Page pick: the same account keeps its numbers, a different one
purges the old rows (`purgeNumbers`, every table in `NUMBER_TABLES`) and the
next sync backfills. Every reader of the analytics tables filters through
`numbersVisibility()` (`visibleRows()`, `inAccountTime()` for our own posts),
so a disconnected account's numbers leave without being deleted and come
back if the same account is connected again. Add any new analytics table to
`NUMBER_TABLES` and filter its readers the same way.
`analytics_claim_legacy()` (service role only) cleaned the rows mixed before.
Don't filter the platforms' own rows (`analytics_content` and anything keyed
by a platform's video id) with `inAccountTime()`: another account's rows are
deleted when it's replaced, so every stored video is the connected
account's, including the ones posted years before it was connected (doing it
emptied Top content and Insights for channels connected lately, fixed in
1.21.0). `inAccountTime()` is for the app's own posts (`short_video_posts`),
which stay when an account changes.

**Views on a day (0079).** `analytics_content_days` keeps each video's views
per day: YouTube's real per-day numbers (`source = 'daily'`, one report per
day, `syncYouTubeVideoDays`) and, for the others, the running totals of each
morning's copy (`'total'`), whose differences give the day.
`getViewsDay()` builds the Views per day dialog; `loadViewsDay()` asks YouTube
for a day the copies missed (at most every 10 minutes per team and day).

**Projections (0080).** `projections` (masters write; immutable once set:
metric, scope, start day and value, the `baseline` for Compare) and
`projection_points` (one value per day, written only by the service role).
Money metrics (`money`, generated) are readable only with
`can_view_revenue()`. Code in `modules/projections/lib/`: `metrics.ts` (every
metric, its units and words), `compute.ts` (`valueAt()` from the rows, the
trend, `assess()`: pure and tested), `data.ts` (loads only connected
accounts' rows), `board.ts`, `record.ts` (today's points, reached and ended
once each, notifications `projection_reached` / `projection_ended`). Points
are recorded by the morning analytics job (all teams) and when the page is
opened before it ran (`queueRecordIfDue`). A new metric = an entry in
`PROJ_METRICS` and its case in `valueAt()` (with a test); no migration.

**Daily word guesses (0079).** The server scores a guess against today's word
(the browser never knows it) and saves it in one step with
`daily_word_guess()` (service role only: appends under a row lock, refuses a
repeat or a seventh try). The browser checks the word list itself
(`words.ts`, loaded after the page is up) and starts flipping the tiles at
once; the colours land when the answer comes.

**Advanced analytics (0081).** The sync is split in three:
`modules/analytics/lib/sync.ts` (per platform: the daily copy, as before),
`sync-core.ts` (the shared plumbing: `upsert`, `ytFirst` (tries metric sets
until YouTube accepts one), dates) and `sync-advanced.ts` (everything extra).
The extras get a time budget (`deadline`: 30 s after they start) and stop
cleanly when it runs out; the next run carries on. They write:
- `analytics_breakdowns`: one row per dimension × key. `span = 1` is one
  day (YouTube's traffic sources, devices, operating systems, playback
  locations, subscribed or not, YouTube product); `span` 7 / 28 / 90 / 365
  is a window ending on `day` (age × gender, sharing services, traffic by
  content type, search terms, outside sites, suggesting videos, playlists,
  and since 1.21.0 countries; Instagram's 7 / 28-day splits and follower /
  engaged-audience demographics), replaced whole each time and fetched
  again after 20 hours; `span = 0` is everything up to `day`: with
  `external_id = ''` YouTube's whole channel life (1.21.0, the same
  dimensions, for Lifetime and ranges longer than a year), with a video's id
  that video's splits since it was published (1.21.0: every dimension in
  `VIDEO_SPLITS`, `sync-advanced.ts`, asked when its page opens). Which
  window a range shows: `lib/windows.ts` (pure and tested): `spanFor()`
  (Lifetime or more than a year → 0), `pickSpan()` (the one asked for, else
  the nearest by ratio; the whole life counts as two years), `windowWords()`
  (what the card says it covers) and `youtubeCountries()` (the map: the
  days' own countries when they cover 90% of the range, else the nearest
  window).
  `analytics_breakdown_sums()` (security invoker) adds the per-day rows over
  a range, weighting `value` by views.
- `analytics_retention`: each video's curve, up to 101 points `[where 0…1,
  share still watching, vs similar videos or null]` (YouTube's
  `elapsedVideoTimeRatio`; Facebook's `post_video_retention_graph`). New
  videos are fetched every two days for their first month, then every two
  weeks, 6 per run.
- `analytics_content_revenue`: each video's revenue, CPM, ad impressions
  and monetized playbacks (`can_view_revenue()` only).
- `metrics` jsonb on `analytics_daily` and `analytics_content` (≤ 8000
  bytes): every other number a platform shares (Premium views, cards,
  playlist removals, accounts engaged, profile link taps, Reels replays…).
  supabase-js upserts fill missing keys with null, so the sync merges the
  stored `metrics` first (`keepStoredMetrics()`, `sync-core.ts`).
  `analytics_revenue_daily` gets CPM, playback CPM, ad impressions and
  monetized playbacks.
All three tables are in `NUMBER_TABLES` and read through
`numbersVisibility()`, like the rest. The page is `getAdvanced()`
(`modules/analytics/lib/advanced.ts`): groups of numbers with the range
before, the series, retention (`lib/retention.ts`, pure and tested), the
breakdowns, every video, and `findPatterns()` (`lib/patterns.ts`, pure and
tested: medians per group, at least 3 videos in a group and 6 in all, only
videos a week old or more, "strong" when both groups have 6+ and one is 1.5×
the other). Hooks come from the video's own script (`lib/hooks.ts`:
staging, then review, then write). A new number = a column (migration), the
sync line that fills it, a tile in `advanced.ts` and its label in
`advanced-labels.ts`.

**A video's own analytics (1.17.0).** `/analytics/video/<platform>/<id>`
(`?tab=advanced`, `?from=content|advanced|audience|dashboard` for the back
link): `getVideoAnalytics()` in `modules/analytics/lib/video.ts` (the person's
own client and `numbersVisibility()`, like every reader). "× typical" (the
outlier score, `lib/scores.ts`, pure and tested): views ÷ the median views of
the same platform's videos of the same kind posted just before it (up to
30; fewer than 5 before it → all the others). The same scores sit on
`AdvVideo.score` (`withScores()`), the Content tab's items and Download for
Claude. Growth: `cumulativeByAge()` turns analytics_content_days into views
since posting (YouTube's per-day numbers, or the copies' running totals with
straight lines between them), `typicalCurve()` takes the median of the 30
before it at each age (kept from falling) and is only drawn where it
overlaps 3+ days. YouTube can send any video's whole day-by-day history: the
page calls `fillVideoHistory()` when its first days are missing (the video
for its whole life, up to 9 of the ones before it for their first 60 days;
at most every 30 minutes per video and server), `fetchYouTubeVideoHistory()`
in `sync.ts` saves it (0 for quiet days between the first and last YouTube
answered for). Every list of videos links here (`videoHref()` in
`components/content-list.tsx`).

**A video's tabs (1.21.0).** Like YouTube Studio's: Overview, Reach,
Engagement, Audience, Revenue, Advanced (`?tab=`;
`components/video/video-tabs.tsx`, the pieces in `video-parts.tsx`).
`tabsFor()` keeps what the platform shares: no Reach for TikTok, Audience
for YouTube only, Revenue for the people who see revenue. The header shows
views, watch time, likes, comments and revenue, in even rows at any width
(`.stat-cq` / `.stat-grid[data-n]` in `globals.css`: a container query, all
in one row when they fit); the verdict and realtime sit beside the video
only from xl (long videos) or lg (shorts), else under it. The Overview's
cards switch its chart (`TabbedChart`), with realtime beside it and "See
more" to Advanced. A YouTube video's splits (span 0 with its id) and its numbers per
day (with `subscribers_gained` and `avg_view_seconds`, 0085) are asked from
YouTube when the page opens and they're missing or more than 12 hours old
(`loadVideoDetails()` → `fetchYouTubeVideoDetails()`, at most every 10
minutes per video and server); the page refreshes when they land. Its money
per day (`loadVideoRevenueDays()`) is asked live, like the videos behind a
stretch of Revenue's chart (`loadRevenueVideos()`), and kept 10 minutes in
the server's memory, never stored: it would need its own revenue-only table
(RLS), for something opened now and then. `getVideoAnalytics()` reads the
per-day columns the database has (`contentDayCols()`), so the page works
before 0085.

**Analytics → Content (1.17.0, 1.20.0).** `components/tabs/content-tab.tsx`
+ `components/content-list.tsx`: the range's videos from `getContent()`
(Lifetime: `every`, all of them; the old `?every=1` opens Lifetime), a tab
per kind (All, Long videos, Shorts, Posts) with totals worked out in the
browser (views split into Shorts and long, CTR weighted by impressions).
Sorting happens in the browser; the table / grid choice is kept on the
device (`vp-content-view`). Finding one video: the app's search
(`searchVideos()` → `findVideos()`: the platform's title, the ClipTroop
short's or long video's title, or `#number`).

**The Analytics page (1.20.0, 1.21.0).** `app/(dashboard)/analytics/page.tsx` reads
`?tab=` (`readTab`: overview by default), `?range=` (`readRange(v, tab)`: 48h
only on the Overview; `lifetime` starts on the team's first `analytics_daily`
day, which for YouTube is the channel's first day with views once its
history is in (below), Production's on the team's first day; `custom` needs
`?from=&to=`, checked by `readCustom`, else 28 days) and loads only the
open tab's data; `components/analytics-view.tsx` is the shell (tabs,
`range-bar.tsx`, compare, CSV) and `components/tabs/*` the tabs. The tab or
range clicked shows at once with a spinner while the server renders
(`pending`); Compare is switched in the browser (`history.replaceState`,
the stretch before is already loaded). Pure parts, all tested:
`lib/ranges.ts`, `lib/trend-math.ts` (each platform's day from the copy,
buckets, running totals, weighted rates), `lib/insights-math.ts` (alerts,
best time to post, tips).

Speed (1.21.0): read the columns a page uses, never `select *` on the
analytics tables (`metrics` is up to 8 KB a row): `dailyCols()`
(`queries.ts`, with impressions and CTR once 0083 has run), `contentCols()`,
`INSIGHT_COLS`, `contentDayCols()` (`video.ts`). The mock (`scripts/dev-mock`)
ignores select lists, so check a new column against the migrations. Grids
of cards of different heights (Audience, Advanced) go through
`byCardHeight()` (`advanced/breakdowns.tsx`) so rows end evenly; long rows
of cards scroll sideways in `CardStrip` (`charts.tsx`).
- Overview: `lib/overview.ts` `getOverview(team, w, {hourly})`: every number
  per platform and per day, now and the stretch before, YouTube's Shorts /
  long split, revenue in the person's currency, the videos posted each day
  (the chart's marks: the sidebar's Shorts and long-video icons in the
  team's colours, `MarkIcon` in `charts.tsx`), the newest 6 with "×
  typical", YouTube's all-time views; 48 hours =
  `analytics_live_hours(team, 96)` (compared only once the 96 hours were
  all counted); `top` is a promise the page streams
  (`analytics_top_content`, 0084, else the most viewed posted in the range;
  Lifetime: the most viewed ever, from `analytics_content.views`), like the
  hints (`getInsightsPreview`), both read with React's `use()` under
  Suspense. Changes next to "before" show only when the stretch before has
  numbers on 80%+ of the days this one has (`fairBefore`). Two columns on
  wide screens (1.21.0): the chart and lists, then realtime
  (`RealtimePanel`), the latest videos and hints beside; on phones realtime
  sits right under the chart (rendered twice, `lg:hidden` / `hidden
  lg:block`, from one `useRealtime()`).
- Realtime: `getRealtime(team, {full})` (+ `analytics_live_buckets`, 0084:
  6 slots of 10 minutes ending now, the same sum as
  `analytics_live_gains(60)`), `useRealtime()` in
  `components/realtime-card.tsx` keeps it fresh. 1.21.0: a 48 hours / 60
  minutes switch (`active48` / `active60`, `top60`, `reactions60` in
  `lib/realtime.ts`; `perSlot()` in `live-math.ts`), the accounts on top.
- Revenue: click a day (a week, a month) of the chart for the videos that
  made YouTube's money then (`RevenueVideosDialog`,
  `components/revenue-videos.tsx` → `loadRevenueVideos()` →
  `fetchYouTubeRevenueVideos()`: YouTube's top 25 by estimated revenue,
  asked live; skipped when that stretch's YouTube revenue is 0).
- Audience: `getAudience()` (+ `followersDaily` / `followersFlow`) and
  `getAudienceBreakdowns()` (`advanced.ts`: `buildBreakdowns()` /
  `readBreakdowns()`, shared with Advanced).
- Insights: `lib/insights.ts` `getInsights(team, tz)`: every video (3,000
  newest), `findPatterns()` per platform and kind, `outlierScores()`, the
  last 8 weeks of daily rows for the alerts. Each finding carries `sides`
  (1.21.0: up to 5 typical videos that fit it and 5 of the rest, the ones
  nearest each side's median, `typicalOf()` / `sidesOf()` in
  `patterns.ts`), shown by its Examples button
  (`advanced/findings.tsx`); the preview drops them.
- Advanced: `?view=` (`components/advanced/views.ts`), switched in the
  browser with `history.replaceState` (the data is already there).

**The morning copy (0082).** The 05:10 UTC timer runs `analytics_morning()`:
one `posting_call()` per team and platform with an active account, so each
gets its own function time. `runAnalyticsJob({ team, platform })` copies just
that one (`syncTeamAnalytics(team, { only, log })`); 05:40 and 06:40
(`{retry: true}`) copy whatever wasn't copied fine since 04:00 UTC, then the
projections of teams without accounts and the timer check. Every run writes
`job_runs` (started, finished, ok, detail: `lib/job-runs.ts`); a run without a
finish ran out of time. `status_checks()` reads it, so "Analytics updates"
says why a copy is late (out of time, failed, never started), and Developer
→ Status lists the runs. Status problems alert with a stable text
(`Check.alert`): once when they start, at most once a day (record_app_error,
source "job"), and once when they're over (`reportFixed()`).

**Every video within minutes (0083).** `analytics_live_fanout()` calls the
app once per team and platform every 10 minutes; `lib/live.ts` reads the hot
videos each time and every video every few hours (a long list goes on from
`analytics_syncs.live_cursor`), keeps their counts in `analytics_live` when
they change (`snapshotsOf()` in `lib/live-math.ts`, pure and tested), and
refreshes the other numbers of the videos with the oldest `details_at`.
`analytics_live_hours()` / `analytics_live_gains()` (security invoker) sum
the changes per hour and per video, spreading each change over the time
between two looks; Realtime (`components/tabs/realtime-tab.tsx`), the
Overview's 48 hours and a video's page read them. Account totals go to `analytics_syncs.live_totals`,
never to `analytics_daily`: a per-day row's numbers must stay the morning
copy's, because day-to-day changes are what a day got (TikTok's views,
followers). YouTube quota: list calls cost 1 unit per 50 videos and an
upload 1,600 of the default 10,000 a day, so the live job stays around 600
units a day per 1,000-video channel; don't add per-video Data API calls.
`LIVE_MINUTES` (20, 30, 60) makes it read less often. Impressions and CTR
come from the YouTube Reporting API (`lib/reach.ts`: one job per channel,
new daily reports once an hour) and need that API turned on in the Google
Cloud project.

**YouTube's whole history (0085, 1.21.0).** The first copy fetches 90 days;
every copy after it (the morning's, Sync now) goes further back while it
has time (`youtubeHistory()` in `sync.ts`, up to 8 s past the extras'
deadline, before the slower extras): a year per report, newest first, down
to the channel's `snippet.publishedAt`: the per-day totals, Shorts vs long,
the per-day splits and the money. `analytics_syncs.history_from` is how far
it got, `history_done` that it reached the start; `adoptAccount()` starts it
over when another channel is connected. `lib/history-math.ts` (pure and
tested): `historyChunk()` (the next year back, never before the channel's
first day) and `historyRows()` (rows from the first day with views, the
quiet days after it as 0). So Lifetime starts when the channel did, a copy
or two after connecting, and the window snapshots' span 0 (above) covers
the splits of the whole life. Only YouTube sends a channel's old days; the
other platforms' days start where their first copy reached.

**Sync now (0085).** `syncAnalyticsNow()` (masters and schedulers) calls
`analytics_sync_now(team)` (security definer: checks the role; at most once
every 90 seconds per team, `analytics_syncs.sync_requested_at`, else -1),
which sends one `posting_call({job: 'analytics', team, platform, live:
true})` per platform with an active account and answers at once;
`runAnalyticsJob()` copies that platform, then its live counts with the time
left (if more than 8 of its 52 s). Copying every platform inside the
request took longer than a request may last: the crash in 1.20.0. Before
0085, or without the timer's secrets (a local copy), it copies them in
`after()`. `claimAnalyticsCatchUp()` (the first visitor starts a copy when
the last one is 30 hours old) looks at most every 5 minutes per team and
server.

**Download for Claude.** `modules/analytics/export/`: the dialog
(`claude-export.tsx`), `build-text.ts` and `build-pdf.ts`, all in the
browser: `loadClaudeExport()` gathers the numbers server side
(`gatherClaudeExport()`, the person's own visibility, revenue only with
`can_view_revenue()`), the files are made on the device. The PDF uses
pdf-lib + fontkit, served from `/vendor` (copied by `scripts/copy-vendor.mjs`
on install, like the other vendored files) and loaded only when someone
downloads. Fonts are in `public/fonts/pdf/` (OFL, `LICENSE.txt`): Inter is
embedded whole (`subset: false`: subsetting dropped letters) and Fraunces
subset (`subset: true`: whole, its spacing broke). Images are turned into
JPEG through a canvas before embedding. Thumbnails come through
`/api/analytics/thumb` (signed in, platform image hosts only, images up to
6 MB, never cached publicly), so the canvas isn't tainted. Claude reads PDFs
under 100 pages, so the PDF stops at 95 (about 240 videos).

**Media kit (1.37.0).** Analytics → Media kit (`?tab=mediakit`, no range
bar: the kit has its own period). A 16:9 PDF deck of the team's numbers for
sponsors, made in the browser like Download for Claude (the pdf-lib loader,
the fonts and the picture helper are shared in `lib/pdf-kit.ts`). The parts,
in `modules/media-kit/`:

- `lib/settings.ts`: the setup (channels, one kit or one per platform, period,
  pages, three or six best videos, light or dark, colour, cover, words, rates
  or on request, packages, brands, quotes, contact) and `readKitSettings`,
  which turns anything into a valid setup (every field checked and cut to
  its limit; anything wrong replaced by its default). The server saves only
  what it returns; the preview and the download lay out only what it
  returns.
- `lib/gather.ts` (server only): the numbers from Analytics' own reads
  (`getAudience`, `getAudienceBreakdowns`, `getContent`, the most viewed
  ever), as the person, the accounts connected now only; `kitWindow` ends
  yesterday like Analytics. `lib/numbers.ts`: the pure sums (growth over
  what there was, change on the period before, engagement over views,
  average views of the videos posted in the period, ages, genders and the top
  five countries in %).
- `lib/layout.ts`: the pages as drawing steps (`lib/scene.ts`: boxes, text at
  its baseline, pictures cropped to their box, paths, links), measured with
  the PDF's own fonts (`lib/fonts.ts`), so the preview
  (`components/kit-page-svg.tsx`, SVG with the same font files) and the PDF
  (`lib/render-pdf.ts`) are the same pages. `lib/theme.ts` makes the colours
  from one (the team's, or the one picked): the ink is a deep shade of its
  hue; every word clears 4.5:1 on what it sits on, shapes 3:1
  (tests/media-kit.test.ts checks eight colours in both themes).
- Pages, in order: cover (a wall of the best thumbnails, a photo, or one big
  number), About us (only with words), At a glance (two platforms or more),
  one per platform, Audience (where the platform shares ages, genders or
  countries; up to four), best videos (the period's, else the best ever),
  brands and quotes (only with some), rates (prices, or "Rates on request"
  with the packages; a platform's kit gets its packages and the ones for any
  platform), contact (the closing line, links, and where the numbers come
  from).
- `components/media-kit-tab.tsx`: the builder (loaded with its tab, in the
  browser only). Masters' changes save a moment after each one
  (`saveMediaKit`); the people given revenue access make kits from the saved
  setup and their own changes. Another period asks for its numbers
  (`loadMediaKitNumbers`); the saved period's come with the page.

Who: the same people as revenue (the rates are money): `media_kit_settings`
(0114) is read by `revenue_team_ids()`, written by `my_master_team_ids()`;
`updated_at` / `updated_by` set by the database. The cover photo goes from
the browser to the private `media-kit` bucket (`<team id>/cover-…`,
pictures only, 5 MB; read by revenue people, written by Masters); the page
signs it for an hour, and the builder signs it again (`mediaKitCoverLink`)
after 45 minutes, on coming back to the page, and before a download, so a
page left open still puts the photo in the PDF. Saving a setup that no
longer uses a photo removes it; deleting the team removes its photos.

**Opening frames.** When a short's cut is uploaded for review, the browser
grabs eight frames from the file (`modules/review/lib/frames.ts`: 0, 1, 2
and 3 s for the hook, then 25 %, 50 %, 75 % and the end) into one JPEG
strip in the private `video-frames` bucket
(`<team>/<short>/<version>.jpg`) and records it with `set_version_frames()`
(checks the path and that the file exists; people can't set
`frames_path` directly). Only uploads from 1.16.0 on have one. The strips
go into Download for Claude as signed URLs that last an hour.

**Sending a script on (1.35.2).** Script's "Ready for review" and Review's
"Ready for staging" (`script-flow.tsx`, `handOffScript`): once sent, the
button is greyed out (and the server refuses another send) until the next
step is done since: for the Script, Review sending it on to Staging or the
script marked done; for Review, "Staging done". Then it opens again (a new
round). `handOffLocked` (`modules/scripts/lib/flow-lock.ts`, pure) decides
for both; the action reads the video's `script_handoffs` for it
(`handOffWait`).

**Script comments.** Each belongs to one document (`script_comments.script_id`:
one short's or long video's script). Comments whose quoted words were since
rewritten or deleted are grouped under "On text that changed since", with
Resolve all (`resolveComments()`).

**Who may change what.** Dates (Calendar moves, long video dates): masters and
schedulers, enforced in the database (shorts' functions, 0073 for long videos).
Script comments and editing ideas: the video's scripters, its Review/Staging
people and masters (`can_comment_script`, 0072); the rest of the team reads.

**Forms.** Don't use `<form action={…}>` for anything that can fail: React 19
empties every uncontrolled box after the action, error or not. Use onSubmit +
`startTransition(() => formAction(fd))` (or controlled inputs), and answer
every save with a toast (it plays the sound).

**Search.** `global_search()` (0024, 0090) is SECURITY INVOKER on purpose:
RLS decides what anyone can find (projections' money rule included). To make
something searchable, add a section in the function (a trigram index on
`lower(column)` if the table can grow), a list in `components/search/types.ts`,
rows in `components/search/build.tsx` and a section in `sections.ts`. Every
list keeps its `score` (4 a #number, 3 the name exactly, 2 its start, 1
inside it, plus how alike); `lib/search/strength.ts` turns those into 0–1 so
the best match goes first whatever it is, next to the app's own pages and
settings (`lib/search/catalog.ts`, matched in the browser by
`lib/search/match.ts`: word starts, typos, other words) and days for the
calendar (`lib/search/dates.ts`). Scripts, notes, captions and descriptions
are only searched from 3 letters (`deep`). Under RLS a filter can only use
an index when it's leakproof, and LIKE isn't: a big table's text search
reads every row. So the scripts part is `search_docs()`, SECURITY DEFINER,
which applies the table's own rule (`team_id = any(my_team_ids())`) and lets
the trigram index work; do the same for any other big text column, and
keep the rule in step with the table's policy. A function that sets
`pg_trgm.word_similarity_threshold` must load pg_trgm first in its migration
(0089, section 7). Tests: `tests/search.test.ts`,
`supabase/tests/search-everything.test.sql`.

**Outliers (1.27.0, 0091).** Research on public YouTube videos: what beats
its own channel's usual in a niche, why, and ideas made from it. No AI.
- Data. `yt_channels`, `yt_videos` (+ `yt_video_stats`, views over time, and
  `yt_video_changes`, title/thumbnail changes) are shared by every team: the
  same video is stored once. A team's niches are `outlier_niches` (keywords,
  words to leave out, language, region, kinds; `team_id` null = the built-in
  Explore niches), their channels `outlier_niche_channels` (source,
  relevance, hidden), tracked channels `outlier_tracked`. Saves
  (`outlier_saves`: videos, channels, ideas, in `outlier_folders`), hidden
  ideas (`outlier_dismissed`, per person),
  `outlier_settings` (alerts, the Monday summary) and `outlier_alerts` (what
  was already announced). The quota and search tables
  (`outlier_quota`, `outlier_search_cache`, `outlier_search_log`,
  `outlier_locks`) are service role only; `outlier_global` holds the
  Explore niches' insights together. Pages read through security-definer
  functions that first check the caller is in the team (`is_team_member`):
  `outliers_overview`, `outliers_videos` (every filter, one query),
  `outliers_channels`, `outliers_video`, `outliers_channel`. An idea
  started as a video is linked by `outliers_link_idea()` (security definer:
  the save, the video and the caller in one team).
- YouTube's rules. Everything stored is refreshed within 30 days or deleted
  (`outliers_purge`, run by the collector): details are read again after
  22 days.
  Views over time are kept `OUTLIERS_STATS_DAYS` (30; up to 1095 only once
  the derived metrics amendment is accepted in YouTube's API Services
  form). Scores, formats, keywords and ideas are ClipTroop's own and say so
  (`SourceNote`); never call a YouTube number anything else.
- Reading YouTube: `modules/outliers/lib/youtube.ts` with `YOUTUBE_API_KEY`,
  else the team's connected YouTube channel. `lib/budget.ts` keeps it inside
  `OUTLIERS_DAILY_UNITS` (searches cost 100 units, lists 1 per 50 videos):
  the collector's share and each person's and team's fresh searches
  (`OUTLIERS_*_SEARCHES`) are counted in `outlier_quota`; a search typed on
  the page reads the stored videos first and asks YouTube only when there
  are few. The collector (`lib/collector.ts`, `runOutliersJob`) does one
  team per call with a time budget and carries on next time.
- Scores (`lib/scores.ts`, pure): a video's score is its views ÷ the median
  of the same channel's 30 previous videos of the same kind (long or
  Short); `projected` is where a young video is heading (`shareAt()`: the
  share of its views a video has at each age); bands for the colours.
- The engine (pure, shared by the collector, the page and the tests):
  `text.ts` (tokens, glue and style words, topic words), `formats.ts` (the
  formats: tests on titles, title patterns, hooks), `keywords.ts` (names,
  "fake iPhone", "GoPro review", never cut names or verbs), `skeleton.ts`
  (title templates found in the data), `titles.ts` (what titles have and
  how that does, a title's score), `insights.ts` (a niche's numbers, saved
  in `outlier_niches.insights` by the collector), `ideas.ts` (ideas: a
  winning format × a strong or rising topic, written with the format's
  patterns or real templates; seeded, so the same day gives the same ideas),
  `similar.ts` and `thumb-math.ts` (thumbnails' colours and look-alikes).
  New format = an entry in `FORMATS` (bump `FORMAT_VERSION`: stored videos
  are tagged again) and a check in `tests/outliers-engine.test.ts`.
- The page (`app/(dashboard)/outliers/page.tsx`) loads only the open tab
  (`?tab=`, `lib/view.ts`); a video's or channel's panel opens over any tab
  with `?v=` / `?c=` (history entries of their own, so Back closes them;
  `components/context.tsx`), `?open=niche` / `?open=alerts` (Outlier
  settings, the gear) / `?open=hidden` open those dialogs. The niche picker,
  the kind switch and the tabs stick under the top bar (`data-shell="subbar"`,
  its height in `--ol-bar` for what sticks under it). Search boxes look things
  up on a button or Enter, never while typing. Ideas are made in the browser from the niche's insights, so
  Shuffle is instant. Start a video saves the idea and opens
  `/videos/new?idea=<save>` or `/shorts/new?idea=<save>`
  (`lib/idea-prefill.ts` fills the form).
- Notifications: `outlier_alert` (a tracked channel's video, or a watched
  word, heading past `alert_min`; the 4 strongest each, the rest in one) and
  `outlier_digest` (Monday from 8 in the team's time zone).
- Which channels count (1.29.0, 0094). A niche is its own channels
  (`outlier_niche_channels.source` manual / seed / audience: always count)
  and the channels its keywords find, which count only once they're judged
  to fit (`verdict = 'ok'`, `rel_v` = `FIT_VERSION`) and the niche takes
  found ones (`only_group` off). `lib/fit.ts` (pure) judges each found
  channel on its own titles against the niche's profile (its own channels'
  words, the titles its keywords found, the keywords): made for kids →
  `kids`, another language (`langs`, null = the team's own, worked out from
  its titles) → `lang`, a country it doesn't take (`regions`, `lib/regions.ts`:
  the channel's country, else its videos' audio language, money or a
  language spoken in one country) → `region`, too little about the topic →
  `topic`. A channel is judged only once its uploads were read (or 8 videos
  are stored); a word only one channel uses isn't part of the niche. The
  collector's fit step (`fitNiche`) checks again when the niche's key
  (keywords, choices, own channels) or `FIT_VERSION` changes; bump it when
  `fit.ts` changes how channels are judged. Search hits count only when the
  video fits (`outlier_niche_hits.ok`). Every page reads through
  `outlier_members` / `outlier_scope`, so the For you numbers, Search and the
  insights all agree.
- Explore niches start from well-known channels (`EXPLORE[].seeds`, read by
  handle) with their own budget (`OUTLIERS_EXPLORE_UNITS`,
  `OUTLIERS_EXPLORE_SEARCHES`; buckets `xunits` / `xsearch`); opening one
  that's still filling starts it (`exploreNow`, once every 4 minutes).
- Hidden channels (`outlier_blocked`, anyone on the team): out of every list,
  alert and insight; their own page still opens. The viewers list
  (`outlier_audience`, the collector's audience step once a day): channels
  whose videos YouTube sends viewers from (`analytics_breakdowns`
  `suggested_by`, and `RELATED_VIDEO` for the team's best 15 videos), with a
  note when it can't (`no-youtube`, `no-analytics`, `nothing-yet`).
- Channels are found by name, @handle or link (`findChannels`: the collected
  ones, then YouTube by handle, a YouTube channel search only on request,
  one of the person's fresh searches). A channel opened that was read only
  shallowly is read deep (150 long videos) in the background.
- Tests: `tests/outliers-engine.test.ts`, `tests/outliers-collector.test.ts`,
  `tests/outliers-fit.test.ts`, `supabase/tests/outliers-fit.test.sql`,
  `scripts/e2e/outliers.e2e.ts` (a real database). The mock
  (`scripts/dev-mock/outliers.cjs`) serves a sample made by
  `npx tsx scripts/dev-mock/make-outliers.ts`; `MOCK_OUTLIERS_EMPTY=1`,
  `MOCK_OUTLIERS_NEW=1` and `MOCK_OUTLIERS_ACCESS=0` show the other states,
  and `scripts/dev-mock/outliers-shot.cjs` takes the screenshots.

**Short videos.** Script → Filming → Editing → In review → Ready to post →
Posted. "Posted" follows `short_video_posts` (every planned platform marked).
`short_guard_update` (0026) decides who may change which field;
`modules/short-videos/lib/permissions.ts` mirrors it for the UI. History is
written only by triggers; numbers come from `next_team_number()`.

**Filming a short (1.36.0).** Like a long video's Film step. The master sends
a short from Script to Filming (`sendShortToFilming`; its filmer is notified,
or every filmer when nobody is set). Its filmer, any filmer while nobody is
set, or a master marks it filmed in the Filming card with the NAS folder
(`markShortFilmed` → `short_mark_filmed`, 0113): it moves to Editing with
`filmed_at`, `filmed_by` and `footage_path` (kept if no folder is given), and
its editor hears it's theirs (the masters, when it has no editor yet, since
it needs one). `filmed_at` / `filmed_by` are written only by that function or
a master; the folder by a master, its filmer, its editor or a scheduler; who
films it by a master or a scheduler (`filmer_member_id`, and the team's
`default_short_filmer_member_id` for new shorts). The filmer gets a Filming
task ("Film it", 30 XP, counted as filming; `lib/profile/progress.ts` lists
the same number). The step itself is in its own migration (0112): PostgreSQL
only uses a new enum value once the statement that adds it is committed, so
0113 can use it. Until 0113 runs, `hasShortFilming()` (asked once per
request) leaves the new columns out of every read and write, and Send to
filming / Move to Filming say to run the migrations.

**The shorts table: export, move, pick, delete (1.38.0).** The table is drawn
by `modules/short-videos/components/shorts-table.tsx` (the page reads and
filters; the cards view stays on the page). Every row's ⋯
(`row-menu.tsx`) is everyone's now:
- **Export script as PDF / Word** (everyone: the whole team reads scripts,
  0034). `shortScriptsForExport(ids)` (`app/(dashboard)/shorts/export-actions.ts`,
  read as the person, 50 at a time) gives each short's script where it is
  now (`flowStartDocId`, the document its Script page opens); the browser
  makes the files (`modules/short-videos/lib/export-shorts.ts`): PDF with
  `modules/scripts/lib/script-pdf.ts` (pdf-lib and the app's PDF fonts: A4,
  the print's 18 mm margins and 12 pt text, headings, lists, ticks, quotes,
  highlights, links that open, pictures, page breaks, page numbers; italics
  are Inter slanted), Word with `scriptDocxBlob` (`export-docx.ts`, the
  script page's own export). Named like the script page's files
  (`12-the-title.pdf`; 1.38.0: `safeFileName` drops accents instead of
  turning them into dashes). A short with no script yet is left out, and the
  toast says so.
- **Move to step** (masters): `moveShortsStage(moves)` (shorts/actions.ts),
  as Move to on a short's page (a correction, nobody is told, never to
  Posted; Editing needs an editor; Filming its migrations), each move
  compare-and-swap on its own step, each answering where it came from, so
  the toast's Undo moves each back (`use-move-shorts.ts`).
- **Delete** (masters): `rowAway` (`lib/remove-animation.ts`) strikes the
  title through (the words' own boxes, a line a row), slides the row off and
  closes the gap; the server is asked after the slide (so the list never
  jumps half-way) and the row comes back if it fails. On a short's own page,
  `pageAway` strikes its title and the page falls away before the list opens
  (`data-short-page`). Animations off: a fade. The `remove` sound plays as it
  goes.

**Select** (the table only, `pick-shorts.tsx`): each row's number turns into
a tick box over the whole row (`[data-selecting]`, `.row-pick`, globals.css),
Shift picks a range, a day's box its day, Ctrl/Cmd+A all, Esc ends it. The
bar at the foot exports each picked short's script (one zip, a file each:
`lib/zip.ts`, stored, UTF-8 names, "(2)" for a name that's taken) or, for
masters, moves them all to a step (asked first; Undo).

**Scheduling queue (0027).** Auto-dated shorts are dated by the database
(`recalc_short_queue`). The app only sets `planned_date` (a pin) or
`schedule_mode = 'auto'`, and reorders through `move_short()`.
