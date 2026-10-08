"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { developers } from "@/lib/errors";
import { appUrl, emailConfigured, sendAlertEmail } from "@/lib/email";
import { actorMeta, sendNotifications } from "@/lib/notify";
import { deviceLabel } from "@/lib/push/send";
import { FEEDBACK_KIND_LABEL, FEEDBACK_MAX_CHARS, FEEDBACK_MAX_FILES, type FeedbackKind } from "@/lib/feedback";

type FileIn = { path: string; name: string; type: string; size: number };

/**
 * Sends a bug report or suggestion (Settings → Account). The files are
 * already in the "feedback" bucket (the browser uploaded them into the
 * sender's own folder); submit_feedback() (0068) checks everything again
 * and saves it. Then the DEVELOPERS (and only they) get a notification and
 * an email, after the answer has gone back, so sending feels instant.
 */
export async function submitFeedback(input: {
  kind: FeedbackKind;
  message: string;
  files: FileIn[];
  teamId: string | null;
  context: { page?: string; ua?: string; viewport?: string; tz?: string; theme?: string };
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again, then send it (your text is still here)." };

  const kind = input.kind === "bug" || input.kind === "idea" ? input.kind : null;
  const message = String(input.message ?? "").trim();
  if (!kind) return { error: "Pick Bug or Suggestion." };
  if (!message) return { error: "Write a few words about it." };
  if (message.length > FEEDBACK_MAX_CHARS) return { error: `Keep it to ${FEEDBACK_MAX_CHARS} characters.` };
  const files = (Array.isArray(input.files) ? input.files : []).slice(0, FEEDBACK_MAX_FILES + 1).map((f) => ({
    path: String(f?.path ?? ""),
    name: String(f?.name ?? "file").slice(0, 120),
    type: String(f?.type ?? "").slice(0, 60),
    size: Number.isFinite(Number(f?.size)) ? Math.max(0, Math.round(Number(f.size))) : 0,
  }));
  if (files.length > FEEDBACK_MAX_FILES) return { error: `Up to ${FEEDBACK_MAX_FILES} photos or videos.` };

  // What helps to reproduce it. The version and copy come from the server, not the browser.
  const c = input.context ?? {};
  const short = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const page = short(c.page, 200);
  const context = {
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    copy: process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "staging" : "local",
    device: deviceLabel(c.ua),
    ua: short(c.ua, 300) ?? null,
    page: page && page.startsWith("/") && !page.startsWith("//") ? page : null,
    viewport: short(c.viewport, 20) ?? null,
    tz: short(c.tz, 60) ?? null,
    theme: short(c.theme, 10) ?? null,
  };

  const { data: id, error } = await supabase.rpc("submit_feedback", {
    p_kind: kind,
    p_message: message,
    p_files: files,
    p_context: context,
    p_team: input.teamId && /^[0-9a-f-]{36}$/i.test(input.teamId) ? input.teamId : null,
  });
  if (error) {
    if (error.code === "PGRST202" || /submit_feedback/.test(error.message)) return { error: "Reports aren't switched on here yet (the database needs migration 0068)." };
    // submit_feedback's own messages say what to fix; anything else is a hiccup.
    if (["22023", "P0001", "42501"].includes(error.code ?? "")) return { error: error.message };
    return { error: "It didn't go through. Check your connection and try again: nothing was lost." };
  }

  const reportId = String(id);
  after(() => tellDevelopers({ userId: user.id, email: user.email ?? null, kind, message, files: files.length, context, teamId: input.teamId }));
  revalidatePath("/settings");
  return { id: reportId };
}

async function tellDevelopers(r: { userId: string; email: string | null; kind: FeedbackKind; message: string; files: number; context: { version: string | null; copy: string; device: string; page: string | null }; teamId: string | null }) {
  try {
    const admin = createAdminClient();
    const [devs, actor, team] = await Promise.all([
      developers(),
      actorMeta(admin, r.userId),
      r.teamId ? admin.from("teams").select("name").eq("id", r.teamId).maybeSingle().then((x) => (x.data?.name as string | undefined) ?? null) : Promise.resolve(null),
    ]);
    const snippet = r.message.replace(/\s+/g, " ").slice(0, 140);
    const what = r.kind === "bug" ? "reported a bug" : "sent a suggestion";
    if (devs.userIds.length) {
      await sendNotifications(
        devs.userIds.map((recipient_id) => ({
          recipient_id,
          kind: "feedback",
          body: `${actor.name} ${what}: "${snippet}"`,
          metadata: { actor, snippet, feedbackKind: r.kind, files: r.files, href: "/developer#reports" },
        }))
      );
    }
    if (emailConfigured() && devs.emails.length) {
      const where = [team && `Team: ${team}`, `Device: ${r.context.device}`, r.context.page && `Page: ${r.context.page}`, r.context.version && `Version ${r.context.version} (${r.context.copy})`]
        .filter(Boolean)
        .join(" · ");
      const prefix = r.context.copy === "staging" ? "[staging] " : "";
      await Promise.all(
        devs.emails.map((to) =>
          sendAlertEmail({
            to: [to],
            subject: `${prefix}${APP_NAME}: ${FEEDBACK_KIND_LABEL[r.kind].toLowerCase()} from ${actor.name}`,
            message: `${r.message}\n\nFrom ${actor.name}${r.email ? ` (${r.email})` : ""}. ${where}.${r.files ? ` ${r.files} attachment${r.files === 1 ? "" : "s"}: open the developer page to see ${r.files === 1 ? "it" : "them"}.` : ""}`,
            linkText: "Open the developer page",
            href: `${appUrl()}/developer#reports`,
            footer: `You get this because you're ${APP_NAME}'s developer (DEVELOPER_EMAILS). Nobody else gets reports.`,
          })
        )
      );
    }
  } catch (e) {
    console.error("[feedback] telling the developers failed:", e instanceof Error ? e.message : e);
  }
}
