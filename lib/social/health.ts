/**
 * Turns posting_health() into plain sentences: what's working, what
 * isn't, and exactly how to fix it. Safe to use in the browser.
 */
export type Health = {
  has_url: boolean | null;
  has_secret: boolean | null;
  cron_scheduled: boolean | null;
  cron_last: { at: string; status: string; message: string | null } | null;
  calls: { at: string; status: number | null; error: string | null; body: string | null }[] | null;
  runs: { at: string; source: "timer" | "manual"; claimed: number; ms: number; error: string | null }[];
};
export type Finding = { level: "ok" | "warn" | "error"; title: string; detail: string };

const minsAgo = (iso: string) => (Date.now() - Date.parse(iso)) / 60_000;

export function diagnose(h: Health): Finding[] {
  const out: Finding[] = [];

  if (h.has_url === false || h.has_secret === false) {
    out.push({
      level: "error",
      title: "The timer doesn't know where to call",
      detail: `Missing in Supabase Vault: ${[h.has_url === false && "posting_url", h.has_secret === false && "cron_secret"].filter(Boolean).join(" and ")}. Add it in the SQL Editor (see the setup steps).`,
    });
  }

  if (h.cron_scheduled === false) {
    out.push({ level: "error", title: "The timer isn't set up", detail: "Run the 0040 migration again, with pg_cron and pg_net enabled (Database → Extensions)." });
  } else if (h.cron_last) {
    const m = minsAgo(h.cron_last.at);
    if (h.cron_last.status !== "succeeded") {
      out.push({ level: "error", title: "The timer is failing", detail: h.cron_last.message ?? "pg_cron reported an error." });
    } else if (m > 3) {
      out.push({ level: "error", title: "The timer stopped", detail: `It last ran ${Math.round(m)} minutes ago. It should run every minute.` });
    } else {
      out.push({ level: "ok", title: "The timer is running", detail: "It checks for due posts every minute." });
    }
  } else if (h.cron_scheduled) {
    out.push({ level: "warn", title: "The timer hasn't run yet", detail: "It should start within a minute." });
  }

  const call = h.calls?.[0];
  if (call) {
    const s = call.status;
    const body = call.body ?? "";
    if (s && s >= 200 && s < 300) {
      out.push({ level: "ok", title: "The app answers the timer", detail: "The last call worked." });
    } else if (s === 401 && /unauthorized/i.test(body)) {
      out.push({ level: "error", title: "The passwords don't match", detail: "CRON_SECRET in Vercel and cron_secret in Supabase Vault must be exactly the same. Update one, then redeploy." });
    } else if ((s === 401 || s === 403) && /vercel/i.test(body)) {
      out.push({ level: "error", title: "Vercel is blocking the timer", detail: "Turn off Vercel Authentication (Settings → Deployment Protection) for this site." });
    } else if (s === 404) {
      out.push({ level: "error", title: "The timer calls the wrong address", detail: "Check posting_url in Vault, and that this site has the latest code deployed." });
    } else if (!s) {
      out.push({ level: "error", title: "The timer couldn't reach the app", detail: call.error ?? "No answer. Check posting_url in Vault." });
    } else {
      out.push({ level: "error", title: `The app answered with an error (HTTP ${s})`, detail: body.slice(0, 160) || "Check the Vercel logs." });
    }
  }

  const run = h.runs[0];
  if (run?.error) out.push({ level: "error", title: "The last posting run failed", detail: run.error });
  return out;
}
