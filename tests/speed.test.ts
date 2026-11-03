// 1.32.1: the server and the database. App setup card 11 measures where the server runs, how far the database is and
// how sign-ins are checked; the app's frame and the dashboard read your profile once instead of four and three times,
// and the dashboard reads your wallpapers alongside everything else instead of after it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { distanceOf, median, signInKeys, SUPABASE_REGIONS, VERCEL_REGIONS } from "../lib/regions";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// --- Regions -------------------------------------------------------------------------------------------------------------
for (const r of SUPABASE_REGIONS) ok(r.vercel in VERCEL_REGIONS, `${r.id} → ${r.vercel}: a Vercel region`);
ok(new Set(SUPABASE_REGIONS.map((r) => r.id)).size === SUPABASE_REGIONS.length, "each Supabase region once");
ok(SUPABASE_REGIONS.find((r) => r.id === "eu-central-1")?.vercel === "fra1" && SUPABASE_REGIONS.find((r) => r.id === "us-east-1")?.vercel === "iad1", "Frankfurt → fra1, North Virginia → iad1");
ok(median([300, 5, 6]) === 6 && median([9, 3]) === 6 && median([]) === null && median([Number.NaN, 4]) === 4, "the middle answer (the first, slow one doesn't count)");
ok(distanceOf(4) === "same-city" && distanceOf(20) === "same-city" && distanceOf(30) === "near" && distanceOf(90) === "far" && distanceOf(null) === null, "how far: ≤ 20 ms the same city, ≤ 45 near, more far");
ok(signInKeys({ keys: [{ kty: "EC", crv: "P-256", alg: "ES256" }] }) === "own" && signInKeys({ keys: [{ kty: "RSA" }] }) === "own", "an asymmetric key: the app checks sign-ins itself");
ok(signInKeys({ keys: [] }) === "shared" && signInKeys({ keys: [{ kty: "oct" }] }) === "shared", "no public key: every page asks Supabase");
ok(signInKeys(null) === null && signInKeys({}) === null && signInKeys("x") === null, "anything else: unknown");

// --- App setup, card 11 -----------------------------------------------------------------------------------------------------
const setup = read("app/(dashboard)/setup/page.tsx");
ok(/n=\{11\}\s+title="Speed: the server next to the database"/.test(setup) && /measureServerSpeed\(\)/.test(setup), "card 11 measures the server and the database");
ok(/sb\("settings\/jwt"\)/.test(setup) && /Migrate JWT secret/.test(setup) && /Function Region/.test(setup), "…and says where to change each");
const speed = read("lib/server-speed.ts");
ok(/^import "server-only";/m.test(speed) && /for \(let i = 0; i < 3; i\+\+\)/.test(speed) && /\/auth\/v1\/\.well-known\/jwks\.json/.test(speed) && /AbortSignal\.timeout\(3000\)/.test(speed), "three timed questions and the public keys, 3 seconds at most each");

// --- The frame and the dashboard: one read of your profile ------------------------------------------------------------------
const layout = read("app/(dashboard)/layout.tsx");
const shell = layout.slice(layout.indexOf("async function DashboardShell"), layout.indexOf("async function legacyShell"));
ok(shell.length > 1000 && !/\.from\("profiles"\)/.test(shell), "the frame reads your profile once (getShellProfile), not four times");
ok(/getShellProfile\(supabase, user!\.id\)/.test(shell) && /supabase\.from\("profile_wallpapers"\)\.select\("path, luma"\)\.eq\("user_id", user!\.id\)/.test(shell), "…alongside your wallpapers, teams, the bell and the developer check");
ok(/const legacy = shell === null \? await legacyShell\(supabase, user!\.id\) : null;/.test(shell), "an older database: each part on its own, as before");
const lookServer = read("lib/look-server.ts");
const cols = /const SHELL_COLUMNS =\s*([\s\S]*?);/.exec(lookServer)?.[1] ?? "";
for (const c of ["username", "full_name", "email", "avatar_url", "animations_enabled", "sounds_enabled", "palette", "tutorial_done_at", "glass_ui", "glass_style", "glass_scope", "glass_sidebar", "glass_level", "glass_wash", "glass_wash_colors", "dashboard_bg_on", "dashboard_bg_path", "dashboard_bg_dim", "dashboard_bg_everywhere"])
  ok(cols.includes(c), `the frame's one read has ${c}`);
const dash = read("app/(dashboard)/dashboard/page.tsx");
const page = dash.slice(dash.indexOf("export default async function DashboardPage"), dash.indexOf("async function dashboardProfile"));
ok(!/\.from\("profiles"\)/.test(page) && /dashboardProfile\(supabase, user\?\.id \?\? ""\)/.test(page), "the dashboard reads your profile once");
ok(/supabase\.from\("profile_wallpapers"\)\.select\("id, path, luma"\)\.eq\("user_id", user\?\.id \?\? ""\),\s*\]\);/.test(page) && !/\.eq\("path", bgPath\)/.test(page), "…and your wallpapers with everything else, not after it");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("speed: all good");
