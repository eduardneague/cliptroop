import { createClient } from "@/lib/supabase/server";
import { maskEmail } from "@/lib/auth/two-step";

/**
 * What the onboarding pages (1.49.0) need to know about the person on the server: whether two-step sign-in is on (and
 * how), and their email half hidden (for setting up email codes in the steps, 1.49.1).
 */
export async function onboardingFacts(): Promise<{ twoStep: "app" | "email" | null; maskedEmail: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { twoStep: null, maskedEmail: "" };
  const app = (user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
  const email = (user.app_metadata as { two_step?: unknown } | null)?.two_step === "email";
  return { twoStep: app ? "app" : email ? "email" : null, maskedEmail: maskEmail(user.email ?? "") };
}
