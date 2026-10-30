"use server";

import { revalidatePath } from "next/cache";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALERT_FOOTER, alertsEmail, developers, isDeveloper } from "@/lib/errors";
import { appUrl, emailConfigured, sendAlertEmail } from "@/lib/email";
import { sendNotifications } from "@/lib/notify";

/* The developer page's buttons. Each one checks the caller is a developer itself. */

async function requireDeveloper() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." } as const;
  if (!(await isDeveloper({ id: user.id, email: user.email ?? null }))) return { error: "Only developer accounts can do this." } as const;
  return { user } as const;
}

/** "Mark fixed": if it happens again, it's alerted again. */
export async function resolveAppError(id: string): Promise<{ error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Not found." };
  const who = await requireDeveloper();
  if ("error" in who) return { error: who.error };
  const { error } = await createAdminClient().from("app_errors").update({ resolved_at: new Date().toISOString() }).eq("id", id).is("resolved_at", null);
  if (error) return { error: "Couldn't save it." };
  revalidatePath("/developer");
  return {};
}

/** "Mark all fixed". */
export async function resolveAllAppErrors(): Promise<{ error?: string }> {
  const who = await requireDeveloper();
  if ("error" in who) return { error: who.error };
  const { error } = await createAdminClient().from("app_errors").update({ resolved_at: new Date().toISOString() }).is("resolved_at", null);
  if (error) return { error: "Couldn't save it." };
  revalidatePath("/developer");
  return {};
}

const lastTest = new Map<string, number>();

/** Sends the developers a test alert (notification + email), so you can see where alerts land. */
export async function sendTestAlert(): Promise<{ error?: string; emails?: number; notified?: number }> {
  const who = await requireDeveloper();
  if ("error" in who) return { error: who.error };
  const t = lastTest.get(who.user.id) ?? 0;
  if (Date.now() - t < 30_000) return { error: "Just sent one: wait half a minute." };
  lastTest.set(who.user.id, Date.now());

  const devs = await developers();
  const message = "This is a test alert from the developer page. Real alerts look like this.";
  if (devs.userIds.length) {
    await sendNotifications(
      devs.userIds.map((recipient_id) => ({
        recipient_id,
        kind: "app_alert",
        body: `Something broke: ${message}`,
        metadata: { snippet: "Test alert", where: "developer page", href: "/developer?tab=problems#errors" },
      }))
    );
  }
  let emails = 0;
  if (emailConfigured()) {
    // One email, to the alerts address only (1.19.0).
    const sent = await sendAlertEmail({
      to: [alertsEmail()],
      subject: `${APP_NAME}: test alert`,
      message,
      linkText: "Open the developer page",
      href: `${appUrl()}/developer?tab=problems#errors`,
      footer: ALERT_FOOTER,
    });
    emails = sent.sent ? 1 : 0;
  }
  return { emails, notified: devs.userIds.length };
}

/** A report (Settings → Account → Report) is dealt with, or back to open. The sender sees Done / Received. */
export async function setReportDone(id: string, done: boolean): Promise<{ error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Not found." };
  const who = await requireDeveloper();
  if ("error" in who) return { error: who.error };
  const { error } = await createAdminClient()
    .from("feedback_reports")
    .update(done ? { status: "done", done_at: new Date().toISOString() } : { status: "new", done_at: null })
    .eq("id", id);
  if (error) return { error: "Couldn't save it." };
  revalidatePath("/developer");
  return {};
}

/** Deletes a report and its photos / videos for good (frees the storage). */
export async function deleteReport(id: string): Promise<{ error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Not found." };
  const who = await requireDeveloper();
  if ("error" in who) return { error: who.error };
  const admin = createAdminClient();
  const { data: row, error: readError } = await admin.from("feedback_reports").select("files").eq("id", id).maybeSingle();
  if (readError) return { error: "Couldn't read it." };
  if (!row) return {};
  const paths = ((row.files as { path?: string }[] | null) ?? []).map((f) => f.path).filter((p): p is string => !!p);
  if (paths.length) {
    const { error: rmError } = await admin.storage.from("feedback").remove(paths);
    if (rmError) return { error: "Couldn't delete its files. Try again." };
  }
  const { error } = await admin.from("feedback_reports").delete().eq("id", id);
  if (error) return { error: "Couldn't delete it." };
  revalidatePath("/developer");
  return {};
}

/**
 * Developer → Features (1.42.0): a feature only some teams get, turned on or off for one. Only the server's key
 * writes team_features (migration 0120), here, after the developer check. The owner: "doar pentru echipe pe care eu le
 * selectez din baza de date ca developer". Turned off, the team's data stays (nobody reads it until it's on again).
 * The team's owner is told when it's turned on (unless that's you).
 */
