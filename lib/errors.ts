import { APP_NAME } from "@/lib/brand";
import "server-only";
import { fingerprint } from "./error-kinds";
import { createAdminClient } from "./supabase/admin";
import { appUrl, emailConfigured, sendAlertEmail } from "./email";
import { sendNotifications } from "./notify";

/*
 * Error alerts (no outside service needed). Every error the app hits — on
 * the server (instrumentation.ts), in someone's browser (/api/errors) or in a
 * timed job — is counted in app_errors (migration 0063), one row per kind of
 * error. The first time, when it comes back after being marked fixed, and at
 * most once an hour while it keeps happening, the alert people get an email
 * and a notification. Details: /status (signed in as one of them).
 *
 * Alert people: ALERT_EMAILS (comma-separated) or, if that's not set, the
 * owners of the teams. Alerts are sent from production (and from staging
 * too with ALERT_ON_PREVIEW=1); everything is still recorded everywhere.
 */

export type ErrorSource = "server" | "browser" | "job";

export { isControlFlow } from "./error-kinds";

export async function alertRecipients(): Promise<{ emails: string[]; userIds: string[] }> {
  const admin = createAdminClient();
  const fromEnv = (process.env.ALERT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+$/.test(e));
  if (fromEnv.length) {
    const { data } = await admin.from("profiles").select("id, email").in("email", fromEnv);
    return { emails: fromEnv.slice(0, 10), userIds: (data ?? []).map((p) => p.id as string) };
  }
  const { data: teams } = await admin.from("teams").select("owner_id").limit(50);
  const ids = [...new Set((teams ?? []).map((t) => t.owner_id as string).filter(Boolean))].slice(0, 5);
  if (!ids.length) return { emails: [], userIds: [] };
  const { data: owners } = await admin.from("profiles").select("id, email").in("id", ids);
  return { emails: (owners ?? []).map((p) => p.email as string | null).filter((e): e is string => !!e), userIds: ids };
}

/** Is this signed-in person one of the alert people (sees error details on /status)? */
export async function isAlertPerson(userId: string | null | undefined) {
  if (!userId) return false;
  try {
    return (await alertRecipients()).userIds.includes(userId);
  } catch {
    return false;
  }
}

const shouldAlert = () => process.env.VERCEL_ENV === "production" || (process.env.VERCEL_ENV === "preview" && process.env.ALERT_ON_PREVIEW === "1");

/** Count an error and alert when it's time. Never throws (it's called while something else is already failing). */
export async function reportError(input: { source: ErrorSource; message: string; stack?: string | null; route?: string | null; digest?: string | null; userId?: string | null }) {
  try {
    const message = String(input.message || "Unknown error").replace(/\s+/g, " ").trim().slice(0, 500);
    const route = String(input.route ?? "").slice(0, 300);
    const { data, error } = await createAdminClient().rpc("record_app_error", {
      p_fingerprint: fingerprint(input.source, message, route),
      p_source: input.source,
      p_message: message,
      p_route: route || null,
      p_digest: input.digest ? String(input.digest).slice(0, 100) : null,
      p_stack: input.stack ? String(input.stack).slice(0, 4000) : null,
      p_user: input.userId ?? null,
    });
    // Before migration 0063 there's nowhere to count it: the server log has it anyway.
    if (error || !data) return;
    const r = data as { count: number; alert: boolean };
    if (!r.alert || !shouldAlert()) return;
    const who = await alertRecipients();
    const where = route || (input.source === "browser" ? "in a browser" : input.source === "job" ? "a timed job" : "the server");
    if (who.userIds.length) {
      await sendNotifications(
        who.userIds.map((recipient_id) => ({
          recipient_id,
          kind: "app_alert",
          body: `Something broke: ${message.slice(0, 140)} (${where})`,
          metadata: { snippet: message.slice(0, 140), where, href: "/status" },
        }))
      );
    }
    if (emailConfigured() && who.emails.length) {
      await Promise.all(
        who.emails.map((email) =>
          sendAlertEmail({
            to: [email],
            subject: r.count > 1 ? `${APP_NAME}: still happening (${r.count}×): ${message.slice(0, 80)}` : `${APP_NAME} error: ${message.slice(0, 90)}`,
            message: `${message}\n\nWhere: ${where}. ${r.count > 1 ? `It has happened ${r.count} times.` : "First time."} You get at most one email an hour about it.`,
            linkText: "Open the status page",
            href: `${appUrl()}/status`,
            footer: `You get this because you receive ${APP_NAME}'s alerts (ALERT_EMAILS, or a team owner).`,
          })
        )
      );
    }
  } catch (e) {
    console.error("[reportError]", e instanceof Error ? e.message : e);
  }
}
