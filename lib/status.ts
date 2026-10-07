import "server-only";
import { createAdminClient } from "./supabase/admin";
import { emailConfigured } from "./email";
import type { BarView } from "./status-levels";

/*
 * The checks behind /status (public: levels only), /developer (everything,
 * developers only) and /api/health. Each check has its own time limit, so
 * one slow part can't hold up the rest.
 *
 * App-wide parts (`publicPart: true`) are what everyone sees on /status and
 * what the 10-minute status check records for the hourly bars (0067). The
 * rest (failed posts, accounts to reconnect, errors) is one team's business
 * (their Posting page) or the developer's (/developer).
 */

export type Level = "ok" | "warn" | "down" | "unknown";
export type Check = { key: string; name: string; level: Level; detail: string; ms?: number; publicPart?: boolean };
export type Vendor = { key: string; name: string; level: Level; detail: string; url: string };

/** The parts everyone sees on /status, in order. "app" is recorded by the database (status_tick). */
export const PARTS = [
  { key: "app", name: "Website and app" },
  { key: "db", name: "Database" },
  { key: "auth", name: "Sign-in" },
  { key: "files", name: "Files and uploads" },
  { key: "timer", name: "Automatic posting and reminders" },
  { key: "analytics", name: "Analytics updates" },
  { key: "email", name: "Email" },
] as const;
export const VENDORS = [
  { key: "vercel", name: "Vercel", what: "hosting", api: "https://www.vercel-status.com/api/v2/status.json", url: "https://www.vercel-status.com" },
  { key: "supabase", name: "Supabase", what: "database, sign-in, files", api: "https://status.supabase.com/api/v2/status.json", url: "https://status.supabase.com" },
  { key: "resend", name: "Resend", what: "email", api: "https://resend-status.com/api/v2/status.json", url: "https://resend-status.com" },
] as const;
export const partName = (key: string) => PARTS.find((p) => p.key === key)?.name ?? VENDORS.find((v) => v.key === key)?.name ?? key;

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
    { key: "db", name: "Database", level: level(db), detail: detail(db, "Answering"), ms: db.ms, publicPart: true },
    { key: "auth", name: "Sign-in", level: level(auth), detail: detail(auth, "Answering"), ms: auth.ms, publicPart: true },
    { key: "files", name: "Files and uploads", level: level(files), detail: detail(files, "Answering"), ms: files.ms, publicPart: true },
  ];
}

