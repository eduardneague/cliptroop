// 1.52.0: lighter on the server. The owner (Nov 16 2026), before moving to Vercel Pro ($20 of usage a month
// included): "for those things that use a loit of resources, lets make chgagnges so we can save a lot of rescoures and
// make sure the 20$ a month is more than enough". The timers call the app less often (migration 0129), Outliers asks
// for less, and Vercel builds main and staging only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldBuild } from "../scripts/vercel-ignore.mjs";
import { readBudgets } from "../modules/outliers/lib/budget";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

// ---- The timers (0129) ------------------------------------------------------------------------------------------------
const m = read("supabase/migrations/0129_lighter_timers.sql");
ok(/select cron\.schedule\('vplanner-status', '\*\/30 \* \* \* \*', \$\$ select status_tick\(\); \$\$\);/.test(m), "the status check: every 30 minutes (was 10)");
ok(/select cron\.schedule\('vplanner-outliers', '17 \*\/3 \* \* \*', \$\$ select outliers_fanout\(\); \$\$\);/.test(m), "Outliers: every 3 hours (was twice an hour)");
ok(/select cron\.schedule\('vplanner-live', '5-59\/10 \* \* \* \*', \$\$ select analytics_live_fanout\(\); \$\$\);/.test(m), "the live timer still wakes every 10 minutes…");
ok(/v_hourly boolean := extract\(minute from p_at\) < 10;/.test(m) && /c\.published_at > p_at - interval '48 hours'/.test(m) && /p\.status = 'published'/.test(m), "…but calls the app once an hour, or every time for a team with a video from the last 48 hours");
ok(m.indexOf("drop function if exists analytics_live_fanout();") < m.indexOf("create or replace function analytics_live_fanout(p_at timestamptz default now())"), "the old one goes first (two would make the timer's call ambiguous)");
ok(/revoke all on function analytics_live_fanout\(timestamptz\) from public, anon, authenticated;/.test(m), "still the timer's alone");
ok(/delete from analytics_live where at < now\(\) - interval '8 days';/.test(m), "and it still drops old counts");
ok(/revoke all on function public\.timer_plan\(\) from public, anon;/.test(m), "App setup's probe (timer_plan) isn't public");

// ---- 1.52.1 (0130): "lets have outliers update once per day and video numbers every 12 hours" -----------------------
const d = read("supabase/migrations/0130_daily_timers.sql");
ok(/select cron\.schedule\('vplanner-live', '5 6,18 \* \* \*', \$\$ select analytics_live_fanout\(\); \$\$\);/.test(d), "video numbers: every 12 hours (06:05 and 18:05 UTC)");
ok(/select cron\.schedule\('vplanner-outliers', '17 5 \* \* \*', \$\$ select outliers_fanout\(\); \$\$\);/.test(d), "Outliers: once a day, late in YouTube's quota day (05:17 UTC)");
ok(!/v_hourly|48 hours'\s+or exists/.test(d.slice(d.indexOf("create or replace function analytics_live_fanout"), d.indexOf("revoke all on function analytics_live_fanout"))), "every run calls every team and platform (no 10-minute exception)");
ok(/revoke all on function analytics_live_fanout\(timestamptz\) from public, anon, authenticated;/.test(d), "still the timer's alone");
const math = read("modules/analytics/lib/live-math.ts");
ok(/export const LIVE_EVERY_HOURS = 12;/.test(math) && /export const LIVE_EVERY_WORDS = "every 12 hours";/.test(math) && /export const LIVE_MINUTE_VIEW = LIVE_EVERY_HOURS \* 60 <= 10;/.test(math), "the screens' words come from one place");
const screens = ["modules/analytics/components/tabs/realtime-tab.tsx", "modules/analytics/components/realtime-card.tsx", "modules/analytics/components/tabs/overview-tab.tsx", "modules/analytics/components/tabs/content-tab.tsx", "lib/site/features.ts", "components/site/steps.tsx", "app/(dashboard)/developer/status-tab.tsx"].map(read).join("\n");
const shown = screens.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "").replace('"Views per 10 minutes, ending now (counts are read every 10 minutes)"', "");
ok(!/every 10 minutes|every few minutes|within minutes|within 10 minutes|right now\."/.test(shown), "no screen or page still promises minutes (the 60-minute view's own words show only with 10-minute reads)");
ok(/\{LIVE_MINUTE_VIEW && \(\s+<Segmented<Span>/.test(read("modules/analytics/components/tabs/realtime-tab.tsx")) && /const hourly = !LIVE_MINUTE_VIEW \|\| span === "48h";/.test(read("modules/analytics/components/tabs/realtime-tab.tsx")), "Realtime: no 60-minute view with reads 12 hours apart");
ok(/Its new videos are read once a day/.test(read("modules/outliers/components/tabs/channels-tab.tsx")), "Outliers says once a day");

// ---- Outliers asks for less -------------------------------------------------------------------------------------------
const b = readBudgets({});
ok(b.units === 1500 && b.stats === 2000 && b.crawlSearches === 24 && !b.explore, "Outliers: about a third of the YouTube reading by default, Explore off");
ok(readBudgets({ OUTLIERS_EXPLORE: "1", OUTLIERS_DAILY_UNITS: "4000" }).explore && readBudgets({ OUTLIERS_DAILY_UNITS: "4000" }).units === 4000, "each can be raised again in Vercel");

// ---- Builds -------------------------------------------------------------------------------------------------------------
ok(shouldBuild({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) && shouldBuild({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" }), "Vercel builds production and staging");
ok(!shouldBuild({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "dependabot/npm_and_yarn/staging/minor-and-patch-a30ff999bb" }) && !shouldBuild({ VERCEL_ENV: "preview" }), "and nothing else (Dependabot's branches: GitHub's CI checks them)");
ok(JSON.parse(read("vercel.json")).ignoreCommand === "node scripts/vercel-ignore.mjs", "vercel.json: the Ignored Build Step");

// ---- What the app says about them ---------------------------------------------------------------------------------------
ok(read("app/(dashboard)/developer/status-tab.tsx").includes('name: "Status check (every 30 minutes)"'), "the developer's status tab says 30 minutes");
ok(/Not needed since 1\.52\.0/.test(read("app/(dashboard)/setup/page.tsx")), "App setup: LIVE_MINUTES isn't needed");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("lighter server: ok");
