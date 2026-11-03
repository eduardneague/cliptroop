// 1.31.0: keys and secrets stay on the server. Nothing secret is built into the browser (NEXT_PUBLIC_), every
// module that reads one is server-only, no key is written in the code, every .env file stays out of git, every
// setting the code reads is described in .env.example, stored sign-ins are sealed properly, and the app's own
// keys can only be used by signed-in people.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { overLimit, resetLimits } from "../lib/rate-limit";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === "node_modules" || name === ".next" || name === ".git" || name === "vendor") continue;
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const code = ["app", "lib", "modules", "components"].flatMap((d) => walk(d)).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f));
code.push("middleware.ts", "next.config.ts", "instrumentation.ts", "instrumentation-client.ts");

// --- What the code reads -------------------------------------------------------------------------------------------
const names = new Map<string, string[]>();
for (const f of code) {
  const s = read(f);
  for (const m of s.matchAll(/process\.env\.([A-Z0-9_]+)/g)) names.set(m[1], [...(names.get(m[1]) ?? []), f]);
  for (const m of s.matchAll(/\benv\("([A-Z0-9_]+)"\)/g)) names.set(m[1], [...(names.get(m[1]) ?? []), f]);
}
ok(names.size > 20, `found the settings the code reads (${names.size})`);

// Built into the browser: never a secret.
// Public by design: the database's anonymous key, the push key, and Turnstile's site key (1.45.0: the browser shows the check with it).
const PUBLIC_OK = new Set(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]);
for (const n of names.keys()) if (n.startsWith("NEXT_PUBLIC_") && !PUBLIC_OK.has(n)) ok(!/SECRET|PRIVATE|SERVICE|TOKEN|PASSWORD|_KEY$/.test(n), `${n}: a NEXT_PUBLIC_ name reaches every browser, so it must not be a secret`);

// Every module that reads a secret is server-only: a route, a server action file, or `import "server-only"`.
const SECRETS = /^(SUPABASE_SERVICE_ROLE_KEY|SOCIAL_TOKEN_KEY|CRON_SECRET|VAPID_PRIVATE_KEY|RESEND_API_KEY|YOUTUBE_API_KEY|GIPHY_API_KEY|LANGUAGETOOL_API_KEY|LANGUAGETOOL_USERNAME|.*_CLIENT_SECRET|.*_APP_SECRET|.*_CLIENT_KEY)$/;
for (const [n, files] of names) {
  if (!SECRETS.test(n)) continue;
  for (const f of new Set(files)) {
    const s = read(f);
    // lib/auth/two-step.ts (1.46.0) runs in the middleware, where "server-only" can't be imported; no browser code imports it (checked below).
    const serverOnly = /^import "server-only";/m.test(s) || /^\s*"use server";/.test(s) || /(^|\/)route\.ts$/.test(f) || f === "app/(dashboard)/setup/page.tsx" || f === "lib/auth/two-step.ts";
    ok(serverOnly, `${f} reads ${n}: it must be server-only`);
    ok(!/^\s*"use client";/.test(s), `${f} reads ${n} and is a browser file`);
  }
}
// /setup only says whether each one is set (never its value), and only to developers.
const setup = read("app/(dashboard)/setup/page.tsx");
ok(/if \(!\(await isDeveloper\(user\)\)\) notFound\(\);/.test(setup) && /const env = \(k: string\) => !!process\.env\[k\]\?\.trim\(\);/.test(setup), "/setup: developers only, and it shows whether a key is set, not the key");

