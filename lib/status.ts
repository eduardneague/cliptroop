import "server-only";
import { createAdminClient } from "./supabase/admin";
import { emailConfigured } from "./email";

/*
 * The status page's checks (/status) and /api/health. Each check has its own
 * time limit, so one slow part can't hold up the rest.
 */

export type Level = "ok" | "warn" | "down" | "unknown";
export type Check = { key: string; name: string; level: Level; detail: string; ms?: number };
export type Vendor = { key: string; name: string; level: Level; detail: string; url: string };

const withTimeout = <T,>(p: PromiseLike<T>, ms: number) =>
  Promise.race([Promise.resolve(p), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms))]);

async function timed<T>(fn: () => PromiseLike<T>, ms = 5000): Promise<{ ok: true; value: T; ms: number } | { ok: false; error: string; ms: number }> {
  const t = Date.now();
  try {
    const value = await withTimeout(fn(), ms);
    return { ok: true, value, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t };
  }
}

const ago = (iso: string | null | undefined) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 2 ? "just now" : m < 120 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** The core: database, sign-in, files. What /api/health answers with. */
export async function coreChecks(): Promise<Check[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const admin = createAdminClient();
  const [db, auth, files] = await Promise.all([
    timed(async () => {
      const { error } = await admin.from("teams").select("id").limit(1);
      if (error) throw new Error(error.message);
    }),
    timed(async () => {
      const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon }, cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
    timed(async () => {
      const { error } = await admin.storage.listBuckets();
      if (error) throw new Error(error.message);
    }),
  ]);
  const level = (r: { ok: boolean; ms: number }): Level => (!r.ok ? "down" : r.ms > 2500 ? "warn" : "ok");
  const detail = (r: { ok: true; ms: number } | { ok: false; error: string; ms: number }, okText: string) => (r.ok ? `${okText} (${r.ms} ms)` : `Not answering: ${r.error}`);
  return [
    { key: "db", name: "Database", level: level(db), detail: detail(db, "Answering"), ms: db.ms },
    { key: "auth", name: "Sign-in", level: level(auth), detail: detail(auth, "Answering"), ms: auth.ms },
    { key: "files", name: "Files (thumbnails, scripts, sketches)", level: level(files), detail: detail(files, "Answering"), ms: files.ms },
  ];
}

/** Everything else the app does on its own: timers, analytics, posting, email, errors. */
export async function jobChecks(): Promise<Check[]> {
  const r = await timed(async () => {
    const { data, error } = await createAdminClient().rpc("status_checks");
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  });
  const s = r.ok ? r.value : null;
  const out: Check[] = [];
  if (!s) {
    out.push({ key: "jobs", name: "Timers and jobs", level: "unknown", detail: "Couldn't read them (the database needs migration 0063)." });
  } else {
    const timer = s.timer_last as { at: string; status: string } | null;
    const timerAge = timer ? (Date.now() - Date.parse(timer.at)) / 60_000 : null;
    out.push({
      key: "timer",
      name: "Automatic posting & reminders (every minute)",
      level: s.timer_scheduled === null ? "unknown" : !s.timer_scheduled ? "down" : timerAge === null || timerAge > 10 ? "down" : timer?.status === "failed" ? "warn" : "ok",
      detail: s.timer_scheduled === null ? "Can't see the timer from here." : !s.timer_scheduled ? "The timer isn't scheduled." : timer ? `Last ran ${ago(timer.at)}${timer.status === "failed" ? " and failed" : ""}.` : "It hasn't run yet.",
    });
    const last = s.analytics_last as string | null;
    const hours = last ? (Date.now() - Date.parse(last)) / 3_600_000 : null;
    out.push({
      key: "analytics",
      name: "Analytics (copied every morning)",
      level: last === null ? "unknown" : (hours ?? 0) > 30 ? "warn" : Number(s.analytics_failing) > 0 ? "warn" : "ok",
      detail: last === null ? "No copy yet." : `Last copy ${ago(last)}${Number(s.analytics_failing) ? ` · ${s.analytics_failing} platform(s) reported a problem` : ""}.`,
    });
    const failed = Number(s.posts_failed_24h ?? 0);
    out.push({
      key: "posting",
      name: "Posts in the last 24 hours",
      level: failed > 0 ? "warn" : "ok",
      detail: `${Number(s.posts_published_24h ?? 0)} published, ${failed} failed.`,
    });
    const reconnect = Number(s.accounts_needing_reconnect ?? 0);
    out.push({
      key: "accounts",
      name: "Connected accounts",
      level: reconnect > 0 ? "warn" : "ok",
      detail: reconnect > 0 ? `${reconnect} need${reconnect === 1 ? "s" : ""} reconnecting (Team → Connected accounts).` : "All signed in.",
    });
    const errors = Number(s.errors_24h ?? 0);
    out.push({
      key: "errors",
      name: "Errors in the last 24 hours",
      level: errors === 0 ? "ok" : errors > 20 ? "down" : "warn",
      detail: errors === 0 ? "None." : `${errors} (${s.error_kinds_24h} kind${s.error_kinds_24h === 1 ? "" : "s"}).`,
    });
  }
  out.push({
    key: "email",
    name: "Email (reminders, alerts)",
    level: emailConfigured() ? "ok" : "warn",
    detail: emailConfigured() ? "Set up." : "Not set up (RESEND_API_KEY / EMAIL_FROM).",
  });
  return out;
}

/** The services VPlanner runs on, from their own status pages. */
export async function vendorChecks(): Promise<Vendor[]> {
  const feeds = [
    { key: "vercel", name: "Vercel (hosting)", api: "https://www.vercel-status.com/api/v2/status.json", url: "https://www.vercel-status.com" },
    { key: "supabase", name: "Supabase (database, sign-in, files)", api: "https://status.supabase.com/api/v2/status.json", url: "https://status.supabase.com" },
    { key: "resend", name: "Resend (email)", api: "https://resend-status.com/api/v2/status.json", url: "https://resend-status.com" },
  ];
  return Promise.all(
    feeds.map(async (f) => {
      const r = await timed(async () => {
        const res = await fetch(f.api, { next: { revalidate: 120 } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { status?: { indicator?: string; description?: string } };
      }, 4000);
      if (!r.ok) return { key: f.key, name: f.name, level: "unknown" as Level, detail: "Their status page didn't answer.", url: f.url };
      const ind = r.value.status?.indicator ?? "unknown";
      const level: Level = ind === "none" ? "ok" : ind === "minor" || ind === "maintenance" ? "warn" : ind === "major" || ind === "critical" ? "down" : "unknown";
      return { key: f.key, name: f.name, level, detail: r.value.status?.description ?? "Unknown", url: f.url };
    })
  );
}

export const worst = (levels: Level[]): Level => (levels.includes("down") ? "down" : levels.includes("warn") ? "warn" : levels.every((l) => l === "unknown") ? "unknown" : "ok");
