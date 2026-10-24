// 1.31.13: the app's own addresses (/api/*). Another site can't make a signed-in browser change anything here (the
// middleware turns away cross-site writes; no route lets another site read its answers); everything that costs
// something per call has a limit per person; the only machine that may call in is the timer, with its secret; the
// platform sign-ins' "state" is random, one-time and short-lived.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { crossSiteWrite } from "../lib/request-guard";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// --- Cross-site writes --------------------------------------------------------------------------------------------------
const host = "app.cliptroop.com";
const write = (o: Partial<{ method: string; path: string; origin: string | null; fetchSite: string | null; host: string | null }>) =>
  crossSiteWrite({ method: "POST", path: "/api/errors", host, origin: null, fetchSite: null, ...o });
ok(!write({ origin: "https://app.cliptroop.com" }), "the app's own page: in");
ok(!write({ origin: "https://APP.cliptroop.com" }), "case doesn't matter");
ok(write({ origin: "https://evil.example" }), "another site: out");
ok(write({ origin: "https://app.cliptroop.com.evil.example" }), "a look-alike: out");
ok(write({ origin: "http://app.cliptroop.com:8080" }), "another port is another site: out");
ok(write({ origin: "null" }), "a sandboxed frame (Origin: null): out");
ok(write({ origin: "not a url" }), "a broken Origin: out");
ok(write({ fetchSite: "cross-site" }) && !write({ fetchSite: "same-origin" }) && !write({ fetchSite: "none" }), "no Origin: the browser's Sec-Fetch-Site decides");
ok(!write({}), "neither (a script with no browser cookies): the route's own checks");
for (const method of ["DELETE", "PUT", "PATCH"]) ok(write({ method, origin: "https://evil.example" }), `${method} from another site: out`);
for (const method of ["GET", "HEAD", "OPTIONS"]) ok(!write({ method, origin: "https://evil.example" }), `${method} changes nothing: not asked`);
ok(!write({ path: "/api/cron/posting", origin: "https://evil.example" }), "the timer has its own secret");
ok(!write({ path: "/api/auth/callback", origin: "https://evil.example" }), "sign-in's return address isn't asked");
ok(!write({ path: "/dashboard", origin: "https://evil.example" }), "pages: Next.js checks server actions itself");
const mw = read("lib/supabase/middleware.ts");
ok(/crossSiteWrite\(\{\s*method: request\.method,\s*path: request\.nextUrl\.pathname,/.test(mw) && /status: 403/.test(mw), "the middleware turns them away with 403");
ok(mw.indexOf("crossSiteWrite(") < mw.indexOf("createServerClient("), "before any session work");

// No route lets another site read its answers.
const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(p)) files.push(relative(root, p));
  }
};
for (const d of ["app", "lib", "modules", "components"]) walk(join(root, d));
for (const f of [...files, "middleware.ts", "next.config.ts"]) ok(!/Access-Control-Allow-(Origin|Credentials)/i.test(read(f)), `${f}: no CORS headers`);

// The routes that take writes: the timer, and four of the app's own (each also checks the origin or the person).
const writers = files.filter((f) => /(^|\/)route\.ts$/.test(f) && /export (async function|const) (POST|PUT|PATCH|DELETE)\b/.test(read(f))).sort();
ok(JSON.stringify(writers) === JSON.stringify(["app/api/cron/posting/route.ts", "app/api/errors/route.ts", "app/api/grammar/route.ts", "app/api/push/subscribe/route.ts", "app/api/push/test/route.ts"]), `routes that take writes (${writers.join(", ")})`);
ok(!files.some((f) => /webhook/i.test(f)), "no inbound webhooks: the timer is the only machine that calls in");

// --- Limits per person ----------------------------------------------------------------------------------------------------
const limited: [string, RegExp][] = [
  ["app/api/link-preview/route.ts", /overLimit\("link-preview", user\.id, 60, 60_000\)/],
  ["app/api/analytics/thumb/route.ts", /overLimit\("thumb", user\.id, 600, 60_000\)/],
  ["app/api/weather/route.ts", /overLimit\("weather", clientAddress\(/],
  ["app/api/grammar/route.ts", /overLimit\("grammar", user, 90, 60_000\)/],
  ["app/api/errors/route.ts", /overLimit\("errors", user\.id, 10, 60_000\)/],
  ["app/api/giphy/search/route.ts", /overLimit\("giphy", user\.id, 40, 60_000\)/],
  ["app/(dashboard)/team/actions.ts", /overLimit\("invite", user\.id, 30, 60 \* 60_000\)/],
  ["app/(dashboard)/outliers/actions.ts", /overLimit\("outliers-add", user\.id, 60, 60 \* 60_000\)/],
  ["app/(dashboard)/settings/feedback-actions.ts", /overLimit\("feedback", user\.id, 5, 10 \* 60_000\)/],
];
for (const [f, re] of limited) ok(re.test(read(f)), `${f}: a limit per person`);
for (const f of ["app/api/grammar/route.ts", "app/api/errors/route.ts"]) ok(!/new Map<string, number\[\]>/.test(read(f)), `${f}: the shared limiter (its own list never forgot anyone)`);
ok(/now - \(last\.get\(user\.id\) \?\? 0\) < 15_000/.test(read("app/api/push/test/route.ts")), "a test notification: one every 15 seconds");

// --- The platforms' sign-ins (OAuth) ---------------------------------------------------------------------------------------------
const connect = read("app/api/social/[platform]/connect/route.ts");
ok(/const access = await requireSocialManager\(teamId\);/.test(connect) && /randomBytes\(32\)/.test(connect), "connecting: masters and schedulers, a random state");
const callback = read("app/api/social/[platform]/callback/route.ts");
ok(/\.from\("oauth_states"\)\s*\.delete\(\)\s*\.eq\("state", state\)/.test(callback), "the state is used up when it's checked (one time)");
ok(/Date\.now\(\) - Date\.parse\(saved\.created_at as string\) > 15 \* 60_000/.test(callback), "and only for 15 minutes");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("api: all good");
