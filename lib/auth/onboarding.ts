/*
 * The first steps of a new account (1.49.0). The owner (Nov 3 2026): "where did the onboarding step for new accounts
 * go? i want that too and an option to skip onbaording for now and g odirectly to the app", and two-step sign-in
 * "you should just enable it if you want to on the onboarding". 1.49.1, the owner: "after creating an account and
 * clicking confirm sign in on the enamil, you should get to the onboadring page with the ability to skip, then you go
 * to the add two step with the ability to skip and then thats it, you go to the app … make it like a 3 stepp thing".
 *
 *   An invite (/set-password): Password · About you · Two-step · Your phone · All set
 *   Creating an account (/get-started): About you · Two-step · then the app (the third mark on the bar)
 *
 * The password of an account someone made themselves was chosen on the sign-up form, and its team is named on the
 * dashboard (Start your first team). Each of a new account's two steps has its own Skip, on to the next; an invited
 * account has "Skip for now" (to the dashboard) once it has a password. Pure: the pages and their tests use it.
 */

export type OnboardingMode = "invite" | "new";
export type OnboardingStep = "password" | "profile" | "two-step" | "phone" | "done";

export const STEP_LABEL: Record<OnboardingStep, string> = {
  password: "Password",
  profile: "About you",
  "two-step": "Two-step",
  phone: "Your phone",
  done: "All set",
};

/** Each mode's own address (where Two-step's set-up page sends an invited account back to). */
export const ONBOARDING_HOME: Record<OnboardingMode, string> = { invite: "/set-password", new: "/get-started" };

/** The app: where skipping, or finishing a new account's steps, goes. */
export const SKIP_TO = "/dashboard";

export function stepsFor(mode: OnboardingMode): OnboardingStep[] {
  return mode === "invite" ? ["password", "profile", "two-step", "phone", "done"] : ["profile", "two-step"];
}

/** The bar's marks: an invite's steps; a new account's two, then the app itself. */
export function progressFor(mode: OnboardingMode): string[] {
  const steps = stepsFor(mode).map((s) => STEP_LABEL[s]);
  return mode === "new" ? [...steps, "Your dashboard"] : steps;
}

/** The step to open on: the one asked for (?step=, coming back from setting up two-step) when it's one of these, never the password. */
export function startStep(steps: OnboardingStep[], asked: string | null | undefined): OnboardingStep {
  const s = steps.find((x) => x === asked);
  return s && s !== "password" ? s : steps[0];
}

/** Whether the top's "Skip for now" shows: only for an invited account with its password, not on the last step. (A new account's steps each have their own Skip.) */
export function canSkip(mode: OnboardingMode, step: OnboardingStep): boolean {
  return mode === "invite" && step !== "password" && step !== "done";
}

/** The step after this one (the last step stays). */
export function nextStep(steps: OnboardingStep[], step: OnboardingStep): OnboardingStep {
  const i = steps.indexOf(step);
  return steps[Math.min(steps.length - 1, i < 0 ? 0 : i + 1)];
}

/** The step before this one (the first step stays; never back to choosing a password). */
export function prevStep(steps: OnboardingStep[], step: OnboardingStep): OnboardingStep {
  const i = steps.indexOf(step);
  const p = steps[Math.max(0, i - 1)];
  return p === "password" ? step : p;
}

/** An invited account's Two-step step: the set-up page, coming back to the next step afterwards (or on "Not now"). */
export function twoStepSetupHref(steps: OnboardingStep[]): string {
  return `/two-step/setup?next=${encodeURIComponent(`${ONBOARDING_HOME.invite}?step=${nextStep(steps, "two-step")}`)}`;
}
