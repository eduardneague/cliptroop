import "server-only";
import { APP_NAME } from "@/lib/brand";
import { ApiError, upsert, type Admin } from "./sync-core";
import { cursorAfter, parseReachCsv, sumReach, type ReachRow } from "./reach-parse";

/*
 * Impressions and click-through rate (1.19.0). YouTube's Analytics API
 * doesn't have them; its Reporting API does, as daily "reach" reports per
 * video (channel_reach_basic_a1). We start one reporting job per channel
 * (YouTube then makes a report every day, plus the 30 days before the job
 * started), download each new report once, and keep everything: per video
 * and day (analytics_content_days), per day for the channel, its Shorts and
 * its long videos (analytics_daily) and per video over the days kept
 * (analytics_content, analytics_reach_totals()). Needs "YouTube Reporting
 * API" turned on in the Google Cloud project (same sign-in permission as
 * Analytics: yt-analytics.readonly).
 */

const YTR = "https://youtubereporting.googleapis.com/v1";
export const REACH_REPORT = "channel_reach_basic_a1";
/** Reports handled per run (the first run has the 30 days before). */
const PER_RUN = 12;

export type ReachState = { job: string | null; after: string | null };
export type ReachResult = ReachState & { note: string | null; reports: number; rows: number };

async function call(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { error?: { message?: string } };
      if (b.error?.message) msg = b.error.message;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res;
}

/** What to tell the team when YouTube refuses (shown on Analytics). */
export function reachNote(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED|not enabled/i.test(msg))
    return "Impressions and CTR need the YouTube Reporting API: turn it on in Google Cloud (APIs & Services → Library → YouTube Reporting API → Enable).";
  if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return "Impressions and CTR: YouTube refused the reach reports. Reconnect YouTube in Team → Connected accounts.";
  return `Impressions and CTR: ${msg.slice(0, 200)}`;
}

/** The channel's reach job: the one we started before, one already there, or a new one. */
async function ensureJob(token: string, known: string | null): Promise<string> {
  if (known) return known;
  const list = (await (await call(`${YTR}/jobs`, token)).json()) as { jobs?: { id: string; reportTypeId: string; expireTime?: string }[] };
  const existing = (list.jobs ?? []).find((j) => j.reportTypeId === REACH_REPORT && !(j.expireTime && Date.parse(j.expireTime) < Date.now()));
  if (existing) return existing.id;
  const created = (await (
    await call(`${YTR}/jobs`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportTypeId: REACH_REPORT, name: `${APP_NAME} impressions and CTR` }) })
  ).json()) as { id?: string };
  if (!created.id) throw new ApiError("YouTube didn't start the reach reports.");
  return created.id;
}

type Report = { id: string; createTime: string; startTime: string; downloadUrl: string };

async function newReports(token: string, job: string, after: string | null): Promise<Report[]> {
  const out: Report[] = [];
  let page: string | undefined;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ ...(after ? { createdAfter: after } : {}), ...(page ? { pageToken: page } : {}) });
    const r = (await (await call(`${YTR}/jobs/${encodeURIComponent(job)}/reports?${q}`, token)).json()) as { reports?: Report[]; nextPageToken?: string };
    out.push(...(r.reports ?? []).filter((x) => x.downloadUrl && x.createTime));
    if (!r.nextPageToken) break;
    page = r.nextPageToken;
  }
  return out.sort((a, b) => a.createTime.localeCompare(b.createTime));
}

/**
 * Downloads the reach reports YouTube made since `state.after` (a few per
 * run) and saves them. Never throws: a refusal comes back as a note.
 */
export async function syncReach(admin: Admin, teamId: string, token: string, state: ReachState, deadline: number): Promise<ReachResult> {
  let job = state.job;
  let after = state.after;
  let reports = 0;
  let rows = 0;
  try {
    job = await ensureJob(token, job);
    const list = await newReports(token, job, after);
    const saved: Report[] = [];
    try {
      for (const rep of list.slice(0, PER_RUN)) {
        if (Date.now() > deadline) break;
        const text = await (await call(rep.downloadUrl, token)).text();
        rows += await saveReach(admin, teamId, parseReachCsv(text));
        saved.push(rep);
        reports++;
      }
    } finally {
      after = cursorAfter(saved, list[saved.length] ?? null, after);
    }
    if (reports) await admin.rpc("analytics_reach_totals", { p_team: teamId });
    return { job, after, note: null, reports, rows };
  } catch (e) {
    // A job that's gone (deleted on YouTube's side): start a new one next time.
    if (e instanceof ApiError && e.status === 404) job = null;
    return { job, after, note: reachNote(e), reports, rows };
  }
}

/** One report's rows: per video and day, then the day's totals (all, Shorts, long videos, live streams). */
async function saveReach(admin: Admin, teamId: string, list: ReachRow[]): Promise<number> {
  if (!list.length) return 0;
  const now = new Date().toISOString();
  let n = await upsert(
    admin,
    "analytics_content_days",
    list.map((r) => ({ team_id: teamId, platform: "youtube", external_id: r.video, day: r.day, source: "daily", impressions: r.impressions, ctr: r.ctr, updated_at: now })),
    "team_id,platform,external_id,day"
  );
  // Shorts or long: from the videos we know.
  const ids = [...new Set(list.map((r) => r.video))];
  const kind = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("analytics_content").select("external_id, kind").eq("team_id", teamId).eq("platform", "youtube").in("external_id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as { external_id: string; kind: string }[]) kind.set(r.external_id, r.kind);
  }
  const groups = new Map<string, ReachRow[]>();
  for (const r of list) {
    const k = kind.get(r.video);
    const content = k === "short" ? "shorts" : k === "long" ? "long" : k === "live" ? "live" : null;
    for (const key of [`${r.day}|all`, ...(content ? [`${r.day}|${content}`] : [])]) groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const daily = [...groups.entries()].map(([key, rs]) => {
    const [day, content] = key.split("|");
    const t = sumReach(rs);
    return { team_id: teamId, platform: "youtube", day, content, impressions: t.impressions, ctr: t.ctr, updated_at: now };
  });
  n += await upsert(admin, "analytics_daily", daily, "team_id,platform,day,content");
  return n;
}
