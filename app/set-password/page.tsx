import { AccountSetup } from "@/components/onboarding/account-setup";
import { onboardingFacts } from "@/lib/auth/onboarding-facts";

export const dynamic = "force-dynamic";

/**
 * First visit after an invite (1.9.1): the account's first steps (components/onboarding/account-setup.tsx). ?step=
 * comes back from setting up two-step sign-in (1.49.0). The key starts the steps over when the address changes.
 */
export default async function SetUpAccountPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const sp = await searchParams;
  const facts = await onboardingFacts();
  const asked = typeof sp.step === "string" ? sp.step : null;
  return <AccountSetup key={asked ?? ""} mode="invite" asked={asked} twoStep={facts.twoStep} maskedEmail={facts.maskedEmail} />;
}
