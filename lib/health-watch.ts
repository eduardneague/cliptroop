import "server-only";
import { reportError } from "./errors";
import { coreChecks, jobChecks } from "./status";

/**
 * Called by the timed jobs: anything down is reported like an error, so the
 * alert people get an email + notification (at most once an hour per
 * problem). The every-minute timer can't report itself stopping, so the
 * daily job checks the timer; the timer checks everything else.
 */
export async function watchHealth(from: "timer" | "daily") {
  try {
    const [core, jobs] = await Promise.all([coreChecks(), jobChecks()]);
    const problems = [
      ...core.filter((c) => c.level === "down"),
      ...jobs.filter((c) => (from === "daily" && c.key === "timer" && c.level === "down") || (c.key === "analytics" && c.level === "warn" && /Last copy/.test(c.detail) && from === "timer")),
    ];
    for (const p of problems) await reportError({ source: "job", message: `${p.name}: ${p.detail}`, route: "/status" });
    return problems.length;
  } catch {
    return 0;
  }
}
