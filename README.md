# ClipTroop (formerly VPlanner)

Internal content-production dashboard. First module: long-form YouTube video
pipeline management.

## Stack

- **Next.js 15** (App Router) — frontend and backend in one project
- **Supabase** — Postgres database, auth, and file storage. Permissions are
  enforced at the database level via Row Level Security (RLS), not just in
  the UI.
- **Vercel** — hosting. `main` branch → production. Every other branch/PR →
  its own preview deployment, pointed at the staging database.

## Project structure

```
app/
  login/                 Sign-in page (email/password, server action)
  (dashboard)/           Everything behind auth
    dashboard/           Placeholder home page
  api/auth/callback/     OAuth/magic-link callback (unused today, ready for
                          Google auth later)
lib/
  supabase/              Client helpers (browser, server, middleware)
  permissions/roles.ts   Frontend mirror of the DB's role → stage rules
modules/
  long-videos/           Where the video-pipeline module's own components
                          and logic will live, kept separate from shared
                          app code so future modules (Shorts, TikTok, etc.)
                          don't get tangled up with this one
supabase/
  migrations/0001_init.sql   Full schema: teams, roles, tags, projects,
                              stages, comments, review pins, RLS policies
types/database.ts        Placeholder types — see note below
```

## First-time setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Apply the database schema.** In your Supabase project (use
   `vplanner-staging` first): open the **SQL Editor**, paste the entire
   contents of `supabase/migrations/0001_init.sql`, and run it. Do the same
   in `vplanner-production` once you're happy with it.

3. **Set up local environment variables**
   ```
   cp .env.example .env.local
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   from your **staging** project (Settings → Data API). Never commit
   `.env.local` — it's already gitignored.

4. **Create your own login.** This app has no public sign-up page on
   purpose. Create your first user from the Supabase dashboard:
   Authentication → Users → Add user (set an email + password). That's the
   account you'll sign in with.

5. **Run it locally**
   ```
   npm run dev
   ```
   Visit `http://localhost:3000`, sign in, and you should land on a bare
   dashboard confirming your session and database connection both work.

6. **(Optional, recommended) Generate real types once the schema is live**
   ```
   npx supabase gen types typescript --project-id <your-project-ref> > types/database.ts
   ```

## Pushing this to GitHub

From inside this folder:

```
git init                        # only if not already a git repo
git remote add origin git@github.com:<your-username>/vplanner.git   # if not already set
git add .
git commit -m "Scaffold Next.js + Supabase project structure, auth, and DB schema"
git push -u origin main
```

Vercel will pick up the push automatically and deploy it.

## Where things stand

This is the **foundation**, not the finished app: real auth, a real
database schema with the full permission model enforced by RLS, and a
proof-that-it-all-works dashboard page. The actual VPlanner interface
(workspace switcher, project pipeline UI, calendar, editor review tool,
etc.) gets built next, on top of this — and on top of a proper design
system pass, since the current styling is placeholder only.


## Security model (read before adding features)

- **RLS is the real boundary.** Every table has Row Level Security. The UI
  hiding a button is convenience, never protection.
- **Users can only edit columns they genuinely own.** Since migration 0022,
  column-level grants restrict what a logged-in user can UPDATE (e.g. only
  `is_read` on notifications, never `owner_id` on teams, never anything on
  invites or ownership requests).
- **Admin client golden rule.** `createAdminClient()` bypasses RLS. Use it
  only in server actions, only after checking the caller is allowed, and
  only with values the user could NOT have edited themselves.
  `import "server-only"` makes the build fail if it ever reaches the browser.
- **Notifications are server-created only** — always via
  `sendNotifications()` in `lib/notify.ts`.
- **Never trust a teamId from the browser for a privileged action.** Derive
  the team from the row being acted on (see `requireProjectMaster`).
- **Database triggers enforce the invariants:** only a Master changes a
  project's stage; projects never change team; the owner can't be removed
  and is always Master; only the owner grants/removes Master.

## Migrations

Files in `supabase/migrations/` are run in order on BOTH Supabase projects
(staging first, then production). Personal one-off SQL goes in
`supabase/scratch/` (gitignored) — never in `migrations/`.

Since 1.8 the **Database** GitHub Action runs them (push to `staging` →
staging, push to `main` → production, or by hand from the Actions tab);
setup and how to write one: `scripts/db/README.md`. Every push also runs
**CI**: type check, lint, `npm test`, a production build, and every
migration on an empty database.

## Performance conventions (follow these for every new feature)

**Database**
- Every new column you filter, join or sort by gets an index in the same
  migration. Postgres does NOT index foreign keys automatically.
  (0064 indexed every foreign key that was missing one; CI's
  "migrations apply from scratch" check runs every migration.)
