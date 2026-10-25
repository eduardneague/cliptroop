// 1.31.11: sessions. Log out is this device only; Settings → Account → Sign out everywhere else (their notifications
// stop too, as after a new password); the sign-in cookies are Secure on https; an email's link never swaps the
// account someone is signed in with without asking.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextForLinkType, readHandoff, SWAP_MAX_AGE_MS, swapDecision, tokenClaims } from "../lib/auth/link-swap";
import { sessionCookieOptions } from "../lib/supabase/cookie-options";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// --- Which account an email's link may sign in ------------------------------------------------------------------------------
ok(swapDecision(null, "b") === "sign-in", "nobody signed in here: the link signs its account in");
ok(swapDecision({ id: "a" }, "a") === "same", "the same account: carry on");
ok(swapDecision({ id: "a" }, "b") === "ask", "another account: ask first");
ok(swapDecision({ id: "a" }, null) === "same", "a link that signs nobody in (a second email-change confirmation): nothing to ask");

// Who a token is for (read, not checked: only to compare).
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (o: unknown) => `${b64({ alg: "ES256" })}.${b64(o)}.sig`;
ok(JSON.stringify(tokenClaims(jwt({ sub: "u-1", email: "zoë@example.com" }))) === JSON.stringify({ sub: "u-1", email: "zoë@example.com" }), "a token's account and email (UTF-8 too)");
ok(tokenClaims("nope") === null && tokenClaims("a.%%%.c") === null && tokenClaims(null) === null, "a broken token: nothing");
ok(JSON.stringify(tokenClaims(jwt({ sub: 5 }))) === JSON.stringify({ sub: null, email: null }), "odd values: nothing");

// The old-style links' hand-over to the welcome page.
const now = 1_800_000_000_000;
const hand = (o: Record<string, unknown>) => JSON.stringify({ access_token: "a.b.c", refresh_token: "r", type: "recovery", email: "b@x.com", at: now - 1000, ...o });
ok(readHandoff(hand({}), now)?.email === "b@x.com", "a fresh hand-over is read");
ok(readHandoff(hand({ at: now - SWAP_MAX_AGE_MS - 1 }), now) === null, "an old one isn't (10 minutes)");
ok(readHandoff(hand({ at: now + 60_000 }), now) === null, "nor one from the future");
ok(readHandoff(hand({ refresh_token: "" }), now) === null && readHandoff("{", now) === null && readHandoff(null, now) === null, "nor a broken one");
ok(readHandoff(hand({ type: "<script>" }), now)?.type === null, "an odd type is dropped");
ok(nextForLinkType("recovery") === "/reset-password" && nextForLinkType("invite") === "/set-password" && nextForLinkType(null) === "/set-password", "where an old-style link's sign-in goes");

