// 1.49.0: a new account's first steps. The owner (Nov 3 2026): "where did the onboarding step for new accounts go? i
// want that too and an option to skip onbaording for now and g odirectly to the app", with two-step sign-in offered
// there. 1.49.1: "after creating an account and clicking confirm sign in on the enamil, you should get to the
// onboadring page with the ability to skip, then you go to the add two step with the ability to skip and then thats it,
// you go to the app … make it like a 3 stepp thing. the fact that i click confirm sign in on the email, shouldnt get me
// to a page where i have to press sign in again", and for deleting an account "one last cofnirmation" and "a page
// saying your account has been successfully delted".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEW_DONE, ONBOARDING_HOME, SKIP_TO, canSkip, nextStep, onboardingApplies, onboardingPending, prevStep, progressFor, startStep, stepsFor, twoStepSetupHref } from "../lib/auth/onboarding";
import { isPublicPath } from "../lib/public-paths";
import { isBrandPage } from "../lib/public-pages";
import { safeNext } from "../lib/auth/two-step";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

// --- A new account: About you, Two-step, then the app -------------------------------------------------------------------
const fresh = stepsFor("new");
ok(JSON.stringify(fresh) === JSON.stringify(["profile", "two-step"]), "a new account: about you, then two-step");
ok(JSON.stringify(progressFor("new")) === JSON.stringify(["About you", "Two-step", "Your dashboard"]), "three marks on the bar: the third is the app");
ok(startStep(fresh, null) === "profile" && startStep(fresh, "two-step") === "two-step" && startStep(fresh, "phone") === "profile", "starts at About you (or a step it has)");
ok(nextStep(fresh, "profile") === "two-step" && prevStep(fresh, "two-step") === "profile", "About you's Skip or Continue: on to two-step; Back: About you");
ok(fresh.every((s) => !canSkip("new", s)), "no Skip for now at the top: each step has its own Skip");
ok(SKIP_TO === "/dashboard", "the app is the dashboard");

const comp = read("components/onboarding/account-setup.tsx");
ok(/progressFor\(mode\)/.test(comp) && /marks\.map/.test(comp), "the bar is drawn from those marks");
const newTwoStep = comp.slice(comp.indexOf('step === "two-step" && mode === "new"'), comp.indexOf('step === "two-step" && mode === "invite"'));
ok(newTwoStep.length > 0 && /<TwoStepSetup email=\{maskedEmail\} current=\{null\} change=\{false\} next=\{NEW_DONE\} skip=\{NEW_DONE\} \/>/.test(newTwoStep), "two-step is set up right in the step; done or Not now, the app opens (through NEW_DONE, 1.51.0)");
ok(/Two-step sign-in is on/.test(newTwoStep) && /Go to my dashboard/.test(newTwoStep), "already on: straight to the app");
ok(!/step === "team"/.test(comp) && !/createTeam/.test(comp), "no team step: a new account names its team on the dashboard");
ok(/redirect\(`\/dashboard`\);/.test(read("app/(dashboard)/teams/new/actions.ts")) && !/TEAM_NEXT|formData\.get\("next"\)/.test(read("app/(dashboard)/teams/new/actions.ts")), "naming a team leads to the dashboard, as before 1.49.0");

const getStarted = read("app/get-started/page.tsx");
ok(/mode="new"/.test(getStarted) && /maskedEmail=\{facts\.maskedEmail\}/.test(getStarted), "/get-started: a new account's steps, with the email half hidden for email codes");
ok(/maskEmail\(user\.email \?\? ""\)/.test(read("lib/auth/onboarding-facts.ts")), "masked on the server");
ok(!isPublicPath("/get-started") && isBrandPage("/get-started"), "/get-started: signed in only, in the app's own colours");

