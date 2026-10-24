// 1.31.6: sign-in limits. After too many wrong passwords the app waits before it checks another one (8 for one account
// from one address in 15 minutes, 30 for one account from anywhere, 40 from one address): its own limits, as Supabase only
// sees the app's server. Hashes only, never an email or an address. Deleting an account checks the password the same way.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clientAddress, SIGN_IN_LIMITS, signInKeys, signInOutcome, waitText } from "../lib/auth/sign-in-rules";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// --- What a try is counted under ----------------------------------------------------------------------------------------
const a = signInKeys("Oana@Example.com ", "203.0.113.7");
ok(a.account === signInKeys(" oana@example.com", "198.51.100.2").account, "one account, whatever the case or spaces");
ok(a.account !== signInKeys("don@example.com", "203.0.113.7").account && a.address === signInKeys("don@example.com", "203.0.113.7").address, "another account, the same address");
ok(/^[A-Za-z0-9_-]{43}$/.test(a.account) && /^[A-Za-z0-9_-]{43}$/.test(a.address), "sha256 hashes");
ok(!JSON.stringify(a).includes("oana") && !JSON.stringify(a).includes("203.0.113"), "never the email or the address itself");

const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
ok(clientAddress(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })) === "203.0.113.7", "the first address Vercel lists");
ok(clientAddress(h({ "x-real-ip": "198.51.100.2" })) === "198.51.100.2", "or x-real-ip");
ok(clientAddress(h({})) === "unknown", "or nothing known");

// --- What people read ----------------------------------------------------------------------------------------------------------
ok(waitText(20) === "Too many tries. Try again in a minute." && waitText(60) === "Too many tries. Try again in a minute.", "under a minute");
ok(waitText(61) === "Too many tries. Try again in 2 minutes." && waitText(900) === "Too many tries. Try again in 15 minutes.", "minutes");

// --- What Supabase's answer means --------------------------------------------------------------------------------------------
ok(signInOutcome(null) === "ok", "no error: signed in");
ok(signInOutcome({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" }) === "wrong", "a wrong password");
ok(signInOutcome({ status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" }) === "busy", "Supabase's own limit: not counted as wrong");
ok(signInOutcome({ status: 400, code: "email_not_confirmed", message: "Email not confirmed" }) === "unconfirmed", "not set up yet");
ok(signInOutcome({ status: 500, message: "Database error" }) === "down" && signInOutcome({ message: "fetch failed" }) === "down", "not reachable: not counted, not called wrong");

// --- The same numbers in the database ---------------------------------------------------------------------------------------------
const sql = read("supabase/migrations/0105_sign_in_limits.sql");
ok(new RegExp(`interval '${SIGN_IN_LIMITS.windowMinutes} minutes'`).test(sql), "15 minutes");
ok(new RegExp(`f\\.account = p_account and f\\.address = p_address[^;]+offset ${SIGN_IN_LIMITS.sameAccountAndAddress - 1} limit 1`).test(sql), "8 for one account from one address");
ok(new RegExp(`where f\\.account = p_account and f\\.at[^;]+offset ${SIGN_IN_LIMITS.sameAccount - 1} limit 1`).test(sql), "30 for one account");
ok(new RegExp(`where f\\.address = p_address and f\\.at[^;]+offset ${SIGN_IN_LIMITS.sameAddress - 1} limit 1`).test(sql), "40 from one address");
ok(/revoke all on table public\.sign_in_failures from public, anon, authenticated;/.test(sql) && /revoke all on function public\.sign_in_wait\(text, text\) from public, anon, authenticated;/.test(sql) && /revoke all on function public\.sign_in_note\(text, text, boolean\) from public, anon, authenticated;/.test(sql), "only the server");

// --- Signing in ------------------------------------------------------------------------------------------------------------------------
const login = read("app/login/actions.ts");
const waitAt = login.indexOf("await signInWait(keys)");
const checkAt = login.indexOf("signInWithPassword");
ok(waitAt > 0 && checkAt > waitAt && /if \(wait > 0\) return \{ error: waitText\(wait\), wait: true \};/.test(login), "the wait comes first: no password is checked meanwhile");
ok(/case "wrong":\s+await noteSignIn\(keys, false\);/.test(login) && /await noteSignIn\(keys, true\);\s+redirect\(next\);/.test(login), "a wrong one counts, a right one clears");
ok(/return \{ error: "Incorrect email or password\." \};/.test(login) && !/doesn't exist|no account|not found/i.test(login), "never says whether an email has an account");
ok(/const email = String\(formData\.get\("email"\) \?\? ""\)\.trim\(\);/.test(login), "spaces around the email don't matter");
const page = read("app/login/page.tsx");
ok(/\{state\.wait && \(/.test(page) && />\s*Reset your password\s*</.test(page), "waiting: a password reset is offered");

// --- Deleting an account checks the password the same way -------------------------------------------------------------------
const account = read("app/(dashboard)/settings/account-actions.ts");
const dWait = account.indexOf("await signInWait(keys)");
const dCheck = account.indexOf("check.auth.signInWithPassword");
ok(dWait > 0 && dCheck > dWait, "deleting an account: the wait first");
ok(/if \(outcome === "wrong"\) await noteSignIn\(keys, false\);/.test(account) && /await noteSignIn\(keys, true\);/.test(account), "and the count");
ok(/await check\.auth\.signOut\(\{ scope: "local" \}\)/.test(account), "the check's own session isn't kept");

// --- Never in the way --------------------------------------------------------------------------------------------------------------
const limits = read("lib/auth/sign-in-limits.ts");
ok(/^import "server-only";/.test(limits), "server only");
ok(/catch \(e\) \{[^}]*return 0;/.test(limits), "if the limits can't be read, nobody waits");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("sign in: all passed");
