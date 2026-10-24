// 1.31.10: passwords. One set of rules wherever a password is chosen (an invited account's first step, a reset link,
// Settings → Password), checked as it's typed and again where it's saved; a reset says whose password it is and that
// other devices are signed out; Settings changes it with the current one (with the sign-in limits); only a sign-in
// from an email link chooses one without the current one.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkPassword, fromEmailLink, PASSWORD_MAX_BYTES, PASSWORD_MIN, passwordBytes, passwordSaveError, type PasswordAbout } from "../lib/auth/password-rules";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// --- The rules -------------------------------------------------------------------------------------------------------------
const me: PasswordAbout = { email: "eduard.neague@viverro.com", names: ["Eduard Neague", "edu4rd"] };
const verdict = (pw: string, about: PasswordAbout = me) => {
  const r = checkPassword(pw, about);
  return r.ok ? "ok" : r.checks.filter((c) => !c.ok).map((c) => c.rule).join(",");
};
const cases: [string, string][] = [
  ["short", "length"],
  ["password", "guessable"],
  ["Password2026!", "guessable"],
  ["P@ssw0rd123", "guessable"],
  ["passw0rd", "guessable"],
  ["mypassword", "guessable"],
  ["passwordpassword", "guessable"],
  ["12345678", "guessable"],
  ["87654321", "guessable"],
  ["20262026", "guessable"],
  ["12345678!", "guessable"],
  ["qwertyuiop", "guessable"],
  ["asdfghjk", "guessable"],
  ["aaaaaaaa", "guessable"],
  ["abababab", "guessable"],
  ["Aa1Aa1Aa1", "guessable"],
  ["sunshine2026", "guessable"],
  ["iloveyou!!", "guessable"],
  ["Cliptroop2026", "guessable"],
  ["eduard123", "personal"],
  ["Edu4rd!!99", "personal"],
  ["viverro2026", "personal"],
  ["NeagueRocks", "personal"],
  ["eduard.neague@viverro.com", "personal"],
  ["correct horse battery staple", "ok"],
  ["Tr0ub4dor&3", "ok"],
  ["blue-garden-rocket-42", "ok"],
  ["ab839201", "ok"],
  ["Zm9!kq2Lx", "ok"],
  ["evangeline77", "ok"],
  ["videographer1", "ok"],
];
for (const [pw, want] of cases) ok(verdict(pw) === want, `${JSON.stringify(pw)}: ${want} (got ${verdict(pw)})`);
// A gmail address says nothing about the person: "gmail" in a password is fine; their name in it isn't.
ok(verdict("gmail-river-stone", { email: "someone.else@gmail.com", names: [] }) === "ok", "a mail provider's name isn't personal");
ok(verdict("someone-river-stone", { email: "someone.else@gmail.com", names: [] }) === "personal", "the name before the @ is");
ok(verdict("rocket-garden-42", {}) === "ok", "nobody known: only the other rules");
ok(verdict("x".repeat(PASSWORD_MIN - 1) + "ü", {}) === "guessable", `${PASSWORD_MIN} characters counted as people count them`);

// Too long for Supabase: 72 bytes, not characters (an emoji is 4).
ok(PASSWORD_MAX_BYTES === 72 && passwordBytes("é") === 2 && passwordBytes("😀") === 4, "bytes as Supabase counts them");
const long = "tiger-lamp-ocean-" + "q".repeat(60);
ok(checkPassword(long).checks.some((c) => c.rule === "max" && !c.ok), "73 bytes and up: too long (the rest wouldn't be kept)");
ok(!checkPassword("blue-garden-rocket-42").checks.some((c) => c.rule === "max"), "the 72 rule is only listed when it's broken");

// What the page shows: three rules (the page adds "Both are the same"), the first problem as the error.
const empty = checkPassword("", me);
ok(empty.checks.map((c) => c.rule).join(",") === "length,guessable,personal" && empty.checks.every((c) => !c.ok), "an empty box: three rules, none met yet");
ok(checkPassword("short", me).error === `Use at least ${PASSWORD_MIN} characters.`, "the first problem is the one shown");
ok(checkPassword("blue-garden-rocket-42", me).error === null, "and none when it's fine");