// Every setting the code reads is described in .env.example (Vercel's and Next's own aside).
const example = read(".env.example");
const SYSTEM = /^(VERCEL_.*|NODE_ENV|NEXT_RUNTIME|NEXT_PUBLIC_APP_(VERSION|CHANNEL|COMMIT)|ALERT_EMAILS|ALERTS_EMAIL|E2E_.*|WORD_TEST_CHILD|FB_TEST_CHILD)$/;
const described = (n: string) => new RegExp(`(^|[\\s#(,])${n}\\b`, "m").test(example);
for (const n of names.keys()) if (!SYSTEM.test(n)) ok(described(n), `${n} is read by the code but not described in .env.example`);
// The example holds no real value for a secret.
for (const line of example.split("\n")) {
  const m = /^#?\s?([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && SECRETS.test(m[1])) ok(m[2].trim() === "" || /example\.com/.test(m[2]), `.env.example: ${m[1]} has a value`);
}

// --- Nothing secret in git -----------------------------------------------------------------------------------------
const ignore = read(".gitignore").split("\n").map((l) => l.trim());
ok(ignore.includes(".env*") && ignore.includes("!.env.example"), "every .env file is ignored except the example");
for (const p of ["*.pem", "*.key", "*.p8", "*.p12", "*.pfx", "service-account*.json"]) ok(ignore.includes(p), `${p} is ignored`);

