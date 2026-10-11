import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/*
 * The pieces every part of the daily copy shares (sync.ts, sync-advanced.ts):
 * calling a platform, dates, saving rows.
 */

export type Admin = ReturnType<typeof createAdminClient>;

export const DAY = 86_400_000;
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (n: number) => iso(new Date(Date.now() - n * DAY));
export const dayRange = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) out.push(iso(new Date(t)));
  return out;
};
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0
  ) {
    super(message);
  }
}

export async function get(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    // (Instagram takes the token in the address instead: no header then.)
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {}
  const err = body.error as { message?: string; code?: string } | string | undefined;
  // TikTok answers 200 with error.code "ok" on success.
  const tiktokOk = typeof err === "object" && err?.code === "ok";
  if (!res.ok || (err && !tiktokOk)) {
    const msg = typeof err === "string" ? err : err?.message || `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return body;
}

// YouTube ---------------------------------------------------------------------

export const YTA = "https://youtubeanalytics.googleapis.com/v2/reports";
export const YT = "https://www.googleapis.com/youtube/v3";

export type YtRows = { columnHeaders?: { name: string }[]; rows?: unknown[][] };
export function ytReport(token: string, p: Record<string, string>) {
  return get(`${YTA}?${new URLSearchParams({ ids: "channel==MINE", ...p })}`, token) as Promise<YtRows>;
}
export const rowsOf = (r: YtRows) => {
  const names = (r.columnHeaders ?? []).map((h) => h.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]])) as Record<string, unknown>);
};
/** The first metric list YouTube accepts (each one shorter than the last), or null. */
export async function ytFirst(token: string, base: Record<string, string>, metricLists: string[]) {
  for (const metrics of metricLists) {
    try {
      return { metrics, rows: rowsOf(await ytReport(token, { ...base, metrics })) };
    } catch {
      /* the next, shorter list */
    }
  }
  return null;
}
/** "PT1M5S" → 65 */
export const isoDuration = (d: unknown) => {
  const m = typeof d === "string" ? d.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/) : null;
  return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0) : null;
};

// Saving ------------------------------------------------------------------------

export async function upsert(admin: Admin, table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (!rows.length) return 0;
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from(table).upsert(chunk, { onConflict });
    if (error) throw new ApiError(`Saving ${table}: ${error.message}`);
    n += chunk.length;
  }
  return n;
}

/** Upsert; on a database without the `optional` columns yet, again without them. */
export async function upsertSome(admin: Admin, table: string, rows: Record<string, unknown>[], onConflict: string, optional: string[]) {
  try {
    return await upsert(admin, table, rows, onConflict);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const missingColumn = optional.some((c) => msg.includes(c)) || /column|schema cache/i.test(msg);
    if (!missingColumn || !rows.some((r) => optional.some((c) => c in r))) throw e;
    return upsert(admin, table, rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !optional.includes(k)))), onConflict);
  }
}

/** Columns added by migration 0079, then 0081 (the copy works without them until they've run). */
export const NEW_DAILY_COLS = ["engaged_views", "avg_view_pct", "dislikes", "playlist_adds", "metrics"];
export const NEW_CONTENT_COLS = ["engaged_views", "watch_minutes", "avg_view_seconds", "avg_view_pct", "subscribers_gained", "skip_rate", "reposts", "metrics"];

type Metrics = Record<string, unknown>;
const cleanMetrics = (m: Metrics) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null && v !== undefined && !(typeof v === "number" && !Number.isFinite(v))));

/**
 * Every other number (migration 0081) sits in one `metrics` object per row.
 * A number a platform didn't share this time keeps its stored value: the new
 * ones are laid over what's saved. Once any row has `metrics`, every row
 * gets it (an upsert sends one set of columns: a row without it would be
 * saved as null).
 */
export async function keepStoredMetrics(
  admin: Admin,
  table: "analytics_daily" | "analytics_content",
  teamId: string,
  platform: string,
  rows: Record<string, unknown>[]
) {
  const withMetrics = rows.filter((r) => r.metrics && typeof r.metrics === "object");
  if (!withMetrics.length) return rows;
  const stored = new Map<string, Metrics>();
  try {
    if (table === "analytics_daily") {
      const days = rows.map((r) => String(r.day)).sort();
      const { data, error } = await admin.from(table).select("day, content, metrics").eq("team_id", teamId).eq("platform", platform).gte("day", days[0]).lte("day", days[days.length - 1]);
      if (error) return rows;
      for (const r of (data ?? []) as { day: string; content: string; metrics: Metrics | null }[]) stored.set(`${r.day}|${r.content}`, r.metrics ?? {});
    } else {
      const ids = [...new Set(rows.map((r) => String(r.external_id)))];
      for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await admin.from(table).select("external_id, metrics").eq("team_id", teamId).eq("platform", platform).in("external_id", ids.slice(i, i + 150));
        if (error) return rows;
        for (const r of (data ?? []) as { external_id: string; metrics: Metrics | null }[]) stored.set(r.external_id, r.metrics ?? {});
      }
    }
  } catch {
    return rows;
  }
  const keyOf = (r: Record<string, unknown>) => (table === "analytics_daily" ? `${r.day}|${r.content ?? "all"}` : String(r.external_id));
  return rows.map((r) => ({ ...r, metrics: { ...(stored.get(keyOf(r)) ?? {}), ...(r.metrics && typeof r.metrics === "object" ? cleanMetrics(r.metrics as Metrics) : {}) } }));
}

/** A few at a time (platforms don't like a burst), in order. */
export async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  return out;
}
