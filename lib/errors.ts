import { APP_NAME } from "@/lib/brand";
import "server-only";
import { cache } from "react";
import { fingerprint } from "./error-kinds";
import { createAdminClient } from "./supabase/admin";
import { appUrl, emailConfigured, sendAlertEmail } from "./email";
import { sendNotifications } from "./notify";

/*
 * Error alerts (no outside service needed). Every error the app hits — on
 * the server (instrumentation.ts), in someone's browser (/api/errors) or in a
 * timed job (the status check, lib/health-watch.ts) — is counted in
 * app_errors (migration 0063), one row per kind of error. The first time,
 * when it comes back after being marked fixed, and at most once an hour
 * while it keeps happening, the DEVELOPERS get an email and a notification.
 * Details: /developer (developer accounts only).
 *
 * Developers: DEVELOPER_EMAILS (comma-separated; ALERT_EMAILS, its old
 * name, still works) or, if neither is set, the owner of the first team ever
 * made. Team owners don't get these: one team's problems (a failed post, an
 * account to reconnect) show on that team's Posting page instead.
 * Alerts are sent from production (and from staging too with
 * ALERT_ON_PREVIEW=1); everything is still recorded everywhere.
 */

export type ErrorSource = "server" | "browser" | "job";

export { isControlFlow } from "./error-kinds";

const emailList = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+$/.test(e));

export type Developers = { emails: string[]; userIds: string[]; source: "DEVELOPER_EMAILS" | "ALERT_EMAILS" | "first team owner" | "none" };

/** The developer accounts (once per request). */
export const developers = cache(async (): Promise<Developers> => {
  const admin = createAdminClient();
  const named = emailList(process.env.DEVELOPER_EMAILS);
  const legacy = named.length ? [] : emailList(process.env.ALERT_EMAILS);
  const fromEnv = [...new Set([...named, ...legacy])].slice(0, 10);
  if (fromEnv.length) {
    const { data } = await admin.from("profiles").select("id, email").in("email", fromEnv);
    return { emails: fromEnv, userIds: (data ?? []).map((p) => p.id as string), source: named.length ? "DEVELOPER_EMAILS" : "ALERT_EMAILS" };
  }
  const { data: team } = await admin.from("teams").select("owner_id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  const id = (team?.owner_id as string | undefined) ?? null;
  if (!id) return { emails: [], userIds: [], source: "none" };
  const { data: owner } = await admin.from("profiles").select("id, email").eq("id", id).maybeSingle();
  return { emails: owner?.email ? [owner.email as string] : [], userIds: [id], source: "first team owner" };
});

/** Who gets the app-wide alerts: the developers, nobody else. */
export const alertRecipients = developers;

/** Is this signed-in person a developer (opens /developer and /setup, gets the alerts)? */
export async function isDeveloper(userId: string | null | undefined) {
  if (!userId) return false;
  try {
    return (await developers()).userIds.includes(userId);
  } catch {
    return false;
  }
}

/** @deprecated The old name (before 1.9.8): use isDeveloper. Kept so an older copy of a file still builds. */
export const isAlertPerson = isDeveloper;

export const shouldAlert = () => process.env.VERCEL_ENV === "production" || (process.env.VERCEL_ENV === "preview" && process.env.ALERT_ON_PREVIEW === "1");

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
          metadata: { snippet: message.slice(0, 140), where, href: "/developer" },
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
            linkText: "Open the developer page",
            href: `${appUrl()}/developer`,
            footer: `You get this because you're ${APP_NAME}'s developer (DEVELOPER_EMAILS). Nobody else gets it.`,
          })
        )
      );
    }
  } catch (e) {
    console.error("[reportError]", e instanceof Error ? e.message : e);
  }
}
