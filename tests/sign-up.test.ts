// 1.45.0: creating an account on the website (the owner: "we will now work on a registration form as well because i
// will open the app publicly"). The form's rules, Supabase's answers in words, and how the page and the server use them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanEmail, cleanName, emailLooksRight, signUpErrorText, signUpProblem } from "../lib/auth/sign-up-rules";
import { isPublicPath } from "../lib/public-paths";
import { isBrandPage } from "../lib/public-pages";
import { signInOutcome } from "../lib/auth/sign-in-rules";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const good = { name: "Ana Pop", email: "ana@example.com", password: "copper kettle orbit", confirm: "copper kettle orbit", agree: true };

// Tidying.
ok(cleanName("  Ana \n  Pop ") === "Ana Pop" && cleanName("A​na") === "Ana" && cleanName("x".repeat(200)).length === 80, "names: spaces tidied, nothing invisible, 80 at most");
ok(cleanEmail("  Ana@Example.COM ") === "ana@example.com", "emails: trimmed, lower case");
ok(emailLooksRight("ana@example.com") && emailLooksRight("a.b+c@sub.example.ro") && !emailLooksRight("ana@example") && !emailLooksRight("ana example.com") && !emailLooksRight("a@b.c") && !emailLooksRight("<a@b.com>"), "emailLooksRight");

// The form's problems, in the order it reads.
ok(signUpProblem(good) === null, "a good form goes");
ok(signUpProblem({ ...good, name: "   " })?.field === "name", "a name");
ok(signUpProblem({ ...good, email: "ana@" })?.field === "email", "an email");
ok(signUpProblem({ ...good, password: "short", confirm: "short" })?.field === "password", "the password rules (lib/auth/password-rules.ts)");
ok(signUpProblem({ ...good, password: "ana@example.com1", confirm: "ana@example.com1" })?.field === "password", "not made from the email");
ok(signUpProblem({ ...good, confirm: "copper kettle orbiT" })?.field === "confirm", "typed the same twice");
ok(signUpProblem({ ...good, agree: false })?.field === "agree", "18 or older, and the terms");
ok(signUpProblem({ ...good, name: "", agree: false })?.field === "name", "the first problem first");

// Supabase's answers.
ok(signUpErrorText(null) === null, "no error");
ok(signUpErrorText({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" })?.field === null, "too many at once: no field");
ok(/closed/.test(signUpErrorText({ status: 422, code: "signup_disabled", message: "Signups not allowed for this instance" })?.error ?? ""), "sign-ups off in Supabase");
ok(signUpErrorText({ status: 400, code: "captcha_failed", message: "captcha protection: request disallowed" })?.field === "check", "a captcha refusal: the check");
ok(signUpErrorText({ status: 400, code: "email_address_invalid", message: "Email address is invalid" })?.field === "email", "an email Supabase won't take");
ok(signUpErrorText({ status: 422, code: "weak_password", message: "Password should be at least 10 characters" })?.field === "password", "a password Supabase won't take");
ok(signUpErrorText({ status: 500, message: "boom" })?.error === "Couldn't create your account. Try again in a minute.", "anything else");
ok(signInOutcome({ status: 400, code: "captcha_failed", message: "captcha protection: request disallowed" }) === "captcha", "signing in: a captcha refusal isn't a wrong password");

// Where it lives.
ok(isPublicPath("/signup") && !isPublicPath("/signup/x") && !isPublicPath("/signups") && isBrandPage("/signup"), "/signup: public, in the app's own colours");
ok(/request\.nextUrl\.pathname === "\/login" \|\| request\.nextUrl\.pathname === "\/signup"/.test(read("lib/supabase/middleware.ts")), "signed in already: /signup goes to the dashboard");
ok(/href="\/signup"/.test(read("app/login/page.tsx")) && /href="\/login"/.test(read("app/signup/page.tsx")), "Sign in and Create an account point at each other");

// The server.
const action = read("app/signup/actions.ts");
ok(/const problem = signUpProblem\(raw\);\s+if \(problem\) return problem;/.test(action), "checked again on the server");
ok(/if \(String\(formData\.get\("website"\) \?\? ""\)\.trim\(\)\) return \{ sent: email \};/.test(action), "the box only scripts fill in: told what everyone's told");
ok(/await verifyTurnstile\(String\(formData\.get\("captcha"\) \?\? ""\), address, "signup"\)/.test(action) && action.indexOf("verifyTurnstile(") < action.indexOf("auth.signUp("), "the security check before the account");
ok(/options: \{ data: \{ full_name: name \}, emailRedirectTo: `\$\{appUrl\(\)\}\/welcome` \}/.test(action), "the name goes to the profile (handle_new_user), the email to /welcome");
ok(/if \(data\.session\) redirect\("\/dashboard"\);\s+return \{ sent: email \};/.test(action), "signed in at once only without Confirm email");
const verify = read("lib/auth/turnstile-verify.ts");
ok(/import "server-only";/.test(verify) && /turnstile\/v0\/siteverify/.test(verify) && /if \(!secret\) return "ok";/.test(verify), "Cloudflare checks the answer, on the server; without a secret there's nothing to check");

// The page.
const page = read("app/signup/page.tsx");
ok(/autoComplete="name"/.test(page) && /autoComplete="email"/.test(page) && /inputMode="email"/.test(page) && /spellCheck=\{false\}/.test(page), "the right autocomplete and keyboard");
ok(/document\.getElementById\(FIELD_ID\[f\]\)\?\.focus\(\)/.test(page) && /role="alert"/.test(page), "a problem is said and its box focused");
ok(/\{pending \? "Creating your account…" : "Create account"\}/.test(page), "the button keeps saying what it does");
ok(/name="website" type="text" tabIndex=\{-1\}/.test(page), "the box only scripts fill in");
ok(/I&rsquo;m 18 or older and I agree to the/.test(page) && /You must be 18 or older to make an account\./.test(read("app/(legal)/terms/page.tsx")), "18 or older, on the form and in the terms");
ok(!/invitation only|Access is by invitation/i.test(read("app/(legal)/privacy/page.tsx") + read("app/(legal)/terms/page.tsx")), "the legal pages no longer say invitation only");
ok(/next: "\/dashboard",/.test(read("app/welcome/welcome-card.tsx").split("signup: {")[1]?.split("},")[0] ?? ""), "a confirmed sign-up goes on to name its team");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("sign-up: ok");
