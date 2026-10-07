"use server";

import { revalidatePath } from "next/cache";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { developers, isDeveloper } from "@/lib/errors";
import { appUrl, emailConfigured, sendAlertEmail } from "@/lib/email";
import { sendNotifications } from "@/lib/notify";

/* The developer page's buttons. Each one checks the caller is a developer itself. */

async function requireDeveloper() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." } as const;
  if (!(await isDeveloper(user.id))) return { error: "Only developer accounts can do this." } as const;
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
        metadata: { snippet: "Test alert", where: "developer page", href: "/developer" },
      }))
    );
  }
  let emails = 0;
  if (emailConfigured() && devs.emails.length) {
    const sent = await Promise.all(
      devs.emails.map((email) =>
        sendAlertEmail({
          to: [email],
          subject: `${APP_NAME}: test alert`,
          message,
          linkText: "Open the developer page",
          href: `${appUrl()}/developer`,
          footer: `You get this because you're ${APP_NAME}'s developer (DEVELOPER_EMAILS). Nobody else gets it.`,
        })
      )
    );
    emails = sent.filter((r) => r.sent).length;
  }
  return { emails, notified: devs.userIds.length };
}
