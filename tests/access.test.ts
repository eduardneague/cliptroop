// 1.31.12: who can do what. Every server action and every API route checks who's asking before it does anything;
// the ones that leave it to the database (Row Level Security, or a database function that checks the role) are
// listed here with the reason, and never use the service key themselves. A new action or route without a check
// fails this test until it gets one (or a reason here). Scheduled jobs check CRON_SECRET; the developer pages
// answer 404 to everyone else.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { cronAuthorized } from "../lib/cron-auth";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(relative(root, p));
  }
};
for (const d of ["app", "lib", "modules", "components"]) walk(join(root, d));

/** What counts as checking who's asking (the session, a membership or role, a developer, the cron secret). */
const CHECK =
  /auth\.getUser\(|getMembership\(|requireMaster\(|requireSocialManager\(|requireDeveloper\(|requireProjectMaster\(|isDeveloper\(|isAlertPerson\(|teamForRequest\(|getCachedUser\(|getTeamsAndCurrent\(|cronAuthorized\(/;
const ADMIN = /createAdminClient\(/;

/** Top-level functions of a file, and which of them check (directly or through another one in the file). */
function functionsOf(src: string) {
  const re = /^(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|^(export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:cache\()?(?:async\s*)?(?:function\b|\()/gm;
  const decl = [...src.matchAll(re)].map((m) => ({ name: (m[2] ?? m[4]) as string, exported: !!(m[1] ?? m[3]), at: m.index ?? 0 })).sort((a, b) => a.at - b.at);
  const body = new Map<string, string>();
  decl.forEach((d, i) => body.set(d.name, src.slice(d.at, i + 1 < decl.length ? decl[i + 1].at : src.length)));
  const checks = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, b] of body) {
      if (checks.has(name)) continue;
      const inner = b.slice(b.indexOf("{"));
      if (CHECK.test(b) || [...checks].some((h) => new RegExp(`\\b${h}\\(`).test(inner))) {
        checks.add(name);
        changed = true;
      }
    }
  }
  const usesAdmin = (name: string, seen = new Set<string>()): boolean => {
    if (seen.has(name)) return false;
    seen.add(name);
    const b = body.get(name) ?? "";
    return ADMIN.test(b) || [...body.keys()].some((h) => h !== name && new RegExp(`\\b${h}\\(`).test(b.slice(b.indexOf("{"))) && usesAdmin(h, seen));
  };
  return { decl, checks, usesAdmin };
}

// --- Server actions --------------------------------------------------------------------------------------------------------
/**
 * Actions that leave the check to the database, or need none. `admin`: it uses the service key, only for what the
 * database already allowed (said where).
 */
const LEFT_TO_THE_DATABASE: Record<string, string> = {
  "app/login/actions.ts#login": "signing in itself (with its own limits, 1.31.6)",
  "app/(dashboard)/videos/view-mode-actions.ts#setViewMode": "a preference cookie only (grid or table)",
  "app/(dashboard)/shorts/view-mode-actions.ts#setShortsViewMode": "a preference cookie only (grid or table)",
  "app/(dashboard)/notification-actions.ts#markNotificationRead": "the person's own client: RLS lets only the recipient touch a notification",
  "app/(dashboard)/notification-actions.ts#clearNotification": "the person's own client: RLS lets only the recipient touch a notification",
  "app/(dashboard)/objectives/actions.ts#deleteObjective": "the person's own client: RLS lets only masters change objectives",
  "app/(dashboard)/objectives/actions.ts#setObjectivePaused": "the person's own client: RLS lets only masters change objectives",
  "app/(dashboard)/objectives/projection-actions.ts#archiveProjection": "the person's own client: RLS lets only masters change projections",
  "app/(dashboard)/objectives/projection-actions.ts#deleteProjection": "the person's own client: RLS lets only masters change projections",
  "app/(dashboard)/posting/actions.ts#testTimer": "posting_ping() checks the role (masters and schedulers)",
  "app/(dashboard)/scripts/actions.ts#createDoc": "the person's own client: RLS (the video's team)",
  "app/(dashboard)/scripts/actions.ts#renameDoc": "the person's own client: RLS (the video's team)",
  "app/(dashboard)/scripts/actions.ts#deleteDoc": "the person's own client: RLS (the video's team)",
  "app/(dashboard)/scripts/actions.ts#getDocContent": "the person's own client: RLS (the video's team)",
  "app/(dashboard)/scripts/actions.ts#resolveComment": "the person's own client: RLS",
  "app/(dashboard)/scripts/actions.ts#resolveComments": "the person's own client: RLS",
  "app/(dashboard)/scripts/actions.ts#deleteComment": "admin: RLS deletes the comment (its author or a master); the service key only removes that row's own drawing",
  "app/(dashboard)/scripts/grammar-actions.ts#addDictionaryWord": "the person's own client: RLS (their own words)",
  "app/(dashboard)/scripts/grammar-actions.ts#removeDictionaryWord": "the person's own client: RLS (their own words)",
  "app/(dashboard)/shorts/[id]/schedule-actions.ts#getPostingState": "the person's own client: RLS (the short's team)",
  "app/(dashboard)/shorts/actions.ts#moveShortAuto": "a database function checks the role",
  "app/(dashboard)/shorts/actions.ts#swapShorts": "a database function checks the role",
  "app/(dashboard)/team/actions.ts#updateTeamColors": "the person's own client: RLS lets only the master update the team",
  "app/(dashboard)/team/actions.ts#updateLongSettings": "the person's own client: RLS lets only the master update the team",
  "app/(dashboard)/videos/[id]/actions.ts#deleteComment": "the person's own client: RLS (the comment's author or a master)",
  "app/(dashboard)/videos/[id]/actions.ts#markFilmed": "long_mark_filmed() checks the role and the step",
  "app/(dashboard)/videos/[id]/actions.ts#markEdited": "long_mark_edited() checks the role and the step",
  "app/(dashboard)/videos/[id]/actions.ts#reviewLong": "long_review() checks the role and the step",
  "app/(dashboard)/videos/[id]/actions.ts#setLongPosted": "long_set_posted() checks the role and the step",
  "app/(dashboard)/videos/[id]/actions.ts#setLongPlatforms": "the person's own client: RLS lets only the master change it",
  "app/(dashboard)/videos/[id]/actions.ts#saveLongDescription": "the person's own client: RLS and column grants",
  "app/(dashboard)/videos/[id]/studio/actions.ts#registerVariant": "the person's own client: RLS (the video's team)",
  "app/(dashboard)/videos/[id]/studio/actions.ts#renameVariant": "the person's own client: RLS (the video's team)",
  "app/(dashboard)/videos/[id]/studio/actions.ts#deleteVariant": "the person's own client: RLS (the video's team)",
  "app/(dashboard)/videos/[id]/studio/actions.ts#toggleWinner": "the person's own client: RLS (the video's team)",
  "app/(dashboard)/videos/[id]/studio/actions.ts#addPackageTitle": "the person's own client: RLS (the video's team)",
  "app/(dashboard)/videos/[id]/studio/actions.ts#deletePackageTitle": "the person's own client: RLS (the video's team)",
  "modules/dashboard/actions.ts#addTodo": "the person's own client: RLS (their own to-dos)",
  "modules/dashboard/actions.ts#updateTodo": "the person's own client: RLS (their own to-dos)",
  "modules/dashboard/actions.ts#deleteTodo": "the person's own client: RLS (their own to-dos)",
  "modules/dashboard/actions.ts#reorderTodos": "the person's own client: RLS (their own to-dos)",
  "modules/word/actions.ts#loadWord": "lib/state.ts context(): the signed-in person (getCachedUser), their own board",
  "modules/word/actions.ts#guessWord": "lib/state.ts context(): the signed-in person (getCachedUser), their own guesses",
};
const ADMIN_ALLOWED = new Set(["app/(dashboard)/scripts/actions.ts#deleteComment"]);

const serverFiles = files.filter((f) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(readFileSync(join(root, f), "utf8")));
ok(serverFiles.length >= 30, `server action files found (${serverFiles.length})`);
const seen = new Set<string>();
let actions = 0;
for (const f of serverFiles) {
  const { decl, checks, usesAdmin } = functionsOf(read(f));
  for (const d of decl.filter((x) => x.exported)) {
    actions++;
    const key = `${f}#${d.name}`;
    seen.add(key);
    const why = LEFT_TO_THE_DATABASE[key];
    if (why) {
      ok(!checks.has(d.name) || key.endsWith("#login"), `${key} checks after all: take it off the list`);
      ok(!usesAdmin(d.name) || ADMIN_ALLOWED.has(key), `${key} leaves the check to the database but uses the service key`);
    } else {
      ok(checks.has(d.name), `${key}: checks nobody (sign-in, team or role). Add a check, or a reason to LEFT_TO_THE_DATABASE`);
    }
  }
}
ok(actions >= 200, `exported actions found (${actions})`);
for (const key of Object.keys(LEFT_TO_THE_DATABASE)) ok(seen.has(key), `${key} is listed but doesn't exist any more: take it off`);

// --- API routes ---------------------------------------------------------------------------------------------------------------
/** Routes without a check of their own, and why that's right. */
const OPEN_ROUTES: Record<string, string> = {
  "app/api/health/route.ts": "the health check (public; levels only, 1.31.1)",
  "app/offline.html/route.ts": "the installed app's offline page",
  "app/api/auth/callback/route.ts": "where a sign-in link returns (it signs in, same-site redirects only)",
  "app/api/weather/route.ts": "public forecasts; the middleware lets only signed-in people ask",
  "app/api/calendar/planned/route.ts": "getPlannedDays(): the person's own client and their current team (RLS)",
  "app/api/meetings/[id]/ics/route.ts": "getMeeting(): the person's own client (RLS: the meeting's team)",
};
const routes = files.filter((f) => /(^|\/)route\.ts$/.test(f));
ok(routes.length >= 20, `routes found (${routes.length})`);
for (const f of routes) {
  const src = read(f);
  if (OPEN_ROUTES[f]) {
    ok(!ADMIN.test(src), `${f} is open but uses the service key`);
    continue;
  }
  ok(CHECK.test(src), `${f}: checks nobody. Add a check, or a reason to OPEN_ROUTES`);
}
for (const f of Object.keys(OPEN_ROUTES)) ok(routes.includes(f), `${f} is listed but doesn't exist any more`);

// --- Scheduled jobs ----------------------------------------------------------------------------------------------------------
const secret = "s".repeat(32);
ok(cronAuthorized(`Bearer ${secret}`, secret), "the timer's secret lets it in");
ok(!cronAuthorized(`Bearer ${secret}x`, secret) && !cronAuthorized(`bearer ${secret}`, secret) && !cronAuthorized(null, secret) && !cronAuthorized("", secret), "anything else doesn't");
ok(!cronAuthorized("Bearer short", "short") && !cronAuthorized("Bearer ", "") && !cronAuthorized(`Bearer ${secret}`, undefined), "no secret, or a short one, lets nothing in");
for (const f of routes.filter((r) => r.startsWith("app/api/cron/"))) {
  const src = read(f);
  const handlers = [...src.matchAll(/export async function (GET|POST)\b[\s\S]*?\{([\s\S]*?)\n\}/g)];
  const shared = /export const (GET|POST) = handle;/.test(src);
  ok(handlers.length > 0 || shared, `${f}: has handlers`);
  for (const h of handlers) {
    const first = h[2].trim().split("\n")[0] ?? "";
    ok(/cronAuthorized\(|return handle\(/.test(first), `${f} ${h[1]}: checks CRON_SECRET before anything else`);
  }
}
const posting = read("app/api/cron/posting/route.ts");
ok(/async function handle\(request: Request\) \{\s*if \(!cronAuthorized\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)\)/.test(posting), "the timer's own route checks first too");

// --- The developer's pages ---------------------------------------------------------------------------------------------------
for (const f of ["app/(dashboard)/developer/page.tsx", "app/(dashboard)/setup/page.tsx"]) {
  ok(/if \(!\(await isDeveloper\(user\)\)\) notFound\(\);/.test(read(f)), `${f}: everyone else gets "not found"`);
}
ok(/^import "server-only";/.test(read("app/(dashboard)/developer/data.ts")), "the developer pages' service-key reads never reach a browser");
for (const fn of ["resolveAppError", "resolveAllAppErrors", "sendTestAlert", "setReportDone", "deleteReport"]) {
  const a = read("app/(dashboard)/developer/actions.ts");
  const body = a.slice(a.indexOf(`export async function ${fn}(`));
  ok(/requireDeveloper\(\)/.test(body.slice(0, body.indexOf("\n}"))), `developer action ${fn}: developers only`);
}

// --- A few that matter most -------------------------------------------------------------------------------------------------
const team = read("app/(dashboard)/actions.ts");
const sw = team.slice(team.indexOf("export async function switchTeam"));
ok(/\.eq\("team_id", teamId\)\.eq\("user_id", user\.id\)\.eq\("status", "active"\)/.test(sw) && sw.indexOf("maybeSingle") < sw.indexOf("cookieStore.set"), "switching team: only to a team you're an active member of");
const view = read("app/(dashboard)/videos/view-mode-actions.ts");
ok(/=== "table" \? "table" : "grid"/.test(view) && /\/\^\[a-z_\]\{1,20\}\$\/\.test\(rawStage\)/.test(view), "the view-mode cookie and its return address take only what they expect");
const schedule = read("app/(dashboard)/shorts/[id]/schedule-actions.ts");
ok(/return \{ user, ok: isMaster\(roles\) \|\| roles\.includes\("publisher"\) \};/.test(schedule), "posting: masters and schedulers");
for (const fn of ["schedulePosts", "cancelPost", "retryPost", "postNow", "checkBeforeScheduling", "changePostTime", "getTikTokCreatorInfo"]) {
  const body = schedule.slice(schedule.indexOf(`export async function ${fn}(`));
  ok(/const m = await manager\(/.test(body.slice(0, 1600)) && /if \(!m\.ok\) return/.test(body.slice(0, 1800)), `posting action ${fn}: checks the role before posting anything`);
}

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log(`who can do what: ${actions} actions, ${routes.length} routes checked`);
