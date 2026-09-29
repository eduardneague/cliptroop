"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * "Test the timer": Supabase calls this site right now, exactly like the
 * every-minute timer does. The answer shows up in Health a few seconds later.
 */
export async function testTimer(teamId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("posting_ping", { p_team: teamId });
  if (error) return { error: error.code === "42501" ? "Only the master or a scheduler can test the timer." : "Couldn't start the test." };
  if (!data) return { error: "The timer doesn't know where to call yet: add posting_url and cron_secret to Supabase Vault." };
  // pg_net sends the call in the background; give it a moment to answer.
  await new Promise((r) => setTimeout(r, 4000));
  revalidatePath("/posting");
  return {};
}

/**
 * Staging only: send a test alert email to every master and scheduler of
 * the team (the same people who get real failure alerts).
 */
export async function sendTestAlertEmail(teamId: string): Promise<{ error?: string; sentTo?: number }> {
  const { APP_CHANNEL } = await import("@/lib/version");
  if (APP_CHANNEL !== "E") return { error: "Test emails only work on the staging site." };

  const { emailConfigured, sendAlertEmail, appUrl } = await import("@/lib/email");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { getMembership } = await import("@/lib/permissions/membership");
  const { isMaster } = await import("@/lib/permissions/roles");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const roles = (await getMembership(supabase, teamId))?.roles ?? [];
  if (!isMaster(roles) && !roles.includes("publisher")) return { error: "Only the master or a scheduler can send a test." };
  if (!emailConfigured()) return { error: "Email isn't set up: add RESEND_API_KEY and EMAIL_FROM, then redeploy." };

  const admin = createAdminClient();
  const { data: people } = await admin
    .from("team_members")
    .select("user_id, member_roles!inner(role)")
    .eq("team_id", teamId)
    .eq("status", "active")
    .in("member_roles.role", ["master", "publisher"]);
  const ids = [...new Set((people ?? []).map((p) => p.user_id as string | null).filter((x): x is string => !!x))];
  const { data: profiles } = ids.length ? await admin.from("profiles").select("email").in("id", ids) : { data: [] };
  const to = (profiles ?? []).map((p) => p.email as string | null).filter((e): e is string => !!e);
  if (!to.length) return { error: "No masters or schedulers with an email address." };

  const r = await sendAlertEmail({
    to,
    subject: "Test alert: this is what a failed post looks like",
    message: "This is a test from the staging site. When a post fails for real, you'll get an email like this with the reason and a link straight to the short.",
    linkText: "Open the Posting page",
    href: `${appUrl()}/posting`,
  });
  if (!r.sent) return { error: "Resend didn't accept the email. Check RESEND_API_KEY, and that EMAIL_FROM uses your verified domain." };
  return { sentTo: to.length };
}
