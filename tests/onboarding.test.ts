// 1.49.0: a new account's first steps. The owner (Nov 3 2026): "where did the onboarding step for new accounts go? i
// want that too and an option to skip onbaording for now and g odirectly to the app", with two-step sign-in offered
// there ("you should just enable it if you want to on the onboarding").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ONBOARDING_HOME, SKIP_TO, TEAM_NEXT, canSkip, nextStep, prevStep, startStep, stepsFor, twoStepSetupHref } from "../lib/auth/onboarding";
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

// --- The steps ---------------------------------------------------------------------------------------------------------
const invite = stepsFor("invite", false);
const fresh = stepsFor("new", false);
ok(JSON.stringify(invite) === JSON.stringify(["password", "profile", "two-step", "phone", "done"]), "an invite: password, about you, two-step, phone, all set");
ok(JSON.stringify(fresh) === JSON.stringify(["profile", "two-step", "phone", "team", "done"]), "a new account: about you, two-step, phone, its team, all set (its password came with the form)");
ok(!stepsFor("new", true).includes("team"), "already on a team: no team step");
ok(startStep(fresh, null) === "profile" && startStep(invite, null) === "password", "each starts at its first step");
ok(startStep(fresh, "phone") === "phone" && startStep(fresh, "done") === "done", "back from setting up two-step (or naming the team): that step");
ok(startStep(invite, "password") === "password" && startStep(fresh, "password") === "profile" && startStep(fresh, "nope") === "profile", "never a step it doesn't have");
ok(nextStep(fresh, "two-step") === "phone" && nextStep(fresh, "phone") === "team" && nextStep(fresh, "done") === "done", "on to the next");
ok(prevStep(invite, "profile") === "profile" && prevStep(invite, "two-step") === "profile" && prevStep(fresh, "profile") === "profile", "back, but never to choosing a password again");

// --- Skip for now ------------------------------------------------------------------------------------------------------
ok(SKIP_TO === "/dashboard", "Skip for now goes straight to the app");
ok(fresh.filter((s) => s !== "done").every((s) => canSkip("new", s)), "a new account can skip from every step");
ok(!canSkip("invite", "password") && canSkip("invite", "profile") && !canSkip("new", "done"), "an invited account chooses its password first (or it couldn't sign in again)");

// --- Two-step: optional, offered here ----------------------------------------------------------------------------------
const href = twoStepSetupHref("new", fresh);
ok(href === `/two-step/setup?next=${encodeURIComponent("/get-started?step=phone")}`, "Set it up comes back to the next step");
ok(safeNext(decodeURIComponent(href.split("next=")[1])) === "/get-started?step=phone" && safeNext("/set-password?step=phone") === "/set-password?step=phone", "and two-step's own check lets it");
ok(ONBOARDING_HOME.invite === "/set-password" && ONBOARDING_HOME.new === "/get-started", "each mode's address");

// --- The pages ---------------------------------------------------------------------------------------------------------
const comp = read("components/onboarding/account-setup.tsx");
ok(/Skip for now/.test(comp) && /href=\{SKIP_TO\}/.test(comp) && /<Shell skip=\{canSkip\(mode, step\)\}>/.test(comp), "every step shows Skip for now where it may");
ok(/step === "two-step"/.test(comp) && /Not now/.test(comp) && /href=\{twoStepSetupHref\(mode, steps\)\}/.test(comp) && /Two-step sign-in is on/.test(comp), "the two-step step: Set it up or Not now (and says when it's on)");
ok(/step === "team"/.test(comp) && /useActionState\(createTeam, undefined\)/.test(comp) && /<input type="hidden" name="next" value=\{TEAM_NEXT\} \/>/.test(comp), "the team step names the team, then the last step");
const getStarted = read("app/get-started/page.tsx");
ok(/mode="new"/.test(getStarted) && /key=\{`\$\{asked \?\? ""\}:\$\{facts\.hasTeam \? 1 : 0\}`\}/.test(getStarted), "/get-started: a new account's steps, started over when the address changes");
ok(/mode="invite"/.test(read("app/set-password/page.tsx")), "/set-password: an invite's");
ok(!isPublicPath("/get-started") && isBrandPage("/get-started"), "/get-started: signed in only, in the app's own colours");

// --- How a new account gets there --------------------------------------------------------------------------------------
ok(/redirect\("\/get-started"\)/.test(read("app/signup/actions.ts")), "signed in straight from the form: its first steps");
const team = read("app/(dashboard)/teams/new/actions.ts");
ok(TEAM_NEXT === "/get-started?step=done" && /formData\.get\("next"\) === TEAM_NEXT \? TEAM_NEXT : "\/dashboard"/.test(team) && /redirect\(next\)/.test(team), "naming a team goes on to the onboarding's last step only when it asks, else the dashboard");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("onboarding: ok");