// --- What Supabase says ------------------------------------------------------------------------------------------------------------
ok(passwordSaveError(null) === null, "saved: nothing to say");
ok(/password you have now/.test(passwordSaveError({ code: "same_password", message: "New password should be different from the old password." }) ?? ""), "the same one as now");
ok(/data leak/.test(passwordSaveError({ code: "weak_password", message: "Password is known to be weak and easy to guess, please choose a different one.", reasons: ["pwned"] }) ?? ""), "leaked (Pro's check)");
ok(/more kinds of characters/.test(passwordSaveError({ code: "weak_password", message: "Password should contain at least one character of each: abc, 123.", reasons: ["characters"] }) ?? ""), "Supabase's required characters");
ok(/at least 10 characters/.test(passwordSaveError({ code: "weak_password", message: "Password should be at least 10 characters.", reasons: ["length"] }) ?? ""), "Supabase's own minimum, when it's higher");
ok(/at most 72/.test(passwordSaveError({ code: "validation_failed", message: "Password cannot be longer than 72 characters" }) ?? ""), "too long");
ok(/sign in again/i.test(passwordSaveError({ code: "reauthentication_needed", message: "Password update requires reauthentication" }) ?? ""), "Secure password change wants a fresh sign-in");
ok(/current password isn't right/.test(passwordSaveError({ code: "current_password_mismatch", message: "Current password required when setting new password." }) ?? ""), "Require current password");
ok(/Too many tries/.test(passwordSaveError({ status: 429, message: "rate limit" }) ?? ""), "too many");
ok(/link has expired/.test(passwordSaveError({ name: "AuthSessionMissingError", message: "Auth session missing!" }) ?? ""), "from a link: the link expired");
ok(/session expired/.test(passwordSaveError({ name: "AuthSessionMissingError", message: "Auth session missing!" }, "settings") ?? ""), "from Settings: the session did");
ok(passwordSaveError({ message: "something else" }) === "Couldn't save your password. Try again in a minute.", "anything else");

// --- How the sign-in started -----------------------------------------------------------------------------------------------------------
for (const m of ["otp", "recovery", "invite", "magiclink", "email/signup"]) ok(fromEmailLink([{ method: m, timestamp: 1 }]), `${m}: from an email link`);
ok(fromEmailLink(["password", "otp"]), "strings too (older tokens)");
ok(!fromEmailLink([{ method: "password", timestamp: 1 }]) && !fromEmailLink([{ method: "oauth" }]) && !fromEmailLink([]) && !fromEmailLink(null), "a password (or anything else): not");

// --- Where it's used ------------------------------------------------------------------------------------------------------------------
const reset = read("app/reset-password/page.tsx");
ok(/fromEmailLink\(aal\?\.currentAuthenticationMethods\)/.test(reset) && /Change it in Settings/.test(reset) && /href="\/settings\?tab=account#password"/.test(reset), "the reset page: only from a link; a password sign-in goes to Settings");
ok(/For <b[^>]*>\{who\.email\}<\/b>/.test(reset), "it says whose password it is");
ok(/newPasswordState\(password, confirm, \{ email: who\.email, names: who\.names \}\)/.test(reset) && /passwordSaveError\(saveError\)/.test(reset), "the rules, and Supabase's answer in plain words");
ok(/Every other device that was signed in to your account was signed out/.test(reset), "and that the other devices are signed out");
const setup = read("app/set-password/page.tsx");
ok(/<NewPasswordFields/.test(setup) && /newPasswordState\(password, confirm, about\)/.test(setup), "an invited account's first step: the same rules");
ok(/const link = fromEmailLink\(aal\?\.currentAuthenticationMethods\);/.test(setup) && /if \(!link\) setStep\(\(s\) => \(s === "password" \? "profile" : s\)\);/.test(setup), "a password sign-in skips choosing one there");
const fields = read("components/ui/new-password.tsx");
ok(/autoComplete="new-password"/.test(fields) && /Both are the same/.test(fields) && /checkPassword\(value, about\)/.test(fields), "the fields: new-password, typed twice, the checklist");
const actions = read("app/(dashboard)/settings/account-actions.ts");
const change = actions.slice(actions.indexOf("export async function changePassword"), actions.indexOf("/** Buckets with a folder per person"));
ok(/supabase\.auth\.getUser\(\)/.test(change) && /checkPassword\(next, \{ email: user\.email/.test(change), "Settings: the server checks the rules too");
ok(change.indexOf("signInWait(keys)") > 0 && change.indexOf("signInWait(keys)") < change.indexOf("signInWithPassword"), "the sign-in limits before the current password is checked");
ok(/signInWithPassword\(\{ email: user\.email, password: current \}\)/.test(change) && /noteSignIn\(keys, false\)/.test(change) && /noteSignIn\(keys, true\)/.test(change), "the current password, counted like signing in");
ok(/updateUser\(\{ password: next, current_password: current \}\)/.test(change) && /passwordSaveError\(error, "settings"\)/.test(change), "saved with the current one (for Supabase's own check)");
ok(change.indexOf("signInWithPassword") < change.indexOf("updateUser"), "a fresh sign-in first (Secure password change)");
const settings = read("app/(dashboard)/settings/page.tsx");
ok(/<PasswordSection/.test(settings) && /email=\{user\?\.email \?\? profile\?\.email/.test(settings), "Settings → Account shows it, for the sign-in's own email");
const section = read("app/(dashboard)/settings/password-section.tsx");
ok(/id="password"/.test(section) && /autoComplete="current-password"/.test(section) && /resetPasswordForEmail\(email/.test(section), "the section: current password, and a reset link for a forgotten one");
ok(/id: "settings\.password"/.test(read("lib/search/catalog.ts")), "search finds Change password");
ok(/title="Supabase: password rules"/.test(read("app/(dashboard)/setup/page.tsx")), "App setup lists Supabase's own password settings");

// Nowhere else sets a password: a new place would skip the rules.
const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
};
for (const d of ["app", "components", "modules", "lib"]) walk(join(root, d));
const setters = files.filter((f) => /updateUser\(\{[^}]*\bpassword\b/.test(readFileSync(f, "utf8"))).map((f) => relative(root, f)).sort();
ok(JSON.stringify(setters) === JSON.stringify(["app/(dashboard)/settings/account-actions.ts", "app/reset-password/page.tsx", "app/set-password/page.tsx"]), `passwords are set in three places only (${setters.join(", ")})`);

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("passwords: all good");