/** Everything else the app does on its own: timers, analytics, email (app-wide), and posting, accounts, errors (developer only). */
export async function jobChecks(): Promise<Check[]> {
  const r = await timed(async () => {
    const { data, error } = await createAdminClient().rpc("status_checks");
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  });
  const s = r.ok ? r.value : null;
  const out: Check[] = [];
  if (!s) {
    out.push({ key: "jobs", name: "Timers and jobs", level: "unknown", detail: `Couldn't read them (${r.ok ? "no answer" : r.error}; the database needs migration 0063).` });
  } else {
    const timer = s.timer_last as { at: string; status: string } | null;
    const timerAge = timer ? (Date.now() - Date.parse(timer.at)) / 60_000 : null;
    out.push({
      key: "timer",
      name: "Automatic posting and reminders",
      publicPart: true,
      level: s.timer_scheduled === null ? "unknown" : !s.timer_scheduled ? "down" : timerAge === null || timerAge > 10 ? "down" : timer?.status === "failed" ? "warn" : "ok",
      detail: s.timer_scheduled === null ? "Can't see the timer from here." : !s.timer_scheduled ? "The timer isn't scheduled." : timer ? `Last ran ${ago(timer.at)}${timer.status === "failed" ? " and failed" : ""}.` : "It hasn't run yet.",
    });
    const last = s.analytics_last as string | null;
    const hours = last ? (Date.now() - Date.parse(last)) / 3_600_000 : null;
    // App-wide: did the morning copy run? (One team's account failing is that team's problem.)
    out.push({
      key: "analytics",
      name: "Analytics updates",
      publicPart: true,
      level: last === null ? "unknown" : (hours ?? 0) > 30 ? "warn" : "ok",
      detail: last === null ? "No copy yet." : `Last copy ${ago(last)} (every morning).`,
    });
    const failing = Number(s.analytics_failing ?? 0);
    out.push({
      key: "analytics_errors",
      name: "Analytics per account",
      level: failing > 0 ? "warn" : "ok",
      detail: failing > 0 ? `${failing} account${failing === 1 ? "" : "s"} reported a problem on the last copy.` : "Every account copied fine.",
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
    name: "Email",
    publicPart: true,
    level: emailConfigured() ? "ok" : "warn",
    detail: emailConfigured() ? "Set up." : "Not set up (RESEND_API_KEY / EMAIL_FROM).",
  });
  return out;
}

/** The services the app runs on, from their own status pages. */
export async function vendorChecks(): Promise<Vendor[]> {
  return Promise.all(
    VENDORS.map(async (f) => {
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

/*
 * History (migration 0067) ---------------------------------------------------
 */

export type Bar = BarView;
export type Incident = { part: string; level: "warn" | "down"; startedAt: string; endedAt: string | null; samples: number; detail?: string | null };
export type History = { hours: number; bars: Record<string, Bar[]>; uptime: Record<string, number | null>; since: string | null };

/**
 * The status check every 10 minutes (pg_cron → /api/cron/posting with
 * {"status": true}): checks everything and records the app-wide parts and
 * the services. Returns the checks so the caller can raise alerts.
 */
export async function recordStatus() {
  const [core, jobs, vendors] = await Promise.all([coreChecks(), jobChecks(), vendorChecks()]);
  const rows = [...core, ...jobs.filter((c) => c.publicPart), ...vendors]
    .filter((c) => c.level !== "unknown")
    .map((c) => ({ component: c.key, level: c.level, detail: c.detail.slice(0, 300) }));
  const { error } = rows.length ? await createAdminClient().from("status_samples").insert(rows) : { error: null };
  return { core, jobs, vendors, recorded: error ? 0 : rows.length, error: error?.message ?? null };
}

/**
 * The last `hours` hours per part, oldest first, one bar per hour (hours
 * without a check are "none"). `details` adds the worst check's text
 * (developers only: never send it to /status).
 */
export async function statusHistory(hours = 72, details = false): Promise<History> {
  const end = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const starts = Array.from({ length: hours }, (_, i) => end - (hours - 1 - i) * 3_600_000);
  const r = await timed(async () => {
    const { data, error } = await createAdminClient().rpc("status_history", { p_hours: hours });
    if (error) throw new Error(error.message);
    return (data ?? []) as { component: string; hour: string; level: "ok" | "warn" | "down"; samples: number; warn: number; down: number; detail: string | null }[];
  });
  const rows = r.ok ? r.value : [];
  const byPart = new Map<string, Map<number, (typeof rows)[number]>>();
  for (const row of rows) {
    const t = Date.parse(row.hour);
    if (!byPart.has(row.component)) byPart.set(row.component, new Map());
    byPart.get(row.component)!.set(t, row);
  }
  const bars: Record<string, Bar[]> = {};
  const uptime: Record<string, number | null> = {};
  for (const key of [...PARTS.map((p) => p.key), ...VENDORS.map((v) => v.key), ...byPart.keys()]) {
    if (bars[key]) continue;
    const m = byPart.get(key);
    let total = 0;
    let down = 0;
    bars[key] = starts.map((t) => {
      const row = m?.get(t);
      if (!row) return { hour: new Date(t).toISOString(), level: "none", samples: 0, warn: 0, down: 0 };
      total += row.samples;
      down += row.down;
      return { hour: new Date(t).toISOString(), level: row.level, samples: row.samples, warn: row.warn, down: row.down, ...(details ? { detail: row.detail } : {}) };
    });
    uptime[key] = total ? 1 - down / total : null;
  }
  const first = rows.length ? rows.reduce((a, b) => (Date.parse(a.hour) < Date.parse(b.hour) ? a : b)).hour : null;
  return { hours, bars, uptime, since: first ? new Date(Date.parse(first)).toISOString() : null };
}

/** Stretches where a part wasn't fully working, newest first. */
export async function statusIncidents(days = 7, details = false): Promise<Incident[]> {
  const r = await timed(async () => {
    const { data, error } = await createAdminClient().rpc("status_incidents", { p_days: days });
    if (error) throw new Error(error.message);
    return (data ?? []) as { component: string; level: "warn" | "down"; started_at: string; last_bad_at: string; ended_at: string | null; samples: number; detail: string | null }[];
  });
  if (!r.ok) return [];
  return r.value.map((i) => ({
    part: i.component,
    level: i.level,
    startedAt: i.started_at,
    endedAt: i.ended_at,
    samples: i.samples,
    ...(details ? { detail: i.detail } : {}),
  }));
}

/** The app-wide parts that aren't working right now (from the last status check; for the Posting page). */
export async function currentProblems(): Promise<{ key: string; name: string; level: "warn" | "down" }[]> {
  const r = await timed(async () => {
    const { data, error } = await createAdminClient().rpc("status_current");
    if (error) throw new Error(error.message);
    return (data ?? []) as { component: string; level: string }[];
  }, 3000);
  if (!r.ok) return [];
  const publicKeys = new Set<string>(PARTS.map((p) => p.key));
  return r.value
    .filter((c) => publicKeys.has(c.component) && (c.level === "warn" || c.level === "down"))
    .map((c) => ({ key: c.component, name: partName(c.component), level: c.level as "warn" | "down" }));
}

export const worst = (levels: Level[]): Level => (levels.includes("down") ? "down" : levels.includes("warn") ? "warn" : levels.every((l) => l === "unknown") ? "unknown" : "ok");
