import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotifications } from "@/lib/notify";
import { appUrl, emailConfigured, sendAlertEmail } from "@/lib/email";

type Tier = "3d" | "1d" | "1h";
const HOUR = 3_600_000;
const WINDOW: Record<Tier, number> = { "1h": HOUR, "1d": 24 * HOUR, "3d": 72 * HOUR };
const COLUMN: Record<Tier, "reminded_1h_at" | "reminded_1d_at" | "reminded_3d_at"> = { "1h": "reminded_1h_at", "1d": "reminded_1d_at", "3d": "reminded_3d_at" };
const WHEN: Record<Tier, string> = { "1h": "in 1 hour", "1d": "tomorrow", "3d": "in 3 days" };

/** "Saturday, 10 Oct, 18:00" in the team's time zone. */
export function teamTime(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return new Date(iso).toUTCString();
  }
}

/**
 * Meeting reminders 3 days, 1 day and 1 hour before (in the app + email to
 * everyone invited who hasn't said they can't come). Called by the
 * every-minute timer. Each reminder is claimed in the database first, so a
 * second run at the same time can't send it twice. Never throws.
 */
export async function runMeetingReminders(): Promise<{ sent: number }> {
  let sent = 0;
  try {
    const admin = createAdminClient();
    const now = Date.now();
    const { data: due, error } = await admin
      .from("meetings")
      .select("id, team_id, title, starts_at, location, link, reminded_3d_at, reminded_1d_at, reminded_1h_at, teams(name, logo_url, color, timezone)")
      .eq("status", "scheduled")
      .gt("starts_at", new Date(now).toISOString())
      .lte("starts_at", new Date(now + WINDOW["3d"]).toISOString())
      .limit(50);
    if (error || !due) return { sent };

    for (const m of due) {
      const left = Date.parse(m.starts_at as string) - now;
      const tier: Tier = left <= WINDOW["1h"] ? "1h" : left <= WINDOW["1d"] ? "1d" : "3d";
      if (m[COLUMN[tier]]) continue;
      // Claim it (only one run wins), and skip the earlier ones too.
      const stamp = new Date().toISOString();
      const { data: claimed } = await admin.from("meetings").update({ [COLUMN[tier]]: stamp }).eq("id", m.id).is(COLUMN[tier], null).select("id");
      if (!claimed?.length) continue;
      for (const t of ["3d", "1d"] as Tier[]) if (WINDOW[t] > WINDOW[tier]) await admin.from("meetings").update({ [COLUMN[t]]: stamp }).eq("id", m.id).is(COLUMN[t], null);

      const team = (Array.isArray(m.teams) ? m.teams[0] : m.teams) as { name: string; logo_url: string | null; color: string | null; timezone: string | null } | null;
      const tz = team?.timezone || "Europe/Bucharest";
      const { data: people } = await admin
        .from("meeting_attendees")
        .select("user_id, rsvp, profiles(username, full_name, email)")
        .eq("meeting_id", m.id)
        .neq("rsvp", "no");
      const list = people ?? [];
      if (!list.length) continue;
      const when = teamTime(m.starts_at as string, tz);
      const where = (m.location as string) || "Discord";
      const href = `/meetings/${m.id}`;
      await sendNotifications(
        list.map((p) => ({
          recipient_id: p.user_id as string,
          kind: "meeting_reminder",
          body: `Meeting ${WHEN[tier]}: ${m.title} (${when}, ${where})`,
          metadata: {
            meetingTitle: m.title,
            startsAt: m.starts_at,
            when: WHEN[tier],
            location: where,
            link: m.link ?? null,
            href,
            team: { name: team?.name ?? "Your team", logoUrl: team?.logo_url ?? null, color: team?.color ?? "#E8630D" },
          },
        }))
      );
      sent += list.length;
      if (emailConfigured()) {
        const to = list
          .map((p) => (Array.isArray(p.profiles) ? p.profiles[0] : p.profiles) as { email: string | null } | null)
          .map((p) => p?.email)
          .filter((e): e is string => !!e);
        // One email each (nobody sees the others' addresses).
        await Promise.all(
          to.map((email) =>
            sendAlertEmail({
              to: [email],
              subject: `Meeting ${WHEN[tier]}: ${m.title}`,
              message: `${when} (${tz.replace(/_/g, " ")}), ${where}${m.link ? `: ${m.link}` : ""}.`,
              linkText: "Open the meeting",
              href: `${appUrl()}${href}`,
              footer: `You get this because you're invited to this ${team?.name ?? "team"} meeting.`,
            })
          )
        );
      }
    }
  } catch (e) {
    console.error("[meeting reminders]", e instanceof Error ? e.message : e);
  }
  return { sent };
}
