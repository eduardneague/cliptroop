"use server";

import { revalidatePath } from "next/cache";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALERT_FOOTER, alertsEmail, developers } from "@/lib/errors";
import { appUrl, emailConfigured, sendAlertEmail } from "@/lib/email";
import { sendNotifications } from "@/lib/notify";
import { displayName } from "@/lib/avatar";
import { PLAN_FACTS, isPlanId } from "@/lib/plans";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Asking again within this long changes the request without telling ClipTroop twice. */
const QUIET_MS = 10 * 60_000;

/**
 * A team's master asks for a plan (1.45.0): kept on the team (request_team_plan(), migration 0124: masters only), then
 * ClipTroop is told (the developer accounts' bell, and the alerts address by email) and sets it in Developer → Plans.
 * Nothing is charged here: there's no card form.
 */
export async function requestPlan(teamId: string, plan: string, note: string): Promise<{ error?: string; at?: string }> {
  if (!UUID.test(teamId) || !isPlanId(plan)) return { error: "Pick Studio or Network." };
  const text = typeof note === "string" ? note.replace(/\s+/g, " ").trim().slice(0, 1000) : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data: before } = await supabase.from("teams").select("name, logo_url, color, plan_requested, plan_requested_at").eq("id", teamId).maybeSingle();
  const { error } = await supabase.rpc("request_team_plan", { p_team: teamId, p_plan: plan, p_note: text || null });
  if (error) {
    if (error.code === "42501") return { error: "Only the team's masters can choose its plan." };
    if (/request_team_plan|schema cache|does not exist/i.test(error.message)) return { error: `${APP_NAME} is being updated. Try again in a few minutes.` };
    return { error: "Couldn't send it. Check your connection and try again." };
  }

  const b = (before ?? {}) as { name?: string; logo_url?: string | null; color?: string | null; plan_requested?: string | null; plan_requested_at?: string | null };
  const recent = b.plan_requested === plan && !!b.plan_requested_at && Date.now() - Date.parse(b.plan_requested_at) < QUIET_MS;
  if (!recent) {
    try {
      const admin = createAdminClient();
      const [{ data: me }, devs] = await Promise.all([admin.from("profiles").select("username, full_name, email").eq("id", user.id).maybeSingle(), developers()]);
      const who = displayName(me?.username ?? null, me?.full_name ?? null, me?.email ?? user.email ?? null);
      const email = (me?.email as string | null) ?? user.email ?? "";
      const team = b.name ?? "A team";
      const name = PLAN_FACTS[plan].name;
      await sendNotifications(
        devs.userIds
          .filter((id) => id !== user.id)
          .map((id) => ({
            recipient_id: id,
            kind: "plan_request",
            body: `${who} asked for ${name} for ${team}${text ? `: “${text.slice(0, 140)}${text.length > 140 ? "…" : ""}”` : "."}`,
            metadata: { team: { name: team, logoUrl: b.logo_url ?? null, color: b.color ?? "#E8630D" }, href: "/developer?tab=plans" },
          })),
      );
      if (emailConfigured()) {
        await sendAlertEmail({
          to: [alertsEmail()],
          subject: `${team} asked for ${name}`,
          message: `${who}${email ? ` (${email})` : ""} asked for ${name} for ${team}.${text ? ` They wrote: “${text}”` : ""} Set the team’s plan in Developer → Plans once it’s agreed.`,
          linkText: "Open Developer → Plans",
          href: `${appUrl()}/developer?tab=plans`,
          footer: ALERT_FOOTER,
        });
      }
    } catch (e) {
      // The request is kept either way: Developer → Plans lists it.
      console.error("[requestPlan] telling ClipTroop", e instanceof Error ? e.message : e);
    }
  }
  revalidatePath("/", "layout");
  return { at: new Date().toISOString() };
}
