import { createClient } from "@/lib/supabase/server";

/**
 * What the onboarding pages (1.49.0) need to know about the person on the server: whether two-step sign-in is on (and
 * how), and whether they're on a team yet (an account someone made themselves names its own).
 */
export async function onboardingFacts(): Promise<{ twoStep: "app" | "email" | null; hasTeam: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { twoStep: null, hasTeam: false };
  const app = (user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
  const email = (user.app_metadata as { two_step?: unknown } | null)?.two_step === "email";
  const { count } = await supabase.from("team_members").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active");
  return { twoStep: app ? "app" : email ? "email" : null, hasTeam: (count ?? 0) > 0 };
}
