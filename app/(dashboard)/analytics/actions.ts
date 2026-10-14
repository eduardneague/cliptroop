"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorMeta, sendNotifications, teamMeta } from "@/lib/notify";
import { getMembership } from "@/lib/permissions/membership";
import { fetchYouTubeDay, fetchYouTubeRevenueVideos, fetchYouTubeVideoDetails, fetchYouTubeVideoHistory, fetchYouTubeVideoRevenueDays, syncTeamAnalytics, type RevenueVideoRow } from "@/modules/analytics/lib/sync";
import { convert, getFxRates, isCurrencyCode } from "@/lib/fx";
import { liveTeamPlatform } from "@/modules/analytics/lib/live";
import { getRealtime, type Realtime } from "@/modules/analytics/lib/realtime";
import { canViewRevenue, findVideos, getAudience, getContent, getProduction, getViewsDay, sharedLookups, type Audience, type ContentItem, type DayViews, type Production, type RevenueVideos } from "@/modules/analytics/lib/queries";
import { historyToFill } from "@/modules/analytics/lib/video";
import { addDays, daysBetween, readCustom, readRange, todayIn, windowFor } from "@/modules/analytics/lib/ranges";
import { getVideoSplits } from "@/modules/analytics/lib/advanced";
import { gatherClaudeExport, type ClaudeExportData } from "@/modules/analytics/lib/claude-export";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ error?: undefined } & T) | { error: string };

/**
 * Copy the numbers from the platforms now (masters and schedulers). Since
 * 1.21.0 in the background (0085: one call per platform, each with its own
 * time, then its live counts): copying every platform inside this request
 * could take longer than a request may last. The page refreshes itself.
 */
export async function syncAnalyticsNow(teamId: string): Promise<Result<{ summary: string }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const membership = await getMembership(supabase, teamId);
  const roles = membership?.roles ?? [];
  if (!roles.includes("master") && !roles.includes("publisher")) return { error: "Only masters and schedulers can sync." };
  const { data, error } = await supabase.rpc("analytics_sync_now", { p_team: teamId });
  if (!error && typeof data === "number") {
    if (data === -1) return { summary: "Already getting the latest numbers: this page updates by itself." };
    if (data > 0) return { summary: `Getting the latest numbers from ${data === 1 ? "1 platform" : `${data} platforms`}: this page updates by itself.` };
  }
  // Before 0085, or no timer (a local copy): every platform at once, after answering.
  const { data: accounts } = await supabase.from("social_accounts").select("platform").eq("team_id", teamId).eq("status", "active");
  const platforms = [...new Set(((accounts ?? []) as { platform: string }[]).map((a) => a.platform))].filter((p): p is "youtube" | "instagram" | "tiktok" | "facebook" => ["youtube", "instagram", "tiktok", "facebook"].includes(p));
  if (!platforms.length) return { error: "No connected accounts. Connect them in Team → Connected accounts." };
  after(async () => {
    await Promise.allSettled(
      platforms.map(async (p) => {
        const [r] = await syncTeamAnalytics(teamId, { only: p });
        if (r?.ok) await liveTeamPlatform(teamId, p, { full: true, budgetMs: 15_000 });
      })
    );
  });
  return { summary: "Getting the latest numbers: this page updates by itself." };
}

/** Let someone see revenue, or take it away (masters only; the database checks). */
export async function setRevenueAccess(teamId: string, userId: string, on: boolean): Promise<Result> {
  if (!UUID.test(teamId) || !UUID.test(userId)) return { error: "Not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (on) {
    const { error } = await supabase.from("revenue_access").insert({ team_id: teamId, user_id: userId });
    if (error && !/duplicate/i.test(error.message)) return { error: "Only masters can choose who sees revenue." };
    if (!error && userId !== user.id) {
      const [actor, team] = await Promise.all([actorMeta(supabase, user.id), teamMeta(supabase, teamId)]);
      await sendNotifications({
        recipient_id: userId,
        kind: "revenue_access",
        body: `${actor.name} let you see ${team.name}'s revenue in Analytics.`,
        metadata: { actor, team, href: "/analytics?tab=revenue" },
      });
    }
  } else {
    const { error } = await supabase.from("revenue_access").delete().eq("team_id", teamId).eq("user_id", userId);
    if (error) return { error: "Only masters can choose who sees revenue." };
  }
  revalidatePath("/analytics");
  return {};
}

// ---------------------------------------------------------------------------
// Dashboard widgets (loaded by the widgets themselves, only when one is on
// the board or in the widget library, so the dashboard stays fast).
// ---------------------------------------------------------------------------

