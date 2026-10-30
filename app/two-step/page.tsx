import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TWO_STEP_COOKIE, emailDoneFor, maskEmail, safeNext, sessionIdOf } from "@/lib/auth/two-step";
import { TwoStepVerify } from "@/components/auth/two-step-forms";

/**
 * This sign-in's code (1.46.0): the authenticator app's, or one sent by email. Already typed: on to the page you were
 * going to. No way set up yet: the setup page.
 */
export default async function TwoStepPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: aal }, { data: sess }] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.getSession()]);
  const done = aal?.currentLevel === "aal2" || (await emailDoneFor((await cookies()).get(TWO_STEP_COOKIE)?.value, sessionIdOf(sess.session?.access_token)));
  if (done) redirect(next);
  const factor = (user.factors ?? []).find((f) => f.factor_type === "totp" && f.status === "verified") ?? null;
  const email = (user.app_metadata as { two_step?: unknown } | null)?.two_step === "email";
  if (!factor && !email) redirect(`/two-step/setup?next=${encodeURIComponent(next)}`);
  return <TwoStepVerify method={factor ? "app" : "email"} factorId={factor?.id ?? null} email={maskEmail(user.email ?? "")} next={next} />;
}
