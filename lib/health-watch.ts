import "server-only";
import { reportError } from "./errors";
import { createAdminClient } from "./supabase/admin";
import { coreChecks, jobChecks, type Check } from "./status";

/**
 * Anything app-wide that's down is reported like an error, so the
 * developers get an email + notification: once when it starts, then at most
 * once a day while it lasts (0082), and once more when it's over. Called by
 * the status check every 10 minutes (with the checks it just ran) and by the
 * morning analytics job (a second opinion on the timer, in case the
 * database's timers stop altogether).
 *
 * The alert's text stays the same while a problem lasts (`Check.alert`), and
 * the changing details (how long ago…) go with it, so a problem that lasts
 * days is one alert, not a new one each day.
 */
export async function watchHealth(from: "status" | "daily", checks?: { core: Check[]; jobs: Check[] }) {
  try {
    const [core, jobs] = checks ? [checks.core, checks.jobs] : await Promise.all([coreChecks(), jobChecks()]);
    const problems = [
      ...core.filter((c) => c.level === "down"),
      ...jobs.filter((c) => (c.key === "timer" && c.level === "down") || (from === "status" && c.key === "analytics" && c.level === "warn")),
    ];
    const messages = problems.map((p) => `${p.name}: ${p.alert ?? p.detail}`);
    for (const [i, p] of problems.entries()) await reportError({ source: "job", message: messages[i], stack: p.detail, route: "status check" });
    if (from === "status") await resolveGone(messages);
    return problems.length;
  } catch {
    return 0;
  }
}

/** Status problems that are over: marked fixed, and the developers hear it once. */
async function resolveGone(current: string[]) {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("app_errors").select("id, message, alerted_at").eq("source", "job").eq("route", "status check").is("resolved_at", null).lt("last_seen", new Date(Date.now() - 15 * 60_000).toISOString()).limit(20);
    const gone = ((data ?? []) as { id: string; message: string; alerted_at: string | null }[]).filter((r) => !current.includes(r.message));
    if (!gone.length) return;
    await admin.from("app_errors").update({ resolved_at: new Date().toISOString() }).in("id", gone.map((r) => r.id));
    const { reportFixed } = await import("./errors");
    for (const r of gone) if (r.alerted_at) await reportFixed(r.message);
  } catch {}
}
