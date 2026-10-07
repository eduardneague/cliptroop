import "server-only";
import { reportError } from "./errors";
import { coreChecks, jobChecks, type Check } from "./status";

/**
 * Anything app-wide that's down is reported like an error, so the
 * developers get an email + notification (at most once an hour per
 * problem). Called by the status check every 10 minutes (with the checks it
 * just ran) and by the daily analytics job (a second opinion on the timer,
 * in case the database's timers stop altogether).
 */
export async function watchHealth(from: "status" | "daily", checks?: { core: Check[]; jobs: Check[] }) {
  try {
    const [core, jobs] = checks ? [checks.core, checks.jobs] : await Promise.all([coreChecks(), jobChecks()]);
    const problems = [
      ...core.filter((c) => c.level === "down"),
      ...jobs.filter((c) => (c.key === "timer" && c.level === "down") || (from === "status" && c.key === "analytics" && c.level === "warn")),
    ];
    for (const p of problems) await reportError({ source: "job", message: `${p.name}: ${p.detail}`, route: "status check" });
    return problems.length;
  } catch {
    return 0;
  }
}
