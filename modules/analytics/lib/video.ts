import "server-only";
import { createClient } from "@/lib/supabase/server";
import { convert, getFxRates, isCurrencyCode } from "@/lib/fx";
import type { SocialPlatform } from "@/lib/social/providers";
import { numbersVisibility, visibleRows } from "./accounts";
import { averageCurve, readCurve, resample, type RetentionPoint } from "./retention";
import { getVideoBreakdowns, hooksFor, videoMapper, withScores, type AdvBreakdown, type AdvVideo } from "./advanced";
import { cumulativeByAge, median, perDayFrom, rankOf, typicalCurve, versusTypical, type DayRow } from "./scores";
import { addDays, dayList } from "./ranges";
import { gainedBetween, perHour, perSlot } from "./live-math";
import { cache } from "react";

/*
 * One video's own analytics page (1.17.0): every number its platform shares,
 * next to the team's typical video of the same kind; its views day by day
 * and since it was posted (against the typical curve); retention against the
 * average; where its views came from; the same short on the other platforms.
 * Read with the person's own client: their teams only, the accounts
 * connected now only, money only for the people who see revenue.
 */

type Row = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Growth is compared over the first weeks (where a video's fate is decided). */
export const GROWTH_DAYS = 60;
/** How many videos of the same kind make "typical" (the ones just before it). */
const PEERS = 30;

export type VideoKey = { key: string; label: string; value: number | null; typical: number | null; format: "compact" | "pct" | "seconds" | "hours" | "money" | "decimal"; good?: "up" | "down"; rank: { rank: number; of: number } | null };
export type Sibling = { platform: SocialPlatform; id: string; title: string | null; kind: AdvVideo["kind"]; views: number | null; likes: number | null; comments: number | null; shares: number | null; url: string | null; thumbnail: string | null; score: number | null; publishedAt: string | null };

export type VideoPageData = {
  video: AdvVideo;
  /** "Shorts", "long videos", "Reels", "videos": what it's compared with. */
  peerWord: string;
  /** Same platform, same kind (it included). */
  peerCount: number;
  keys: VideoKey[];
  /**
   * Per day, from the first day with a number to the last. YouTube's also
   * have likes, comments, shares, subscribers, the average view (1.21.0)
   * and impressions with their CTR (the reach reports, 1.19.0).
   */
  daily: {
    days: string[];
    views: (number | null)[];
    watchMinutes: (number | null)[];
    likes: (number | null)[];
    comments: (number | null)[];
    shares: (number | null)[];
    subs: (number | null)[];
    avgView: (number | null)[];
    impressions: (number | null)[];
    ctr: (number | null)[];
    source: "daily" | "total";
  } | null;
  /** Views since it was posted: index 0 = the day it was posted. */
  growth: { mine: (number | null)[]; typical: (number | null)[]; typicalFrom: number; versus: ReturnType<typeof versusTypical> } | null;
  /** Day 1, 7, 30… since posting, when known. */
  milestones: { day: number; views: number; typical: number | null }[];
  /** True: some of its first days are missing (YouTube can fill them in on request). */
  canFill: boolean;
  retention: { mine: (number | null)[]; average: (number | null)[] | null; averageCount: number } | null;
  /** Its own splits since it was posted (YouTube; 1.21.0: every one its page shows), and when YouTube sent them. */
  breakdowns: { list: AdvBreakdown[]; asOf: string | null; fetchedAt: string | null } | null;
  /**
   * Its counts within minutes (1.19.0): when they were last read, the views
   * of the last 48 hours and 60 minutes, and per hour. Null before
   * migration 0083 or before the 10-minute job has seen it.
   */
  live: { at: string | null; views48: number | null; views60: number | null; hours: { at: string; views: number }[]; minutes: { at: string; views: number }[] } | null;
  siblings: Sibling[];
  currency: string;
  /** Typical revenue per 1,000 views of the same kind (money people only). */
  typicalRpm: number | null;
  ageDays: number | null;
  today: string;
  notes: string[];
};

export async function getVideoAnalytics(teamId: string, platform: SocialPlatform, id: string, o: { tz: string; revenueAllowed: boolean; currency: string | null; today: string }): Promise<VideoPageData | null> {
  const supabase = await createClient();
  const vis = await numbersVisibility(supabase, teamId);
  if (!vis.platforms.has(platform)) return null;
  const money = o.revenueAllowed && (platform === "youtube" || platform === "facebook");

  // Every video of this platform (for "typical"), then the one asked for.
  const contentAll = await all((a, b) =>
    supabase
      .from("analytics_content")
      .select("*, short_videos(entry_number, short_type), long_video_projects(entry_number, video_type, hook)")
      .eq("team_id", teamId)
      .eq("platform", platform)
      .order("published_at", { ascending: false, nullsFirst: false })
      .range(a, b),
    3000
  );
  const rows = visibleRows(contentAll, vis);
  const me = rows.find((r) => r.external_id === id);
  if (!me) return null;

  const stored = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const display = o.currency && isCurrencyCode(o.currency) ? o.currency : stored;
  const [curves, moneyRows, fx, hooks, siblingsAll, breakdowns, dayCols] = await Promise.all([
    all((a, b) => supabase.from("analytics_retention").select("external_id, points").eq("team_id", teamId).eq("platform", platform).range(a, b), 3000),
    money ? all((a, b) => supabase.from("analytics_content_revenue").select("*").eq("team_id", teamId).eq("platform", platform).range(a, b), 3000) : Promise.resolve([] as Row[]),
    money ? getFxRates() : Promise.resolve(null),
    hooksFor(supabase, [me]),
    // The same short (or long video) on the other platforms.
    me.short_id || me.project_id
      ? supabase
          .from("analytics_content")
          .select("platform, external_id, kind, title, url, thumbnail_url, published_at, views, likes, comments, shares")
          .eq("team_id", teamId)
          .eq(me.short_id ? "short_id" : "project_id", (me.short_id ?? me.project_id) as string)
          .neq("platform", platform)
          .limit(12)
          .then((r) => ((r.data ?? []) as Row[]))
      : Promise.resolve([] as Row[]),
    platform === "youtube" ? getVideoBreakdowns(teamId, platform, id) : Promise.resolve(null),
    contentDayCols(),
  ]);
  const conv = (amount: number | null, from: unknown) => {
    if (amount === null) return null;
    const cur = isCurrencyCode(from) ? (from as string) : stored;
    return cur === display ? amount : convert(amount, cur, display, fx) ?? amount;
  };
  const curveOf = new Map(curves.map((r) => [r.external_id as string, readCurve(r.points)]));
  const moneyOf = new Map(moneyRows.map((r) => [r.external_id as string, r]));
  const toVideo = videoMapper({ platform, tz: o.tz, curveOf, moneyOf, hooks, conv });
  const videos = withScores(rows.map(toVideo));
  const video = videos.find((v) => v.id === id)!;
  const sameKind = videos.filter((v) => v.kind === video.kind);

  // "Typical": the (up to) 30 of the same kind posted just before it; a
  // channel's first videos are measured against everyone else instead.
  const before = sameKind.filter((v) => v.id !== id && v.publishedAt && video.publishedAt && v.publishedAt < video.publishedAt).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).slice(0, PEERS);
  const peers = before.length >= 5 ? before : sameKind.filter((v) => v.id !== id).slice(0, PEERS * 2);
  const med = (get: (v: AdvVideo) => number | null) => median(peers.map(get).filter((x): x is number => x !== null));
  const rank = (get: (v: AdvVideo) => number | null, low = false) => rankOf(sameKind, id, get, low);
  const eng = (v: AdvVideo) => (v.views ? (((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0) + (v.saves ?? 0)) / v.views) * 100 : null);
  const likeRate = (v: AdvVideo) => (v.views && v.likes !== null ? (v.likes / v.views) * 100 : null);
  const hold = (v: AdvVideo) => {
    const h = v.kind === "long" ? v.retention?.at30s : v.retention?.at3s;
    return h === null || h === undefined ? null : h * 100;
  };
  const watchH = (v: AdvVideo) => (v.watchMinutes === null ? null : v.watchMinutes / 60);
  const subsPer1k = (v: AdvVideo) => (v.views && v.subscribersGained !== null ? (v.subscribersGained / v.views) * 1000 : null);
  const defs: { key: string; label: string; get: (v: AdvVideo) => number | null; format: VideoKey["format"]; good?: "up" | "down" }[] = [
    { key: "views", label: platform === "facebook" ? "Plays" : "Views", get: (v) => v.views, format: "compact" },
    { key: "impressions", label: "Impressions", get: (v) => v.impressions, format: "compact" },
    { key: "ctr", label: "Impressions CTR", get: (v) => v.ctr, format: "pct" },
    { key: "engaged_views", label: "Engaged views", get: (v) => v.engagedViews, format: "compact" },
    { key: "reach", label: "Reach", get: (v) => v.reach ?? v.metrics.reach ?? null, format: "compact" },
    { key: "watch_hours", label: "Watch time", get: watchH, format: "hours" },
    { key: "avg_view", label: platform === "youtube" ? "Average view duration" : "Average watch time", get: (v) => v.avgViewSeconds, format: "seconds" },
    { key: "avg_pct", label: "Average % viewed", get: (v) => v.avgViewPct, format: "pct" },
    { key: "hold", label: video.kind === "long" ? "Still watching after 30 s" : "Still watching after 3 s", get: hold, format: "pct" },
    { key: "skip", label: "Skipped in 3 s", get: (v) => v.skipRate, format: "pct", good: "down" },
    { key: "likes", label: platform === "facebook" ? "Reactions" : "Likes", get: (v) => v.likes, format: "compact" },
    { key: "comments", label: "Comments", get: (v) => v.comments, format: "compact" },
    { key: "shares", label: "Shares", get: (v) => v.shares, format: "compact" },
    { key: "saves", label: "Saves", get: (v) => v.saves, format: "compact" },
    { key: "reposts", label: "Reposts", get: (v) => v.reposts, format: "compact" },
    { key: "replays", label: "Replays", get: (v) => v.metrics.replays ?? null, format: "compact" },
    { key: "engagement", label: "Engagement rate", get: eng, format: "pct" },
    { key: "like_rate", label: "Like rate", get: likeRate, format: "pct" },
    { key: "subs", label: platform === "youtube" ? "Subscribers gained" : "Followers gained", get: (v) => v.subscribersGained ?? v.metrics.followers_gained ?? null, format: "compact" },
    { key: "subs_per_1k", label: "Subscribers per 1,000 views", get: subsPer1k, format: "decimal" },
  ];
  const keys: VideoKey[] = defs
    .map((d) => ({ key: d.key, label: d.label, value: d.get(video), typical: med(d.get), format: d.format, good: d.good, rank: rank(d.get, d.good === "down") }))
    // A number this platform doesn't share for it isn't shown.
    .filter((k) => k.value !== null);
  if (video.revenue && money) {
    keys.push({ key: "revenue", label: platform === "youtube" ? "Estimated revenue" : "Earnings", value: video.revenue.revenue, typical: med((v) => v.revenue?.revenue ?? null), format: "money", rank: rank((v) => v.revenue?.revenue ?? null) });
    keys.push({ key: "rpm", label: "Per 1,000 views (RPM)", value: video.revenue.rpm, typical: med((v) => v.revenue?.rpm ?? null), format: "money", rank: rank((v) => v.revenue?.rpm ?? null) });
  }

  // ---- Day by day ---------------------------------------------------------------
  const ids = [id, ...peers.map((p) => p.id)];
  const dayRows: Row[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    dayRows.push(
      ...(await all((a, b) =>
        supabase
          .from("analytics_content_days")
          // This video's every number per day; the others only need their views (for "typical").
          .select(i === 0 ? dayCols : DAY_COLS)
          .eq("team_id", teamId)
          .eq("platform", platform)
          .in("external_id", ids.slice(i, i + 40))
          .order("day")
          .range(a, b),
        20_000
      ))
    );
  }
  const byVideo = new Map<string, Row[]>();
  for (const r of dayRows) byVideo.set(r.external_id as string, [...(byVideo.get(r.external_id as string) ?? []), r]);
  const asDay = (r: Row): DayRow => ({ day: r.day as string, source: r.source === "total" ? "total" : "daily", views: n(r.views) });
  const lastDay = addDays(o.today, -1);
  const postedDay = video.day ?? (video.publishedAt ? video.publishedAt.slice(0, 10) : null);
  const ageDays = postedDay ? Math.max(0, Math.round((Date.parse(`${o.today}T00:00:00Z`) - Date.parse(`${postedDay}T00:00:00Z`)) / 86_400_000)) : null;

  const byDay = (a: Row, b: Row) => String(a.day).localeCompare(String(b.day));
  // (A day can have only its impressions and CTR, 1.19.0: those aren't days with views.)
  const hasViews = (r: Row) => r.views !== null && r.views !== undefined;
  const mineRows = [...(byVideo.get(id) ?? [])].filter(hasViews).sort(byDay);
  let daily: VideoPageData["daily"] = null;
  if (mineRows.length) {
    const src = mineRows.some((r) => r.source === "daily") ? "daily" : "total";
    const list = mineRows.filter((r) => (r.source === "total" ? "total" : "daily") === src);
    const first = list[0].day as string;
    const last = list[list.length - 1].day as string;
    const days = dayList(first < (postedDay ?? first) ? postedDay ?? first : first, last);
    if (src === "daily") {
      const m = new Map(list.map((r) => [r.day as string, r]));
      // Impressions and CTR come on their own rows too (days without views yet): every row of the video.
      const reach = new Map(((byVideo.get(id) ?? []) as Row[]).map((r) => [r.day as string, r]));
      const col = (f: string) => days.map((d) => n(m.get(d)?.[f]));
      daily = {
        days,
        views: days.map((d) => n(m.get(d)?.views) ?? 0),
        watchMinutes: col("watch_minutes"),
        likes: col("likes"),
        comments: col("comments"),
        shares: col("shares"),
        subs: col("subscribers_gained"),
        avgView: col("avg_view_seconds"),
        impressions: days.map((d) => n(reach.get(d)?.impressions)),
        ctr: days.map((d) => n(reach.get(d)?.ctr)),
        source: "daily",
      };
    } else if (postedDay) {
      // Running totals: each day's views is the change to the next copy.
      const cum = cumulativeByAge(list.map(asDay), postedDay, 3650, last);
      const per = perDayFrom(cum);
      const offset = Math.max(0, Math.round((Date.parse(`${days[0]}T00:00:00Z`) - Date.parse(`${postedDay}T00:00:00Z`)) / 86_400_000));
      const none = days.map(() => null);
      daily = { days, views: days.map((_, i) => per[offset + i] ?? null), watchMinutes: none, likes: none, comments: none, shares: none, subs: none, avgView: none, impressions: none, ctr: none, source: "total" };
    }
    if (daily && !daily.views.some((v) => v !== null && v > 0)) daily = null;
  }

  let growth: VideoPageData["growth"] = null;
  const milestones: VideoPageData["milestones"] = [];
  if (postedDay && ageDays !== null) {
    const len = Math.min(GROWTH_DAYS, ageDays) + 1;
    const mine = cumulativeByAge(mineRows.map(asDay), postedDay, len - 1, lastDay);
    const peerCurves = peers
      .map((p) => {
        const pd = p.day ?? (p.publishedAt ? p.publishedAt.slice(0, 10) : null);
        return pd ? cumulativeByAge((byVideo.get(p.id) ?? []).filter(hasViews).map(asDay), pd, len - 1, lastDay) : [];
      })
      .filter((c) => c.some((v) => v !== null));
    let typical = typicalCurve(peerCurves, len);
    // A typical line only where it says something: at least 3 days next to this one's.
    const overlap = mine.filter((v, i) => v !== null && typical[i] !== null).length;
    if (overlap < 3) typical = typical.map(() => null);
    if (mine.some((v) => v !== null)) {
      growth = { mine, typical, typicalFrom: overlap < 3 ? 0 : peerCurves.length, versus: overlap < 3 ? null : versusTypical(mine, typical) };
      // "By day N": everything up to the end of the Nth day (day 1 = the day it was posted).
      for (const d of [1, 2, 7, 14, 30, 60]) {
        if (d - 1 < mine.length && mine[d - 1] !== null) milestones.push({ day: d, views: mine[d - 1]!, typical: typical[d - 1] ?? null });
      }
    }
  }
  // YouTube can send any video's whole day-by-day history: worth asking when the start is missing.
  const firstDaily = mineRows.find((r) => r.source === "daily")?.day as string | undefined;
  const latestDaily = [...mineRows].reverse().find((r) => r.source === "daily")?.day as string | undefined;
  const canFill = platform === "youtube" && !!postedDay && (!firstDaily || firstDaily > addDays(postedDay, 1) || !latestDaily || latestDaily < addDays(o.today, -5));

  // ---- Retention: this one against the average of its kind ------------------------
  let retention: VideoPageData["retention"] = null;
  if (video.curve) {
    const others = sameKind.filter((v) => v.id !== id).map((v) => curveOf.get(v.id) ?? []).filter((c): c is RetentionPoint[] => c.length >= 2);
    const avg = others.length >= 3 ? resample(averageCurve(others), 51).map((v) => (v === null ? null : Math.round(v * 1000) / 1000)) : null;
    retention = { mine: video.curve, average: avg, averageCount: others.length };
  }

  // ---- The same short elsewhere ---------------------------------------------------
  const siblingRows = visibleRows(siblingsAll, vis);
  const siblings: Sibling[] = siblingRows
    .map((r) => ({
      platform: r.platform as SocialPlatform,
      id: r.external_id as string,
      title: (r.title as string | null) ?? null,
      kind: r.kind as AdvVideo["kind"],
      views: n(r.views),
      likes: n(r.likes),
      comments: n(r.comments),
      shares: n(r.shares),
      url: typeof r.url === "string" && /^https?:\/\//i.test(r.url) ? r.url : null,
      thumbnail: typeof r.thumbnail_url === "string" && /^https?:\/\//i.test(r.thumbnail_url) ? r.thumbnail_url : null,
      score: null,
      publishedAt: (r.published_at as string | null) ?? null,
    }))
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1));

  const live = await liveFor(supabase, teamId, platform, id, (me.live_at as string | null | undefined) ?? null);

  const notes: string[] = [];
  if (platform !== "youtube") {
    const firstCopy = mineRows.find((r) => r.source === "total")?.day as string | undefined;
    notes.push(`${NAME[platform]} only shares running totals, so its day-by-day views come from ClipTroop's copy each morning${firstCopy && postedDay && firstCopy > addDays(postedDay, 1) ? ` (this one's from ${niceDayText(firstCopy)} on)` : ""}.`);
  }
  const peerWord = video.kind === "long" ? "long videos" : video.kind === "post" ? "posts" : platform === "youtube" ? "Shorts" : platform === "tiktok" ? "videos" : "Reels";
  const typicalRpm = money ? med((v) => v.revenue?.rpm ?? null) : null;

  return {
    video,
    peerWord,
    peerCount: sameKind.length,
    keys,
    daily,
    growth,
    milestones,
    canFill,
    retention,
    breakdowns,
    live,
    siblings,
    currency: display,
    typicalRpm,
    ageDays,
    today: o.today,
    notes,
  };
}

const NAME: Record<SocialPlatform, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

/** One video's live counts (analytics_live, 0083): the last 48 hours, the last 60 minutes, per hour. */
async function liveFor(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string, platform: SocialPlatform, id: string, at: string | null): Promise<VideoPageData["live"]> {
  const HOUR = 3_600_000;
  const now = Date.now();
  const { data, error } = await supabase
    .from("analytics_live")
    .select("at, views")
    .eq("team_id", teamId)
    .eq("platform", platform)
    .eq("external_id", id)
    .gte("at", new Date(now - 60 * HOUR).toISOString())
    .order("at")
    .limit(1000);
  if (error) return null;
  const points = ((data ?? []) as Row[]).map((r) => ({ at: Date.parse(String(r.at)), views: n(r.views) }));
  if (!points.length && !at) return null;
  return {
    at,
    views48: points.length > 1 ? gainedBetween(points, now - 48 * HOUR) : null,
    views60: points.length > 1 ? gainedBetween(points, now - HOUR) : null,
    hours: perHour(points, now, 48).map((h) => ({ at: new Date(h.at).toISOString(), views: h.views })),
    minutes: perSlot(points, now, 6, 600_000).map((m) => ({ at: new Date(m.at).toISOString(), views: m.views })),
  };
}

/** analytics_content_days' columns for a video's page: every number per day (each migration's, once it has run). */
const DAY_COLS = "external_id, day, source, views, watch_minutes";
const DAY_COLS_REACH = `${DAY_COLS}, likes, comments, shares, impressions, ctr`;
const DAY_COLS_ALL = `${DAY_COLS_REACH}, subscribers_gained, avg_view_seconds`;
const contentDayCols = cache(async (): Promise<string> => {
  const supabase = await createClient();
  for (const cols of [DAY_COLS_ALL, DAY_COLS_REACH]) {
    const { error } = await supabase.from("analytics_content_days").select(cols).limit(1);
    if (!error) return cols;
  }
  return DAY_COLS;
});
const niceDayText = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The video and the ones that make its "typical", for filling in YouTube's day-by-day history. */
export async function historyToFill(teamId: string, id: string, today: string): Promise<{ id: string; from: string; to: string }[]> {
  const supabase = await createClient();
  const vis = await numbersVisibility(supabase, teamId);
  if (!vis.platforms.has("youtube")) return [];
  const rows = visibleRows(
    await all((a, b) => supabase.from("analytics_content").select("platform, external_id, kind, published_at, views").eq("team_id", teamId).eq("platform", "youtube").order("published_at", { ascending: false, nullsFirst: false }).range(a, b), 3000),
    vis
  );
  const me = rows.find((r) => r.external_id === id);
  if (!me?.published_at) return [];
  const posted = (me.published_at as string).slice(0, 10);
  const end = addDays(today, -1);
  const before = rows.filter((r) => r.kind === me.kind && r.external_id !== id && r.published_at && (r.published_at as string) < (me.published_at as string)).slice(0, PEERS);
  const ids = [id, ...before.map((r) => r.external_id as string)];
  // Days with views (a day with only impressions and CTR doesn't count).
  const data = await all((a, b) =>
    supabase.from("analytics_content_days").select("external_id, day").eq("team_id", teamId).eq("platform", "youtube").eq("source", "daily").not("views", "is", null).in("external_id", ids).order("day").order("external_id").range(a, b)
  );
  const span = new Map<string, { first: string; last: string }>();
  for (const r of data) {
    const k = r.external_id as string;
    const d = r.day as string;
    const s = span.get(k);
    span.set(k, { first: s && s.first < d ? s.first : d, last: s && s.last > d ? s.last : d });
  }
  const out: { id: string; from: string; to: string }[] = [];
  const mine = span.get(id);
  // This video: its whole life (up to 3 years), when the start or the last days are missing.
  if (!mine || mine.first > addDays(posted, 1) || mine.last < addDays(today, -5)) out.push({ id, from: posted < addDays(today, -1095) ? addDays(today, -1095) : posted, to: end });
  // The others: their first weeks (enough for "typical"), the closest ones first.
  for (const r of before) {
    if (out.length >= 9) break;
    const p = (r.published_at as string).slice(0, 10);
    const s = span.get(r.external_id as string);
    if (s && s.first <= addDays(p, 1)) continue;
    const to = addDays(p, GROWTH_DAYS);
    out.push({ id: r.external_id as string, from: p, to: to < end ? to : end });
  }
  return out;
}

/** Every row (1,000 at a time). */
async function all(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, cap = 20_000): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error || !data) break;
    out.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