export type DashAudience = { audience: Audience; top: ContentItem[] };
export type DashProduction = { kpis: Production["kpis"]; from: string; to: string };

async function teamTz(teamId: string) {
  if (!UUID.test(teamId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [membership, { data: team }] = await Promise.all([getMembership(supabase, teamId), supabase.from("teams").select("timezone").eq("id", teamId).maybeSingle()]);
  if (!membership) return null;
  return ((team?.timezone as string | null) || "Europe/Bucharest") as string;
}

/** Views, followers, countries and the top videos of the last 28 days (platform numbers end yesterday). */
export async function loadDashAudience(teamId: string): Promise<Result<{ data: DashAudience }>> {
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  const w = windowFor("28d", addDays(todayIn(tz), -1));
  // The connected platforms and whose numbers they are: looked up once for both.
  const shared = sharedLookups(teamId, await createClient());
  const [audience, content] = await Promise.all([getAudience(teamId, w, shared), getContent(teamId, w, shared, { limit: 60 })]);
  return { data: { audience, top: content.items.slice(0, 8) } };
}

// A day's YouTube videos asked for at most once per 10 minutes (per server), when the daily copy didn't keep them.
const askedDays = new Map<string, number>();

/**
 * What got the views on one day of the Views chart: every video, on every
 * connected platform, with its views that day (anyone on the team). A day
 * the copies didn't keep YouTube's per-video numbers for is asked from
 * YouTube right then (and kept).
 */
export async function loadViewsDay(teamId: string, day: string): Promise<Result<{ data: DayViews }>> {
  if (!UUID.test(teamId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a day on the chart." };
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  let data = await getViewsDay(teamId, day);
  const yt = data.platforms.find((p) => p.platform === "youtube");
  const today = todayIn(tz);
  const yearsBack = addDays(today, -3 * 365);
  if (yt && !yt.count && (yt.views ?? 0) > 0 && day < today && day >= yearsBack) {
    const key = `${teamId}:${day}`;
    if ((askedDays.get(key) ?? 0) < Date.now() - 10 * 60_000) {
      askedDays.set(key, Date.now());
      if (askedDays.size > 2000) askedDays.clear();
      try {
        if (await fetchYouTubeDay(teamId, day)) data = await getViewsDay(teamId, day);
      } catch {
        /* YouTube didn't answer: the dialog says what it has */
      }
    }
  }
  return { data };
}

/** The last 7 days of our own work (shorts, long videos, on time, overdue). */
export async function loadDashProduction(teamId: string): Promise<Result<{ data: DashProduction }>> {
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  const w = windowFor("7d", todayIn(tz));
  const p = await getProduction(teamId, w, tz);
  return { data: { kpis: p.kpis, from: w.from, to: w.to } };
}

// ---------------------------------------------------------------------------
// Other income (sponsorships, brand deals, other platforms…): masters only;
// the database (0061) checks it again.
// ---------------------------------------------------------------------------

const SOURCES = ["sponsorship", "brand_deal", "affiliate", "youtube_other", "facebook", "instagram", "tiktok", "merch", "other"];

/**
 * Which currency revenue is shown in, for this person: saved on the account
 * (profiles.currency, migration 0062) and on this device (works before it).
 */
export async function setRevenueCurrency(code: string): Promise<Result> {
  if (!/^[A-Z]{3}$/.test(code)) return { error: "Pick a currency." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  (await cookies()).set("vp_currency", code, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  await supabase.from("profiles").update({ currency: code }).eq("id", user.id);
  revalidatePath("/analytics");
  return {};
}

export async function addRevenueEntry(teamId: string, input: { day: string; source: string; amount: number; note?: string | null; currency?: string }): Promise<Result> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return { error: "Pick a date." };
  if (!SOURCES.includes(input.source)) return { error: "Pick where it came from." };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 100_000_000) return { error: "Enter an amount above 0." };
  const note = (input.note ?? "").trim().slice(0, 300) || null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  // Entered in the currency on screen (any with an exchange rate).
  const currency = input.currency && /^[A-Z]{3}$/.test(input.currency) ? input.currency : (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const { error } = await supabase.from("revenue_entries").insert({ team_id: teamId, day: input.day, source: input.source, amount, currency, note });
  if (error) return { error: /revenue_entries/.test(error.message) && /exist|schema cache/i.test(error.message) ? "Run migration 0061 first." : "Only masters can add income." };
  revalidatePath("/analytics");
  return {};
}

export async function deleteRevenueEntry(teamId: string, id: string): Promise<Result> {
  if (!UUID.test(teamId) || !UUID.test(id)) return { error: "Not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.from("revenue_entries").delete().eq("team_id", teamId).eq("id", id).select("id");
  if (error || !data?.length) return { error: "Only masters can remove income." };
  revalidatePath("/analytics");
  return {};
}

// The videos behind a stretch of revenue, kept 10 minutes (per server): stepping back and forth is instant.
const revenueVideosAsked = new Map<string, { at: number; rows: RevenueVideoRow[] | null }>();

/** The currency this person picked for revenue: their account first (migration 0062), then this device. */
async function personCurrency(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase.from("profiles").select("currency").eq("id", userId).maybeSingle();
  if (!error && isCurrencyCode(data?.currency)) return data.currency as string;
  const c = (await cookies()).get("vp_currency")?.value;
  return isCurrencyCode(c) ? c : null;
}

/**
 * Which videos made YouTube's money on a day (or a week, a month) of
 * Revenue's chart (1.21.0): asked from YouTube, the top 25 by estimated
 * revenue, in this person's currency. Only the people who see revenue.
 */
export async function loadRevenueVideos(teamId: string, from: string, to: string): Promise<Result<{ data: RevenueVideos }>> {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!UUID.test(teamId) || !day.test(from) || !day.test(to) || from > to) return { error: "Pick a day on the chart." };
  if (daysBetween(from, to) > 400) return { error: "Pick a shorter stretch." };
  if (!(await teamTz(teamId))) return { error: "Not on this team." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!(await canViewRevenue(supabase, teamId))) return { error: "Only the people who see revenue can open this." };
  const stored = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const [wanted, fx] = await Promise.all([personCurrency(supabase, user.id), getFxRates()]);
  const currency = wanted && (wanted === stored || (fx?.rates[wanted] && fx?.rates[stored])) ? wanted : stored;
  const key = `${teamId}:${from}:${to}`;
  let hit = revenueVideosAsked.get(key);
  if (!hit || hit.at < Date.now() - 10 * 60_000) {
    try {
      hit = { at: Date.now(), rows: await fetchYouTubeRevenueVideos(teamId, from, to, stored) };
    } catch (e) {
      console.error("[revenue videos]", e instanceof Error ? e.message : e);
      return { error: "YouTube didn't send the revenue per video this time. Try again in a moment." };
    }
    revenueVideosAsked.set(key, hit);
    if (revenueVideosAsked.size > 500) revenueVideosAsked.clear();
  }
  if (!hit.rows) return { data: { from, to, currency, videos: [], note: "Connect YouTube with revenue allowed (Team → Connected accounts) to see which videos made the money." } };
  const ids = hit.rows.map((r) => r.id);
  const { data: known } = ids.length
    ? await supabase.from("analytics_content").select("external_id, kind, short_id, project_id, short_videos(entry_number), long_video_projects(entry_number)").eq("team_id", teamId).eq("platform", "youtube").in("external_id", ids)
    : { data: [] };
  const byId = new Map(((known ?? []) as Record<string, unknown>[]).map((r) => [r.external_id as string, r]));
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
  const conv = (n: number) => (currency === stored ? n : (convert(n, stored, currency, fx) ?? n));
  const videos = hit.rows.map((r) => {
    const c = byId.get(r.id);
    const s = one(c?.short_videos as { entry_number: number } | { entry_number: number }[] | null | undefined);
    const l = one(c?.long_video_projects as { entry_number: number } | { entry_number: number }[] | null | undefined);
    const revenue = conv(r.revenue);
    const kind: "short" | "long" = c?.kind === "short" || c?.kind === "long" ? (c.kind as "short" | "long") : r.durationSec !== null && r.durationSec <= 180 ? "short" : "long";
    return {
      platform: "youtube" as const,
      id: r.id,
      title: r.title,
      thumbnail: r.thumbnail && /^https?:\/\//i.test(r.thumbnail) ? r.thumbnail : null,
      url: `https://www.youtube.com/watch?v=${r.id}`,
      kind,
      publishedAt: r.publishedAt,
      revenue,
      views: r.views,
      rpm: r.views ? (revenue / r.views) * 1000 : null,
      ours: c?.short_id ? { kind: "short" as const, id: c.short_id as string, number: s?.entry_number ?? null } : c?.project_id ? { kind: "long" as const, id: c.project_id as string, number: l?.entry_number ?? null } : null,
    };
  });
  return { data: { from, to, currency, videos, note: null } };
}

// A video's own story asked from YouTube at most every 10 minutes (per server).
const askedDetails = new Map<string, number>();

/**
 * A video's analytics page found its splits missing or half a day old
 * (1.21.0): ask YouTube for everything about it (where its views came
 * from, who watched, on what, its numbers per day with subscribers), keep
 * it, and let the page reload. Anyone on the team.
 */
export async function loadVideoDetails(teamId: string, id: string): Promise<Result<{ saved: number }>> {
  if (!UUID.test(teamId) || typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { error: "Not found." };
  if (!(await teamTz(teamId))) return { error: "Not on this team." };
  const key = `${teamId}:${id}`;
  if ((askedDetails.get(key) ?? 0) > Date.now() - 10 * 60_000) return { saved: 0 };
  askedDetails.set(key, Date.now());
  if (askedDetails.size > 3000) askedDetails.clear();
  try {
    return { saved: Math.max(0, await fetchYouTubeVideoDetails(teamId, id)) };
  } catch (e) {
    console.error("[video details]", e instanceof Error ? e.message : e);
    return { error: "YouTube didn't send this video's details this time." };
  }
}

export type VideoRevenueDays = { currency: string; days: { day: string; revenue: number; adRevenue: number | null; cpm: number | null; playbackCpm: number | null; monetizedPlaybacks: number | null }[]; note: string | null };
const videoRevenueAsked = new Map<string, { at: number; rows: Awaited<ReturnType<typeof fetchYouTubeVideoRevenueDays>> }>();

/** One YouTube video's money per day since it was posted (its page's Revenue tab, 1.21.0): the people who see revenue only. */
export async function loadVideoRevenueDays(teamId: string, id: string): Promise<Result<{ data: VideoRevenueDays }>> {
  if (!UUID.test(teamId) || typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { error: "Not found." };
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!(await canViewRevenue(supabase, teamId))) return { error: "Only the people who see revenue can open this." };
  const { data: c } = await supabase.from("analytics_content").select("published_at").eq("team_id", teamId).eq("platform", "youtube").eq("external_id", id).maybeSingle();
  const to = addDays(todayIn(tz), -1);
  const posted = typeof c?.published_at === "string" ? (c.published_at as string).slice(0, 10) : addDays(to, -89);
  const from = posted < addDays(to, -1094) ? addDays(to, -1094) : posted > to ? to : posted;
  const stored = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const [wanted, fx] = await Promise.all([personCurrency(supabase, user.id), getFxRates()]);
  const currency = wanted && (wanted === stored || (fx?.rates[wanted] && fx?.rates[stored])) ? wanted : stored;
  const key = `${teamId}:${id}:${from}:${to}`;
  let hit = videoRevenueAsked.get(key);
  if (!hit || hit.at < Date.now() - 10 * 60_000) {
    try {
      hit = { at: Date.now(), rows: await fetchYouTubeVideoRevenueDays(teamId, id, from, to, stored) };
    } catch (e) {
      console.error("[video revenue]", e instanceof Error ? e.message : e);
      return { error: "YouTube didn't send this video's revenue per day this time. Try again in a moment." };
    }
    videoRevenueAsked.set(key, hit);
    if (videoRevenueAsked.size > 500) videoRevenueAsked.clear();
  }
  if (!hit.rows) return { data: { currency, days: [], note: "Connect YouTube with revenue allowed (Team → Connected accounts) to see this video's revenue per day." } };
  const conv = (x: number | null) => (x === null ? null : currency === stored ? x : (convert(x, stored, currency, fx) ?? x));
  return { data: { currency, days: hit.rows.map((r) => ({ ...r, revenue: conv(r.revenue) ?? 0, adRevenue: conv(r.adRevenue), cpm: conv(r.cpm), playbackCpm: conv(r.playbackCpm) })), note: null } };
}

// A video's history asked from YouTube at most every 30 minutes (per server).
const askedHistory = new Map<string, number>();

/**
 * A video's analytics page found its first days missing: YouTube sends any
 * video's whole day-by-day history, so ask for it (and for the videos that
 * make its "typical"), keep it, and let the page reload (anyone on the team).
 */
export async function fillVideoHistory(teamId: string, id: string): Promise<Result<{ filled: number }>> {
  if (!UUID.test(teamId) || typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { error: "Not found." };
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  const key = `${teamId}:${id}`;
  if ((askedHistory.get(key) ?? 0) > Date.now() - 30 * 60_000) return { filled: 0 };
  askedHistory.set(key, Date.now());
  if (askedHistory.size > 3000) askedHistory.clear();
  try {
    const items = await historyToFill(teamId, id, todayIn(tz));
    if (!items.length) return { filled: 0 };
    const saved = await fetchYouTubeVideoHistory(teamId, items);
    return { filled: Math.max(0, saved) };
  } catch (e) {
    console.error("[video history]", e instanceof Error ? e.message : e);
    return { error: "YouTube didn't send the history this time." };
  }
}

/** Any video ever copied, by title (the platform's or ClipTroop's) or #number: Analytics → Content's search. */
export async function searchVideos(teamId: string, q: string): Promise<Result<{ items: ContentItem[] }>> {
  if (!UUID.test(teamId) || typeof q !== "string") return { error: "Not found." };
  const query = q.trim().slice(0, 100);
  if (!query) return { items: [] };
  if (!(await teamTz(teamId))) return { error: "Not on this team." };
  try {
    return { items: await findVideos(teamId, query) };
  } catch (e) {
    console.error("[video search]", e instanceof Error ? e.message : e);
    return { error: "Couldn't search right now." };
  }
}

/** Analytics' realtime (1.19.0): the last 48 hours and 60 minutes, the videos getting views now. */
export async function loadRealtime(teamId: string, full = false): Promise<Realtime | null> {
  if (!UUID.test(teamId)) return null;
  if (!(await teamTz(teamId))) return null;
  try {
    return await getRealtime(teamId, { full: full === true });
  } catch (e) {
    console.error("[realtime]", e instanceof Error ? e.message : e);
    return null;
  }
}

/** One video's own traffic sources and search terms (Advanced → a video's details). */
export async function loadVideoSplits(teamId: string, platform: string, id: string): Promise<Awaited<ReturnType<typeof getVideoSplits>> | null> {
  if (!UUID.test(teamId) || !["youtube", "instagram", "tiktok", "facebook"].includes(platform) || typeof id !== "string" || !id || id.length > 200) return null;
  if (!(await teamTz(teamId))) return null;
  try {
    return await getVideoSplits(teamId, platform as "youtube", id);
  } catch {
    return { traffic: [], searches: [], asOf: null };
  }
}

/**
 * Everything for "Download for Claude": the chosen platforms' numbers and
 * videos, scripts, frames and each video's own traffic (the browser makes
 * the .txt and the PDF from it). Teammates only; money only for the people
 * who see revenue, and only when they ask for it.
 */
export async function loadClaudeExport(
  teamId: string,
  input: { platforms: string[]; range: string; which: string; top?: number; scripts?: boolean; revenue?: boolean; from?: string; to?: string }
): Promise<Result<{ data: ClaudeExportData }>> {
  const tz = await teamTz(teamId);
  if (!tz) return { error: "You're not on this team." };
  const platforms = [...new Set((Array.isArray(input.platforms) ? input.platforms : []).filter((p): p is "youtube" | "instagram" | "facebook" | "tiktok" => ["youtube", "instagram", "facebook", "tiktok"].includes(p)))];
  if (!platforms.length) return { error: "Pick at least one platform." };
  const supabase = await createClient();
  const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  // Platform numbers arrive a day late: the range ends yesterday.
  const yesterday = addDays(todayIn(tz), -1);
  // Custom: the two days picked (else 28 days); Lifetime: from its first day.
  let range = readRange(input.range);
  let end = yesterday;
  let start: string | null = null;
  if (range === "custom") {
    const c = readCustom(input.from, input.to, yesterday);
    if (c) [start, end] = [c.from, c.to];
    else range = "28d";
  } else if (range === "lifetime" && readCustom(input.from, yesterday, yesterday)) start = input.from!;
  try {
    const data = await gatherClaudeExport(
      teamId,
      { name: (team?.name as string | undefined) ?? "Team", tz },
      {
        platforms,
        range,
        start,
        which: input.which === "top" || input.which === "range" ? input.which : "all",
        top: Math.max(5, Math.min(200, Math.round(Number(input.top) || 50))),
        scripts: input.scripts !== false,
        revenue: input.revenue === true,
      },
      end
    );
    if (!data.platforms.length) return { error: "None of these platforms has numbers yet." };
    return { data };
  } catch (e) {
    console.error("[claude export]", e instanceof Error ? e.message : e);
    return { error: "Couldn't gather everything. Try again in a moment." };
  }
}
