import { redirect } from "next/navigation";
import { AccountSetup } from "@/components/onboarding/account-setup";
import { onboardingFacts } from "@/lib/auth/onboarding-facts";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * A new account's first steps (1.49.0): after "Confirm your email" (the welcome card) or straight after signing up
 * when Supabase doesn't ask for the email to be confirmed. About you · Two-step · Your phone · Your team · All set,
 * with "Skip for now" on each (components/onboarding/account-setup.tsx, lib/auth/onboarding.ts). ?step= comes back
 * from setting up two-step sign-in, and from naming the team (?step=done). The key starts the steps over when the
 * address changes.
 */
export default async function GetStartedPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/get-started");
  const facts = await onboardingFacts();
  const asked = typeof sp.step === "string" ? sp.step : null;
  return <AccountSetup key={`${asked ?? ""}:${facts.hasTeam ? 1 : 0}`} mode="new" asked={asked} twoStep={facts.twoStep} hasTeam={facts.hasTeam} />;
}
