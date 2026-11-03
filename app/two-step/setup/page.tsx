import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TWO_STEP_COOKIE, emailDoneFor, maskEmail, safeNext, sessionIdOf } from "@/lib/auth/two-step";
import { TwoStepSetup } from "@/components/auth/two-step-forms";

/**
 * Setting up two-step sign-in (1.46.0). 1.49.0: it's optional, so this page is opened, never sent to: from the
 * onboarding's Two-step step (with ?next back to it) and from Settings → Account (?change=1: turn it on, or change the
 * way, which takes this sign-in's code first). With nothing set up yet, "Not now" goes back where it came from.
 */
export default async function TwoStepSetupPage({ searchParams }: { searchParams: Promise<{ next?: string; change?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const change = sp.change === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const app = (user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
  const email = (user.app_metadata as { two_step?: unknown } | null)?.two_step === "email";
  if (app || email) {
    const [{ data: aal }, { data: sess }] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.getSession()]);
    const done = aal?.currentLevel === "aal2" || (await emailDoneFor((await cookies()).get(TWO_STEP_COOKIE)?.value, sessionIdOf(sess.session?.access_token)));
    // Changing it takes this sign-in's code first; without ?change there's nothing to set up.
    if (!done) redirect(`/two-step?next=${encodeURIComponent(change ? "/two-step/setup?change=1" : next)}`);
    if (!change) redirect(next);
  }
  const back = change ? "/settings?tab=account" : next;
  return <TwoStepSetup email={maskEmail(user.email ?? "")} current={app ? "app" : email ? "email" : null} change={change && (app || email)} next={back} skip={app || email ? null : back} />;
}
