/*
 * The first steps of a new account (1.49.0). The owner (Nov 3 2026): "where did the onboarding step for new accounts
 * go? i want that too and an option to skip onbaording for now and g odirectly to the app", and two-step sign-in
 * "you should just enable it if you want to on the onboarding".
 *
 *   An invite (/set-password): Password · About you · Two-step · Your phone · All set
 *   Creating an account (/get-started): About you · Two-step · Your phone · Your team · All set
 *
 * The password of an account someone made themselves was chosen on the sign-up form; "Your team" is only for someone
 * with no team yet. Every step after the password has "Skip for now", straight to the dashboard (which asks a person
 * without a team to start one). Pure: the pages and their tests use it.
 */

export type OnboardingMode = "invite" | "new";
export type OnboardingStep = "password" | "profile" | "two-step" | "phone" | "team" | "done";

export const STEP_LABEL: Record<OnboardingStep, string> = {
  password: "Password",
  profile: "About you",
  "two-step": "Two-step",
  phone: "Your phone",
  team: "Your team",
  done: "All set",
};

/** Each mode's own address (where Two-step's set-up page sends you back to). */
export const ONBOARDING_HOME: Record<OnboardingMode, string> = { invite: "/set-password", new: "/get-started" };

/** Where "Skip for now" goes. */
export const SKIP_TO = "/dashboard";

export function stepsFor(mode: OnboardingMode, hasTeam: boolean): OnboardingStep[] {
  if (mode === "invite") return ["password", "profile", "two-step", "phone", "done"];
  return hasTeam ? ["profile", "two-step", "phone", "done"] : ["profile", "two-step", "phone", "team", "done"];
}

/** The step to open on: the one asked for (?step=, coming back from setting up two-step) when it's one of these, never the password. */
export function startStep(steps: OnboardingStep[], asked: string | null | undefined): OnboardingStep {
  const s = steps.find((x) => x === asked);
  return s && s !== "password" ? s : steps[0];
}

/** Whether "Skip for now" shows: not before an invited account has a password, and not on the last step. */
export function canSkip(mode: OnboardingMode, step: OnboardingStep): boolean {
  if (step === "done") return false;
  return mode === "new" || step !== "password";
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

/** Two-step's set-up page, coming back to this mode's next step afterwards (or on "Not now"). */
export function twoStepSetupHref(mode: OnboardingMode, steps: OnboardingStep[]): string {
  return `/two-step/setup?next=${encodeURIComponent(`${ONBOARDING_HOME[mode]}?step=${nextStep(steps, "two-step")}`)}`;
}

/** Where naming your team in the onboarding goes next (createTeam accepts only this, else the dashboard). */
export const TEAM_NEXT = "/get-started?step=done";
