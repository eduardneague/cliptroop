// 1.46.0: two-step sign-in. The owner: "2 factor authentication … through a google authenticator or email and you
// have to set this up in your account after first creating it".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_TRIES, cleanCode, codeHash, emailDoneCookie, emailDoneFor, maskEmail, safeNext, sessionIdOf, twoStepApplies, twoStepNeed } from "../lib/auth/two-step";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

async function main() {
  process.env.TWO_STEP_SECRET = "test-secret-for-two-step";

  // Who goes where.
  const base = { app: false, email: false, aal2: false, emailDone: false };
  ok(twoStepNeed(base) === "setup", "nothing set up: set it up (everyone has one)");
  ok(twoStepNeed({ ...base, app: true }) === "verify" && twoStepNeed({ ...base, app: true, aal2: true }) === "ok", "an app: its code, then in");
  ok(twoStepNeed({ ...base, email: true }) === "verify" && twoStepNeed({ ...base, email: true, emailDone: true }) === "ok", "email: its code, then in");
  ok(twoStepNeed({ ...base, emailDone: true }) === "ok", "just set up by email (the token still says nothing): in");

  ok(!twoStepApplies("/two-step") && !twoStepApplies("/two-step/setup") && !twoStepApplies("/welcome") && !twoStepApplies("/set-password") && !twoStepApplies("/reset-password") && !twoStepApplies("/api/push"), "never in front of its own pages, the sign-in ones or the API (the database guards that)");
  ok(twoStepApplies("/dashboard") && twoStepApplies("/settings") && twoStepApplies("/developer") && twoStepApplies("/two-steps") && twoStepApplies("/welcomes"), "in front of everything else");

  ok(safeNext("/shorts?x=1") === "/shorts?x=1" && safeNext("//evil.com") === "/dashboard" && safeNext("https://evil.com") === "/dashboard" && safeNext("/two-step") === "/dashboard" && safeNext("/two-step/setup?change=1") === "/two-step/setup?change=1" && safeNext(null) === "/dashboard", "back to this site's own pages only");
  ok(maskEmail("ana@example.com") === "a**@example.com" && maskEmail("alexandra@example.com") === "a******@example.com" && maskEmail("x") === "x", "the address, half hidden");
  ok(cleanCode("123 456") === "123456" && cleanCode("123-456") === "123456" && cleanCode("12345") === null && cleanCode("12345a") === null && cleanCode("1234567") === null, "six digits, however pasted");

  // The session's id from its token.
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const sid = "1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b";
  ok(sessionIdOf(`x.${b64({ session_id: sid, aal: "aal1" })}.y`) === sid && sessionIdOf("nope") === null && sessionIdOf(`x.${b64({ session_id: "1; drop" })}.y`) === null, "the session's id, read from its token");

  // The cookie that says this sign-in typed its email code: only for this session, only made here.
  const c = await emailDoneCookie(sid);
  ok(await emailDoneFor(c, sid), "the cookie fits its own session");
  ok(!(await emailDoneFor(c, "2b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b")), "not another session's");
  ok(!(await emailDoneFor(`${sid}.${"0".repeat(64)}`, sid)) && !(await emailDoneFor(`${sid}.abc`, sid)) && !(await emailDoneFor(null, sid)), "a made-up one doesn't pass");
  const h = await codeHash("u1", "123456");
  ok(/^[0-9a-f]{64}$/.test(h) && h === (await codeHash("u1", "123456")) && h !== (await codeHash("u2", "123456")), "a code's hash: keyed, per person");
  ok(CODE_TRIES === 5, "five tries a code");

  // The middleware.
  const mw = read("lib/supabase/middleware.ts");
  ok(/if \(user && !isPublicRoute && process\.env\.TWO_STEP !== "off" && twoStepApplies\(request\.nextUrl\.pathname\)\)/.test(mw) && /url\.pathname = need === "verify" \? "\/two-step" : "\/two-step\/setup";/.test(mw), "every app page: set up or type the code first");

  // The server's side of email codes.
  const act = read("app/two-step/actions.ts");
  ok(/randomInt\(0, 1_000_000\)/.test(act) && /code_hash: await codeHash\(who\.user\.id, code\)/.test(act), "a random code, kept only as its hash");
  ok(/if \(since < RESEND_SECONDS\) return/.test(act) && /attempts: tries \+ 1/.test(act) && /if \(tries >= CODE_TRIES\)/.test(act) && /expires_at as string\) < Date\.now\(\)/.test(act), "one a minute, five tries, ten minutes");
  ok(/from\("two_step_sessions"\)\.upsert\(\{ session_id: who\.sessionId, user_id: who\.user\.id \}\)/.test(act) && /\.set\(TWO_STEP_COOKIE, await emailDoneCookie\(who\.sessionId\)/.test(act), "the right code: this sign-in, for the database and the app");
  ok(/admin\.auth\.admin\.mfa\.deleteFactor/.test(act) && /two_step: null/.test(act), "one way at a time");
  const forms = read("components/auth/two-step-forms.tsx");
  ok(/mfa\.enroll\(\{ factorType: "totp"/.test(forms) && /challengeAndVerify/.test(forms) && /autoComplete="one-time-code"/.test(forms), "the app: Supabase's own, the code box the phone fills");

  // The database.
  const m = read("supabase/migrations/0125_two_step.sql");
  ok(/as restrictive for all to authenticated using \(\(select public\.mfa_ok\(\)\)\) with check \(\(select public\.mfa_ok\(\)\)\)/.test(m), "every table people reach: a password alone reads nothing");
  ok(/alter role authenticator set pgrst\.db_pre_request = ''two_step_guard\.check_request''/.test(m), "and the API turns it away before anything runs");
  ok(/revoke all on public\.two_step_email, public\.two_step_codes, public\.two_step_sessions from anon, authenticated;/.test(m), "the codes are the server's only");
  ok(read("app/(dashboard)/settings/account-tab.tsx").includes('href="/two-step/setup?change=1"'), "Settings → Account changes it");
  ok(read("supabase/tests/two-step.test.sql").includes("-- 6. The API's own check"), "0125's test");

  if (fails) {
    console.log(`${fails} failed`);
    process.exit(1);
  }
  console.log("two-step: ok");
}
void main();