const KEY_SHAPES: [string, RegExp][] = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["private key", /-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ["JWT (a Supabase key)", /eyJhbGciOi[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\./],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{16,}/],
  ["GitHub token", /\b(ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ["AWS key", /AKIA[0-9A-Z]{16}/],
  ["Stripe key", /\b(sk|rk)_live_[0-9a-zA-Z]{16,}/],
  ["Resend key", /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}/],
  ["Meta token", /\bEAA[A-Za-z0-9]{40,}/],
  ["Google OAuth token", /\bya29\.[A-Za-z0-9_-]{30,}/],
  ["OpenAI or Anthropic key", /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{32,}/],
];
const scanned = ["app", "lib", "modules", "components", "scripts", "supabase", "docs", "public", "tests", "types"].flatMap((d) => walk(d)).filter((f) => !/\.(png|jpg|jpeg|webp|gif|ico|woff2?|ttf|otf|mp3|mp4|webm|zip|pdf)$/.test(f));
scanned.push(".env.example", "README.md", "VPLANNER_HANDOFF.md", "next.config.ts", "vercel.json", "package.json");
let hits = 0;
for (const f of scanned) {
  if (f === relative(ROOT, __filename)) continue;
  const s = read(f);
  for (const [what, re] of KEY_SHAPES) if (re.test(s)) ok(++hits < 0, `${f}: looks like a ${what} written in the code`);
}
ok(scanned.length > 300, `scanned the code for keys (${scanned.length} files)`);

// --- Stored sign-ins: sealed with the full check ---------------------------------------------------------------------
const crypto = read("lib/social/crypto.ts");
ok(/^import "server-only";/m.test(crypto), "token sealing is server-only");
ok(/createCipheriv\("aes-256-gcm", key\(\), iv, \{ authTagLength: TAG_BYTES \}\)/.test(crypto) && /createDecipheriv\("aes-256-gcm", key\(\), ivBytes, \{ authTagLength: TAG_BYTES \}\)/.test(crypto), "AES-256-GCM with the full 16 byte check both ways");
ok(/ivBytes\.length !== IV_BYTES \|\| tagBytes\.length !== TAG_BYTES/.test(crypto), "a sealed value with a short check or nonce is refused");
ok(/randomBytes\(IV_BYTES\)/.test(crypto), "a fresh nonce every time");
const accounts = read("supabase/migrations/0039_social_accounts.sql");
const grant = accounts.slice(accounts.indexOf("grant select ("), accounts.indexOf(") on social_accounts to authenticated"));
ok(!grant.includes("token_enc"), "the browser can't read the sealed sign-ins (column grants)");

// --- The app's own keys: signed-in people only ------------------------------------------------------------------------
const giphy = read("app/api/giphy/search/route.ts");
ok(/const user = await getCachedUser\(\);\s*if \(!user\) return json\(\{ error: "Sign in first\." \}, 401\);/.test(giphy), "GIF search: signed in only");
ok(/overLimit\("giphy", user\.id,/.test(giphy) && /AbortSignal\.timeout\(/.test(giphy) && /\.slice\(0, 50\)/.test(giphy), "GIF search: a limit per person, a time limit, a short search");
ok(!/console\.(log|error|warn)\([^)]*endpoint/.test(giphy), "GIF search: the address with the key is never logged");
const grammar = read("app/api/grammar/route.ts");
ok(/if \(!user\) return json\(\{ error: "Sign in first\." \}, 401\);/.test(grammar), "writing suggestions: signed in only");
// 1.31.12: one shared check (lib/cron-auth.ts) instead of a copy in each route.
const cronAuth = read("lib/cron-auth.ts");
ok(/secret\.length < 16/.test(cronAuth) && /timingSafeEqual/.test(cronAuth), "CRON_SECRET required (16+ characters), compared in constant time");
for (const f of ["app/api/cron/posting/route.ts", "app/api/cron/analytics/route.ts", "app/api/cron/cleanup-media/route.ts"]) {
  const s = read(f);
  ok(/if \(!cronAuthorized\(request\.headers\.get\("authorization"\), process\.env\.CRON_SECRET\)\)/.test(s), `${f}: checks CRON_SECRET first`);
}

// --- GitHub's checks ------------------------------------------------------------------------------------------------
for (const f of [".github/workflows/ci.yml", ".github/workflows/database.yml"]) {
  const s = read(f);
  ok(/^permissions:\n  contents: read$/m.test(s), `${f}: its token can only read the code`);
  const checkouts = s.split("uses: actions/checkout@").length - 1;
  ok(checkouts > 0 && (s.match(/persist-credentials: false/g) ?? []).length === checkouts, `${f}: the checkout doesn't leave the token behind`);
  // Every script (a run: line, or the lines indented under run: |) has no ${{ … }} in it.
  const scripts: string[] = [];
  const lines = s.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(- )?run: ?(.*)$/.exec(lines[i]);
    if (!m) continue;
    scripts.push(m[3]);
    const indent = m[1].length + (m[2] ? 2 : 0);
    while (i + 1 < lines.length && (lines[i + 1].trim() === "" || lines[i + 1].search(/\S/) > indent)) scripts.push(lines[++i]);
  }
  ok(scripts.length > 3 && !scripts.some((l) => l.includes("${{")), `${f}: nothing typed or sent in becomes part of a script`);
  ok(!/pull_request_target/.test(s), `${f}: never runs someone else's pull request with the secrets`);
}

// --- The limit itself ------------------------------------------------------------------------------------------------
resetLimits();
const t0 = 1_000_000;
let over = false;
for (let i = 0; i < 40; i++) over ||= overLimit("t", "a", 40, 60_000, t0 + i);
ok(!over, "40 in a minute: fine");
ok(overLimit("t", "a", 40, 60_000, t0 + 41), "the 41st: over");
ok(!overLimit("t", "b", 40, 60_000, t0 + 42), "someone else: their own count");
ok(!overLimit("t", "a", 40, 60_000, t0 + 61_000 + 41), "a minute later: fine again");
ok(!overLimit("u", "a", 40, 60_000, t0 + 43), "another limit: its own count");

{
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const walk = (d: string): string[] => readdirSync(d).flatMap((x) => (statSync(`${d}/${x}`).isDirectory() ? (x === "node_modules" || x.startsWith(".") ? [] : walk(`${d}/${x}`)) : /\.tsx?$/.test(x) ? [`${d}/${x}`] : []));
  const root = require("node:path").join(__dirname, "..") as string;
  const clientFiles = ["app", "components", "modules", "lib"].flatMap((d) => walk(`${root}/${d}`)).filter((f) => /^\s*["']use client["']/.test(require("node:fs").readFileSync(f, "utf8")));
  for (const f of clientFiles) ok(!/from "@\/lib\/auth\/two-step"/.test(require("node:fs").readFileSync(f, "utf8")), `${f}: browser code mustn't import lib/auth/two-step (it reads the cookie's key)`);
}
if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("secrets: all passed");