- Read (SELECT) policies check membership with the set helpers, never a
  per-row function: `team_id in (select my_team_ids())`,
  `project_id in (select my_project_ids())`,
  `recipient_id = (select auth.uid())`, masters with
  `team_id in (select my_master_team_ids())`. The `(select …)` wrapper is
  what makes Postgres evaluate it once per query instead of once per row
  (0064 rewrote every older rule that still asked per row).
- Never write a single `FOR ALL` policy — split into insert / update /
  delete so reads don't pay for write checks.
- Select only the columns a screen needs; filter child rows in the query
  (e.g. only the open tab's comments), not in JavaScript afterwards.

**Server (pages & actions)**
- Independent queries go in ONE `Promise.all` — never `await` them one by
  one. Each sequential await is a full round trip to the database.
- Don't wait for your roles before loading what doesn't depend on them:
  read it in the same batch as `getMembership()` (the database already
  hides what isn't yours) and drop it afterwards for people who can't see
  it — see `app/(dashboard)/team/page.tsx`. When something MUST wait (the
  shorts queue refresh), chain only the dependent reads onto it with
  `.then()` inside the batch, as `shorts/page.tsx` does.
- A promise started early and awaited later gets `.catch(() => {})` right
  away, so an early failure isn't reported twice (`shorts/[id]/page.tsx`).
- Anything two places in the same request need (a project, the user, a
  membership) is wrapped in React `cache()` — see
  `modules/long-videos/lib/queries.ts` and `lib/supabase/get-user.ts`.
- `getCachedUser()` reuses the identity middleware already verified — no
  extra auth round trip. Security-sensitive server ACTIONS still call
  `supabase.auth.getUser()` themselves.
- Privileged data derives its team from the row itself (a project's
  `team_id`), not from the workspace switcher or the browser.

**Client**
- Call server actions through `useAction()` (`lib/hooks/use-action.ts`):
  consistent toasts, and an `optimistic` hook paired with React's
  `useOptimistic` so the UI responds instantly. Reference implementation:
  `videos/[id]/assignee-row.tsx`; notes use the same idea in
  `notes-panel.tsx`.
- Realtime handlers patch the exact rows that changed (see
  `notification-bell.tsx`) or debounce `router.refresh()` — never refresh
  the whole page per event, and skip events caused by your own action.
- Every route has a `loading.tsx` built from `components/ui/skeleton.tsx`
  (a page with `?tab=` tabs: a client loading.tsx that shows that tab).
  Same-page navigations (tabs, steps, documents) use `PendingNav` /
  `PendingLink` / `PendingSwap` (`components/ui/pending-nav.tsx`): the tab
  lights up and its skeleton shows the moment it's clicked. The top bar
  (`NavProgress`, started for every move by `instrumentation-client.ts`)
  also nudges React while a page loads, so no move gets stuck.
  `<LinkPendingIndicator />` is still there for small inline links.
- Images: upload through `compressImage()` with an `IMAGE_PRESETS` entry
  and `UPLOAD_CACHE_CONTROL`; render with `loading="lazy"
  decoding="async"`.

## UI conventions

- **Breakpoints:** `lib/breakpoints.ts` (sm 640, md 900 = the sidebar
  appears, lg 1180, xl 1400, 2xl 1600) is Tailwind's `screens` and what
  code passes to `matchMedia` (`minWidth("lg")`). Never hard-code a width.

- **Icons:** SVG components from `components/ui/icons.tsx` only. Never use
  Unicode symbols (▶ ✓ ★ 📅 …) for UI — iOS renders many as emoji.
- **Stage colors mean state, not identity:** `stageState()` +
  `STAGE_STATE_COLOR` (orange = current, teal = done, neutral = upcoming).
- **Popovers/overlays that must escape the header** render through a
  portal on `document.body` — the sticky header's `backdrop-blur` traps
  `position: fixed` children.
- **People link to profiles** via `profileHref()` / `MemberAvatarLink` /
  `MemberNameLink`; `/u/<username>` or `/u/<user-id>` both work.
- **Roles next to a name:** `<RolePills roles={…} />` (max 2 + "+N").

## Status, errors and alerts (who sees what)

- **`/status`** (public, anyone): is the app as a whole working. Levels
  only, never details: one bar per hour for the last 3 days per part
  (`PARTS` / `VENDORS` in `lib/status.ts`), uptime, the last 7 days of
  incidents. History: `status_samples` (0067), written every 10 minutes by
  `status_tick()` (pg_cron) → `/api/cron/posting` with `{"status": true}`
  → `recordStatus()`. Never pass `detail` to the page's client parts.
- **`/developer`** (developer accounts only, else 404): errors with Mark
  fixed, every check in full, the bars with the reason per hour, incidents,
  teams that need a hand, who gets alerts, Send a test alert.
- **Developers** = `DEVELOPER_EMAILS` (old name `ALERT_EMAILS`), else the
  owner of the first team (`developers()` / `isDeveloper()` in
  `lib/errors.ts`). They are the ONLY ones who get app-wide alerts.
- **One team's problems** (a failed post, an account to reconnect) are never
  app-wide: they go on that team's Posting page (the Problems box), which
  also says when the app itself has a problem (`currentProblems()`).
- A dropped connection isn't an error (`lib/network-noise.ts`): filtered in
  the browser and again in `/api/errors`.
- **Reports** (Settings → Account): bugs and suggestions with up to 3
  photos / videos, saved by `submit_feedback()` (0068), files in the private
  `feedback` bucket under the sender's own folder. Only developers are told
  (notification + email) and see them, on `/developer#reports`.

## Moments worth a celebration

`<DoneBurst title subtitle />` (`components/ui/done-burst.tsx`) is the big
"All done" tick: use it when something is finished (a script's Staging done,
a report sent), not for every save. Pair it with `sounds.celebrate()`.

## Destructive or hard-to-undo clicks ask first

Use `useConfirm()` (or `useConfirmSafe()` in shared parts that can render
outside the app shell) with `danger: true`. Clearing any date uses
`CLEAR_DATE_CONFIRM`. Marking anything done or posted asks too
(`markDoneConfirm(text)`), and so does every Post now.

## Home page and sign-in (1.10.0)

- **`/`** (`app/page.tsx` → `components/landing/`): the public home page;
  signed in → `/dashboard`. Film-set theme: the slate claps shut in the
  hero, then six "scenes" (plan, script, make, review, post, measure), each
  a small looping demo built from HTML/CSS (`vignettes.tsx`), never
  screenshots. Rules in `landing.css`: demos only run while on screen
  (`<Play>` sets `data-on`), and the base styles ARE the finished frame, so
  with animations off (setting or device) everything still reads.
- **`/login`**: the slate with Clip and a rotating tip (desktop), the form
  (show/hide password, forgot password). `?next=` brings you back to where
  you were going (only same-site paths, never `/login` or `/api/`).
- **Link previews**: `app/opengraph-image.tsx` (1200×630, every page that
  doesn't have its own); `metadataBase` in `app/layout.tsx` makes it
  absolute. **Tab icon**: `icons` in `app/layout.tsx` (favicon.ico + Clip's
  icon.svg + the apple-touch icon); a config `icons` replaces the automatic
  `app/icon.svg` link, so keep every entry listed.

## Clip's tour (new people)

- `components/tutorial/tutorial.tsx`: `<TutorialHost pending>` in the
  dashboard layout starts the tour once per person, on `/dashboard`, when
  `profiles.tutorial_done_at` is null (0069). Finishing or skipping (skip
  asks first) calls `setTutorialDone()`; localStorage `vp-tour-done` backs
  it up per device. Watch again: Settings → Account → "Show me around
  again" (`ReplayTutorialButton`), or `/dashboard?tour=1`.
- Steps point at `data-tour="…"` anchors: `nav-<path>` (sidebar and phone
  bar), `nav-more`, `search`, `bell`, `settings`. Moving one of those?
  Keep the attribute. A new main area? Add a step in `steps()` for both the
  computer (sidebar, from `md`) and the phone (bottom bar + More).
- While the tour is pending the "What's new" card waits (`WhatsNewHost hold`).
- Preview: `MOCK_TOUR=1` on the dev mock.

## Search

`global_search()` (migration 0024) is the single search backend. It is
SECURITY INVOKER on purpose: RLS decides what anyone can find, so never
convert it to SECURITY DEFINER. To make something new searchable, add a
trigram index on `lower(column)` and a new section to the function, then a
section in `components/search/global-search.tsx`.

## Short videos

Stages: Script → Editing → In review → Ready to post → Posted. "Posted" is
never set by hand — it follows `short_video_posts` (all planned platforms
marked = Posted). Who may change which field is decided by the
`short_guard_update` trigger (migration 0026); `modules/short-videos/lib/permissions.ts`
mirrors it for the UI. History (`short_video_events`) is written only by
triggers. Entry numbers come from `next_team_number()` — never set them
from the app.

### Shorts scheduling queue (0027)
Auto-dated shorts are never dated by the app: the database re-dates them
(`recalc_short_queue`) whenever something that affects the schedule
changes. The app only ever sets `planned_date` (= pin) or
`schedule_mode = 'auto'` (= back to the queue), and reorders through the
`move_short()` RPC.