// --- The confirm-your-email link: no second press -----------------------------------------------------------------------
const welcome = read("app/welcome/welcome-card.tsx");
ok(/const autoConfirm = type === "signup" && !!tokenHash && !expired && !handoff;/.test(welcome), "a sign-up's link confirms by itself");
ok(/autoConfirm \|\| \(code && !handoff\) \? "working" : "idle"/.test(welcome), "and shows it's working from the start, not a button (a ?code= link too, 1.51.0)");
ok(/verifyOtp\(\{ token_hash: tokenHash, type: "signup" \}\)/.test(welcome) && /router\.replace\(COPY\.signup\.next\)/.test(welcome) && /next: "\/get-started",/.test(welcome.split("signup: {")[1] ?? ""), "then straight into the first steps");
ok(/if \(here\.user\) \{\s*setState\("idle"\);/.test(welcome), "someone else signed in here: the button asks first, as before");
ok(/document\.visibilityState === "visible"/.test(welcome) && /if \(started\.current\) return;\s*started\.current = true;/.test(welcome), "once, and only once the page is in front of someone");

// --- An invited account (unchanged): Password, About you, Two-step, Your phone, All set --------------------------------
const invite = stepsFor("invite");
ok(JSON.stringify(invite) === JSON.stringify(["password", "profile", "two-step", "phone", "done"]), "an invite: password, about you, two-step, phone, all set");
ok(!canSkip("invite", "password") && canSkip("invite", "profile") && !canSkip("invite", "done"), "Skip for now once it has a password");
const href = twoStepSetupHref(invite);
ok(href === `/two-step/setup?next=${encodeURIComponent("/set-password?step=phone")}` && safeNext(decodeURIComponent(href.split("next=")[1])) === "/set-password?step=phone", "Set it up comes back to Your phone");
ok(ONBOARDING_HOME.invite === "/set-password" && /mode="invite"/.test(read("app/set-password/page.tsx")), "/set-password: an invite's");

// --- Signing up ---------------------------------------------------------------------------------------------------------
ok(/redirect\("\/get-started"\)/.test(read("app/signup/actions.ts")), "signed in straight from the form: its first steps");

// --- Deleting an account: one last question, then a page that says so --------------------------------------------------
const del = read("app/(dashboard)/settings/delete-account.tsx");
ok(/useState<0 \| 1 \| 2 \| 3>\(0\)/.test(del) && /open=\{step === 3\}/.test(del) && /Delete your account for good\?/.test(del) && /Yes, delete it/.test(del), "after the email and password: one last Yes, delete it");
ok(/onClick=\{askLast\}/.test(del) && del.indexOf("function askLast") < del.indexOf("function confirmDelete") && /onClick=\{confirmDelete\}/.test(del.slice(del.indexOf("open={step === 3}"))), "the password step only asks; the last step deletes");
ok(/setStep\(2\);/.test(del), "a wrong password: back to typing it");
ok(/redirect\("\/account-deleted"\);/.test(read("app/(dashboard)/settings/account-actions.ts")), "deleted: the page that says so");
const gone = read("app/account-deleted/page.tsx");
ok(/Your account has been deleted/.test(gone) && /href="\/"/.test(gone) && /Go to the home page/.test(gone), "it says so, with the way back to the home page");
ok(isPublicPath("/account-deleted") && isBrandPage("/account-deleted"), "public (signed out by then; refreshing shows it again), in the app's own colours");

// ---- 1.51.0: the first steps hang on the account, not on the email's link ------------------------------------------------
// The owner (Nov 4 2026): "the onboarding doesnt exist again, after you confirmt he email you just get prompted to sign
// in, no onboarding no 2fa, nothing".
ok(onboardingPending({ onboarding: "pending", full_name: "A" }) && !onboardingPending({ onboarding: "done" }) && !onboardingPending({}) && !onboardingPending(null) && !onboardingPending("pending"), "the mark: user_metadata.onboarding = pending");
ok(onboardingApplies("/dashboard") && onboardingApplies("/teams/new") && onboardingApplies("/settings") && onboardingApplies("/get-startedx"), "every page of the app sends it to its steps");
ok(!onboardingApplies("/get-started") && !onboardingApplies(NEW_DONE) && !onboardingApplies("/two-step/setup") && !onboardingApplies("/welcome") && !onboardingApplies("/api/upload") && !onboardingApplies("/login") && !onboardingApplies("/account-deleted"), "but not the steps, two-step, the links, sign-in, the API");
ok(NEW_DONE === "/get-started/done", "where the steps end");
const signupAct = read("app/signup/actions.ts");
ok(/options: \{ data: \{ full_name: name, \[ONBOARDING_KEY\]: ONBOARDING_PENDING \}, emailRedirectTo: `\$\{appUrl\(\)\}\/welcome` \}/.test(signupAct), "signing up marks the account");
const mw = read("lib/supabase/middleware.ts");
ok(/if \(user && !isPublicRoute && onboardingPending\(claims\?\.user_metadata\) && onboardingApplies\(request\.nextUrl\.pathname\)\) \{\s+const url = request\.nextUrl\.clone\(\);\s+url\.pathname = "\/get-started";/.test(mw), "the middleware sends a marked account to /get-started, whatever page it opens");
ok(mw.indexOf("onboardingPending(claims") > mw.indexOf('url.pathname = "/two-step"'), "after two-step sign-in (the code first, then the steps)");
const doneRoute = read("app/get-started/done/route.ts");
ok(/if \(onboardingPending\(user\.user_metadata\)\) \{\s+const \{ error \} = await supabase\.auth\.updateUser\(\{ data: \{ \[ONBOARDING_KEY\]: ONBOARDING_DONE \} \}\);\s+if \(!error\) await supabase\.auth\.refreshSession\(\);/.test(doneRoute), "done: the mark goes, and the sign-in is renewed so the next page doesn't send it back");
ok(/NextResponse\.redirect\(new URL\("\/dashboard", request\.url\), 303\)/.test(doneRoute) && /if \(!user\) return NextResponse\.redirect\(new URL\("\/login", request\.url\), 303\);/.test(doneRoute), "then the dashboard (signed out: sign in)");
ok(/<a href=\{NEW_DONE\} className=\{primary\}>\s+Go to my dashboard/.test(read("components/onboarding/account-setup.tsx")), "with two-step on already, the way out goes through it too");
const welcomePage = read("app/welcome/page.tsx");
const welcomeCard = read("app/welcome/welcome-card.tsx");
ok(/const code = !tokenHash && \/\^\[A-Za-z0-9-\]\{8,200\}\$\/\.test\(one\("code"\)\) \? one\("code"\) : null;/.test(welcomePage), "Supabase's own email (?code=) is read too");
ok(/const \{ error \} = await supabase\.auth\.exchangeCodeForSession\(code\);/.test(welcomeCard) && /if \(here\.user\) \{\s+setState\("elsewhere"\);/.test(welcomeCard) && /Sign in to carry on/.test(welcomeCard), "this browser signs in with it; another browser (or someone signed in here) is told to sign in");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("onboarding: ok");
