import { redirect } from "next/navigation";
import { AccountSetup } from "@/components/onboarding/account-setup";
import { onboardingFacts } from "@/lib/auth/onboarding-facts";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * A new account's first steps (1.49.0; 1.49.1: "make it like a 3 stepp thing"): About you, then two-step sign-in set
 * up right there, each with Skip, then the app (components/onboarding/account-setup.tsx, lib/auth/onboarding.ts). The
 * confirm-your-email link lands here by itself (the welcome card confirms it as it opens). The key starts the steps
 * over when the address changes.
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
  return <AccountSetup key={asked ?? ""} mode="new" asked={asked} twoStep={facts.twoStep} maskedEmail={facts.maskedEmail} />;
}