// --- Secure cookies ----------------------------------------------------------------------------------------------------------------
ok(sessionCookieOptions("https:").secure && sessionCookieOptions("https").secure && sessionCookieOptions("https,http").secure && sessionCookieOptions("HTTPS").secure, "https (the page's, or Vercel's x-forwarded-proto): Secure");
ok(!sessionCookieOptions("http:").secure && !sessionCookieOptions("http").secure && !sessionCookieOptions(null).secure && !sessionCookieOptions("").secure, "plain http (your computer): not, or the browser drops them");
for (const f of ["lib/supabase/server.ts", "lib/supabase/middleware.ts", "lib/supabase/client.ts"]) ok(/cookieOptions: sessionCookieOptions\(/.test(read(f)), `${f}: the sign-in cookies are Secure on https`);
ok(/sessionCookieOptions\(proto\)/.test(read("lib/supabase/server.ts")) && /get\("x-forwarded-proto"\)/.test(read("lib/supabase/server.ts")), "the server goes by the address Vercel was asked for");
ok(/sessionCookieOptions\(request\.nextUrl\.protocol\)/.test(read("lib/supabase/middleware.ts")), "the middleware by the request's");
ok(/window\.location\.protocol/.test(read("lib/supabase/client.ts")), "the browser by its own");

// --- Log out, and everywhere else ----------------------------------------------------------------------------------------------
const actions = read("app/(dashboard)/actions.ts");
ok(/export async function signOut\(\) \{\s*await signOutHere\(\);\s*redirect\("\/login"\);/.test(actions), "Log out: this device, then the sign-in page");
const here = actions.slice(actions.indexOf("export async function signOutHere"));
ok(/supabase\.auth\.signOut\(\{ scope: "local" \}\)/.test(here) && !/auth\.signOut\(\)/.test(actions), "this device only (supabase-js signs every device out by default)");
ok(/cookieStore\.delete\(PUSH_COOKIE\)/.test(here), "and this device's notifications stop");
const account = read("app/(dashboard)/settings/account-actions.ts");
const elsewhere = account.slice(account.indexOf("export async function signOutElsewhere"), account.indexOf("export async function forgetOtherDevicesNow"));
ok(/supabase\.auth\.getUser\(\)/.test(elsewhere) && /signOut\(\{ scope: "others" \}\)/.test(elsewhere) && /forgetOtherDevices\(supabase, user\.id\)/.test(elsewhere), "Sign out everywhere else: every other session, and their notifications");
const change = account.slice(account.indexOf("export async function changePassword"), account.indexOf("export async function signOutElsewhere"));
ok(change.indexOf("forgetOtherDevices(supabase, user.id)") > change.indexOf("updateUser("), "a new password from Settings: the signed-out devices' notifications stop too");
ok(/void forgetOtherDevicesNow\(\)/.test(read("app/reset-password/page.tsx")), "and from a reset link");
const devices = read("lib/push/devices.ts");
ok(/!mine \|\| pushDeviceHash\(d\.endpoint\) !== mine/.test(devices), "every device but this one (by its cookie)");
const settings = read("app/(dashboard)/settings/page.tsx");
ok(/<div id="sessions"/.test(settings) && /<SignOutElsewhere/.test(settings) && /<LogoutButton/.test(settings), "Settings → Account: Log out and Sign out everywhere else side by side");
ok(/id: "settings\.sign-out-elsewhere"/.test(read("lib/search/catalog.ts")), "search finds it");
const logout = read("components/ui/logout-button.tsx");
ok(/Your other devices stay signed in\./.test(logout) && /confirm\(LOGOUT_CONFIRM\)/.test(logout) && /confirm\(LOGOUT_CONFIRM\)/.test(read("components/search/search-palette.tsx")), "\"Log out?\" says it's this device, wherever it's asked");

// --- An email's link -----------------------------------------------------------------------------------------------------------------
const welcome = read("app/welcome/welcome-card.tsx");
ok(/persistSession: false, autoRefreshToken: false, detectSessionInUrl: false/.test(welcome), "the link is checked on a side client that keeps nothing");
ok(/const \{ data, error \} = await sideClient\(\)\.auth\.verifyOtp/.test(welcome) && /swapDecision\(here\.user, data\.user\?\.id\) === "ask"/.test(welcome), "when someone's signed in here, it asks before swapping");
const goFn = welcome.slice(welcome.indexOf("async function go()"), welcome.indexOf("async function continueAs"));
ok(goFn.indexOf("if (!here.user)") < goFn.indexOf("supabase.auth.verifyOtp"), "nobody signed in: straight in, as before");
const cont = welcome.slice(welcome.indexOf("async function continueAs"), welcome.indexOf("async function stay"));
ok(cont.indexOf("signOutHere()") > 0 && cont.indexOf("signOutHere()") < cont.indexOf("setSession(s.session)"), "Continue as …: this device leaves the old account first");
const stay = welcome.slice(welcome.indexOf("async function stay"));
ok(/side\.auth\.signOut\(\{ scope: "local" \}\)/.test(stay), "Stay as …: the link's new sign-in is ended right away");
ok(/This link is for another account/.test(welcome) && /Continue as \$\{swap\.to\}/.test(welcome) && /Stay as \{swap\.from\}/.test(welcome), "the question names both accounts");
const hash = read("components/ui/auth-hash-handler.tsx");
ok(/swapDecision\(data\.user, claims\?\.sub\) === "ask"/.test(hash) && /sessionStorage\.setItem\(SWAP_KEY/.test(hash) && /router\.push\("\/welcome\?swap=1"\)/.test(hash), "old-style links hand another account's sign-in to the welcome page to ask");
ok(hash.indexOf('sessionStorage.setItem(SWAP_KEY') < hash.indexOf("setSession({ access_token, refresh_token })"), "before it's ever put in place");
ok(/swap=\{one\("swap"\) === "1"\}/.test(read("app/welcome/page.tsx")), "the welcome page reads the hand-over");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("sessions: all good");