export async function setTeamFeature(teamId: string, feature: string, on: boolean): Promise<{ error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(teamId) || feature !== "business" || typeof on !== "boolean") return { error: "Not found." };
  const who = await requireDeveloper();
  if ("error" in who) return { error: who.error };
  const admin = createAdminClient();
  const { data: team } = await admin.from("teams").select("id, name, owner_id, logo_url, color").eq("id", teamId).maybeSingle();
  if (!team) return { error: "That team isn't there any more." };
  const { data: was, error: readError } = await admin.from("team_features").select("feature").eq("team_id", teamId).eq("feature", feature).maybeSingle();
  if (readError) return { error: /team_features|schema cache|does not exist/i.test(readError.message) ? "Run migration 0120 first." : "Couldn't read it." };
  if (!!was === on) return {};
  const { error } = on
    ? await admin.from("team_features").insert({ team_id: teamId, feature, enabled_by: who.user.id })
    : await admin.from("team_features").delete().eq("team_id", teamId).eq("feature", feature);
  if (error && error.code !== "23505") return { error: "Couldn't save it." };
  if (on && team.owner_id && team.owner_id !== who.user.id) {
    await sendNotifications({
      recipient_id: team.owner_id as string,
      kind: "business_on",
      body: `Business is on for ${team.name}: keep your PFA's registers in ${APP_NAME}.`,
      metadata: { team: { name: team.name, logoUrl: team.logo_url ?? null, color: team.color ?? "#E8630D" }, href: "/business" },
    });
  }
  revalidatePath("/developer");
  return {};
}

/**
 * Developer → Plans (1.45.0): a team's plan (Studio, Network or none) and its own storage (null: the plan's). Only the
 * server's key writes these columns (migration 0124's guard keeps everyone signed in from it). Setting one answers the
 * team's request: it's cleared, and the team's owner and whoever asked are told (the bell, and an email to the one who
 * asked). Taking it away closes the team's pages again; nothing of it is deleted.
 */
export async function setTeamPlan(teamId: string, plan: string | null, storageGb: number | null): Promise<{ error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) return { error: "Not found." };
  if (plan !== null && plan !== "studio" && plan !== "network") return { error: "Pick Studio, Network or no plan." };
  if (storageGb !== null && (!Number.isInteger(storageGb) || storageGb < 1 || storageGb > 100000)) return { error: "Storage is a whole number of GB, from 1 to 100,000." };
  const who = await requireDeveloper();
  if ("error" in who) return { error: who.error };
  const admin = createAdminClient();
  const { data: team, error: readError } = await admin.from("teams").select("id, name, owner_id, logo_url, color, plan, plan_requested_by").eq("id", teamId).maybeSingle();
  if (readError) return { error: /plan|column|schema cache/i.test(readError.message) ? "Run migration 0124 first." : "Couldn't read it." };
  if (!team) return { error: "That team isn't there any more." };
  const { error } = await admin
    .from("teams")
    .update({
      plan,
      plan_storage_gb: plan ? storageGb : null,
      plan_set_at: plan ? new Date().toISOString() : null,
      plan_requested: null,
      plan_requested_at: null,
      plan_request_note: null,
      plan_requested_by: null,
    })
    .eq("id", teamId);
  if (error) return { error: "Couldn't save it." };

  const was = (team.plan as string | null) ?? null;
  if (plan && plan !== was) {
    const name = plan === "studio" ? "Studio" : "Network";
    const tell = [...new Set([team.owner_id as string | null, team.plan_requested_by as string | null].filter((x): x is string => !!x && x !== who.user.id))];
    if (tell.length) {
      await sendNotifications(
        tell.map((id) => ({
          recipient_id: id,
          kind: "plan_set",
          body: was ? `${team.name} is on ${name} now.` : `${team.name} is on ${name}: your team is open. Welcome to ${APP_NAME}.`,
          metadata: { team: { name: team.name, logoUrl: team.logo_url ?? null, color: team.color ?? "#E8630D" }, href: was ? "/plan" : "/dashboard" },
        })),
      );
    }
    const asker = team.plan_requested_by as string | null;
    if (asker && asker !== who.user.id && emailConfigured()) {
      const { data: p } = await admin.from("profiles").select("email").eq("id", asker).maybeSingle();
      const to = (p?.email as string | null) ?? null;
      if (to) {
        await sendAlertEmail({
          to: [to],
          subject: was ? `${team.name} is on ${name}` : `${team.name} is open`,
          message: was ? `${team.name} is on ${APP_NAME} ${name} now.` : `${team.name} is on ${APP_NAME} ${name}. Everything is open for your team: invite your people and connect your accounts.`,
          linkText: `Open ${APP_NAME}`,
          href: `${appUrl()}${was ? "/plan" : "/dashboard"}`,
          footer: `You asked for a plan for ${team.name} in ${APP_NAME}.`,
        }).catch(() => null);
      }
    }
  }
  revalidatePath("/developer");
  return {};
}
