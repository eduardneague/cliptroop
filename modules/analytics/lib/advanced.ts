import "server-only";
import { createClient } from "@/lib/supabase/server";
import { convert, getFxRates, isCurrencyCode } from "@/lib/fx";
import type { SocialPlatform } from "@/lib/social/providers";
import { addDays, dayList, type Window } from "./ranges";
import { numbersVisibility, visibleRows } from "./accounts";
import { getPlatformStatus, safeUrl, type PlatformStatus } from "./queries";
import { averageCurve, readCurve, resample, summarize, type RetentionPoint, type RetentionSummary } from "./retention";
import { crossPlatform, findPatterns, type Finding, type PatternVideo, type Patterns } from "./patterns";
import { breakdownHref, breakdownLabel, DIMENSIONS, METRIC_HELP } from "./advanced-labels";
import { hookFromScript, pickScript } from "./hooks";
import { outlierScores } from "./scores";

/*
 * The Advanced tab (1.16.0): every number the platforms share, for one
 * platform at a time. Read with the person's own client (RLS: their teams
 * only; money only for the people who see revenue), for the accounts
 * connected now only.
 */

type Row = Record<string, unknown>;
type Supa = Awaited<ReturnType<typeof createClient>>;
export type Content = "all" | "shorts" | "long";
export type Fmt = "int" | "compact" | "pct" | "seconds" | "hours" | "money" | "decimal";

export type AdvTile = { key: string; label: string; value: number | null; prev: number | null; format: Fmt; good?: "up" | "down" | "none"; hint?: string };
export type AdvGroup = { id: string; title: string; tiles: AdvTile[] };
export type AdvSeries = { key: string; label: string; format: Fmt; values: (number | null)[]; prev: (number | null)[] };
export type AdvRow = { key: string; label: string; views: number | null; watchMinutes: number | null; value: number | null; prevViews: number | null; prevValue: number | null; href: string | null };
export type AdvBreakdown = { id: string; title: string; sub: string; measure: "views" | "value"; percent: boolean; valueLabel: string | null; rows: AdvRow[] };
export type AdvVideo = {
  platform: SocialPlatform;
  id: string;
  kind: "short" | "long" | "post";
  title: string | null;
  url: string | null;
  thumbnail: string | null;
  publishedAt: string | null;
  hour: number | null;
  weekday: number | null;
  durationSec: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  engagedViews: number | null;
  watchMinutes: number | null;
  avgViewSeconds: number | null;
  avgViewPct: number | null;
  subscribersGained: number | null;
  skipRate: number | null;
  reposts: number | null;
  /** YouTube (1.19.0): thumbnail impressions and their click-through rate (%), over the days YouTube keeps. */
  impressions: number | null;
  ctr: number | null;
  /** Every other number this platform shares for it (premium_views, card_clicks, replays…). */
  metrics: Record<string, number>;
  revenue: { revenue: number | null; rpm: number | null; cpm: number | null; playbackCpm: number | null; adImpressions: number | null; monetizedPlaybacks: number | null } | null;
  retention: RetentionSummary | null;
  /** The retention curve at 51 even steps (0%, 2% … 100%). */
  curve: (number | null)[] | null;
  ours: { kind: "short" | "long"; id: string; number: number | null; type: string | null } | null;
  hook: string | null;
  /** The day it was posted, in the team's time zone. */
  day: string | null;
  /** Views ÷ the typical views of the same kind posted before it (1.17.0, lib/scores.ts). */
  score: number | null;
  /** Those typical views. */
  typical: number | null;
};
export type AdvancedData = {
  platform: SocialPlatform;
  content: Content;
  /** Which platforms can be picked (connected, numbers allowed). */
  platforms: { platform: SocialPlatform; usable: boolean }[];
  status: PlatformStatus[];
  days: string[];
  groups: AdvGroup[];
  series: AdvSeries[];
  retention: { shorts: RetentionPoint[]; long: RetentionPoint[]; counts: { shorts: number; long: number }; shortsSummary: RetentionSummary | null; longSummary: RetentionSummary | null } | null;
  breakdowns: AdvBreakdown[];
  videos: AdvVideo[];
  patterns: { short: Patterns | null; long: Patterns | null; cross: Finding | null };
  revenueAllowed: boolean;
  currency: string;
  notes: string[];
  hasData: boolean;
};

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const metric = (r: Row | undefined, k: string) => n((r?.metrics as Row | undefined)?.[k]);

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

/** Sum over days (null when no day has a number). */
function sum(days: string[], f: (d: string) => number | null) {
  let s = 0;
  let any = false;
  for (const d of days) {
    const v = f(d);
    if (v !== null && Number.isFinite(v)) {
      s += v;
      any = true;
    }
  }
  return any ? s : null;
}
/** An average over days, weighted (by views, say). */
function weighted(days: string[], value: (d: string) => number | null, weight: (d: string) => number | null) {
  let s = 0;
  let w = 0;
  for (const d of days) {
    const v = value(d);
    const k = weight(d);
    if (v === null || k === null || !(k > 0)) continue;
    s += v * k;
    w += k;
  }
  return w ? s / w : null;
}
const ratio = (a: number | null, b: number | null, times = 1) => (a === null || b === null || !b ? null : (a / b) * times);

/** The window snapshot that matches the range (YouTube: 7 / 28 / 90 / 365; Instagram: up to 28). */
function spanFor(platform: SocialPlatform, days: number) {
  if (platform === "instagram") return days <= 7 ? 7 : 28;
  return days <= 7 ? 7 : days <= 28 ? 28 : days <= 90 ? 90 : 365;
}
const spanWords = (span: number) => (span === 365 ? "the last 12 months" : `the last ${span} days`);

export async function getAdvanced(teamId: string, w: Window, o: { platform: SocialPlatform | null; content: Content; tz: string; revenueAllowed: boolean; currency: string | null }): Promise<AdvancedData> {
  const supabase = await createClient();
  const [status, vis] = await Promise.all([getPlatformStatus(teamId), numbersVisibility(supabase, teamId)]);
  const platforms = (["youtube", "instagram", "facebook", "tiktok"] as SocialPlatform[]).map((p) => ({ platform: p, usable: vis.platforms.has(p) && !!status.find((s) => s.platform === p)?.statsReady }));
  // The one asked for; otherwise the first with numbers.
  const platform = o.platform ?? platforms.find((p) => p.usable)?.platform ?? "youtube";
  const content: Content = platform === "youtube" ? o.content : "all";
  const days = dayList(w.from, w.to);
  const prevDays = dayList(w.prevFrom, w.prevTo);
  const stored = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const empty: AdvancedData = {
    platform,
    content,
    platforms,
    status,
    days,
    groups: [],
    series: [],
    retention: null,
    breakdowns: [],
    videos: [],
    patterns: { short: null, long: null, cross: null },
    revenueAllowed: o.revenueAllowed,
    currency: o.currency ?? stored,
    notes: [],
    hasData: false,
  };
  if (!vis.platforms.has(platform)) return empty;

  const span = spanFor(platform, w.days);
  const money = o.revenueAllowed && (platform === "youtube" || platform === "facebook");
  const [dailyAll, sums, prevSums, windows, contentAll, curves, revenueRows, videoMoney, countries, fx] = await Promise.all([
    all((a, b) => supabase.from("analytics_daily").select("*").eq("team_id", teamId).eq("platform", platform).gte("day", addDays(w.prevFrom, -1)).lte("day", addDays(w.to, 1)).order("day").range(a, b)),
    supabase.rpc("analytics_breakdown_sums", { p_team: teamId, p_platform: platform, p_from: w.from, p_to: w.to }),
    supabase.rpc("analytics_breakdown_sums", { p_team: teamId, p_platform: platform, p_from: w.prevFrom, p_to: w.prevTo }),
    all((a, b) => supabase.from("analytics_breakdowns").select("dimension, key, day, span, views, watch_minutes, value").eq("team_id", teamId).eq("platform", platform).eq("external_id", "").neq("span", 1).range(a, b), 6000),
    // Every platform's videos (the cross-platform comparison needs them all).
    all((a, b) =>
      supabase
        .from("analytics_content")
        .select("*, short_videos(entry_number, short_type), long_video_projects(entry_number, video_type, hook)")
        .eq("team_id", teamId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(a, b),
      1500
    ),
    all((a, b) => supabase.from("analytics_retention").select("external_id, points").eq("team_id", teamId).eq("platform", platform).range(a, b), 1000),
    money ? all((a, b) => supabase.from("analytics_revenue_daily").select("*").eq("team_id", teamId).eq("platform", platform).gte("day", w.prevFrom).lte("day", w.to).range(a, b)) : Promise.resolve([] as Row[]),
    money ? all((a, b) => supabase.from("analytics_content_revenue").select("*").eq("team_id", teamId).eq("platform", platform).range(a, b), 2000) : Promise.resolve([] as Row[]),
    platform === "youtube"
      ? all((a, b) => supabase.from("analytics_countries").select("country, value, watch_minutes").eq("team_id", teamId).eq("platform", "youtube").eq("metric", "views").gte("day", w.from).lte("day", w.to).range(a, b))
      : supabase
          .from("analytics_countries")
          .select("country, value, day")
          .eq("team_id", teamId)
          .eq("platform", platform)
          .eq("metric", "followers")
          .order("day", { ascending: false })
          .limit(400)
          .then((r) => ((r.data ?? []) as Row[])),
    money ? getFxRates() : Promise.resolve(null),
  ]);

  // Only the accounts connected now.
  const daily = visibleRows(dailyAll, vis);
  const contentRows = visibleRows(contentAll, vis);
  const display = o.currency && isCurrencyCode(o.currency) ? o.currency : stored;
  const conv = (amount: number | null, from: unknown) => {
    if (amount === null) return null;
    const cur = isCurrencyCode(from) ? (from as string) : stored;
    if (cur === display) return amount;
    return convert(amount, cur, display, fx) ?? amount;
  };

  const rowsOf = (c: string) => new Map(daily.filter((r) => r.content === c).map((r) => [r.day as string, r]));
  const at = rowsOf(content);
  const allRows = rowsOf("all");
  const get = (d: string, k: string) => n(at.get(d)?.[k]);
  const getM = (d: string, k: string) => metric(at.get(d), k);
  // Running totals copied each morning (TikTok, followers): the change over a day.
  const delta = (map: Map<string, Row>, d: string, k: string) => {
    const a = n(map.get(d)?.[k]);
    const b = n(map.get(addDays(d, 1))?.[k]);
    return a !== null && b !== null ? Math.max(0, b - a) : null;
  };
  const latest = (map: Map<string, Row>, k: string) => {
    const r = [...map.values()].filter((x) => n(x[k]) !== null).sort((a, b) => String(b.day).localeCompare(String(a.day)))[0];
    return r ? n(r[k]) : null;
  };
  const followersNet = (list: string[]) => {
    const gained = sum(list, (d) => n(allRows.get(d)?.followers_gained));
    const lost = sum(list, (d) => n(allRows.get(d)?.followers_lost));
    if (gained !== null || lost !== null) return (gained ?? 0) - (lost ?? 0);
    const snaps = [...list, addDays(list[list.length - 1], 1)].map((d) => n(allRows.get(d)?.followers)).filter((x): x is number => x !== null);
    return snaps.length >= 2 ? snaps[snaps.length - 1] - snaps[0] : null;
  };

  // ---- Tiles and series -------------------------------------------------------
  type Def = { key: string; label: string; format: Fmt; good?: AdvTile["good"]; per: ((d: string) => number | null) | null; total: (list: string[]) => number | null; series?: boolean };
  const s = (per: (d: string) => number | null) => (list: string[]) => sum(list, per);
  const defs: { id: string; title: string; defs: Def[] }[] = [];
  const views = (d: string) => get(d, "views");

  if (platform === "youtube") {
    const watchH = (d: string) => (get(d, "watch_minutes") === null ? null : get(d, "watch_minutes")! / 60);
    const eng = (d: string) => {
      const parts = [get(d, "likes"), get(d, "comments"), get(d, "shares")].filter((x): x is number => x !== null);
      return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    };
    defs.push({
      id: "watching",
      title: "Views and watch time",
      defs: [
        { key: "views", label: "Views", format: "compact", per: views, total: s(views) },
        { key: "engaged_views", label: "Engaged views", format: "compact", per: (d) => get(d, "engaged_views"), total: s((d) => get(d, "engaged_views")) },
        { key: "watch_hours", label: "Watch time", format: "hours", per: watchH, total: s(watchH) },
        { key: "avg_view_seconds", label: "Average view duration", format: "seconds", per: (d) => get(d, "avg_view_seconds"), total: (l) => weighted(l, (d) => get(d, "avg_view_seconds"), views) },
        { key: "avg_view_pct", label: "Average % viewed", format: "pct", per: (d) => get(d, "avg_view_pct"), total: (l) => weighted(l, (d) => get(d, "avg_view_pct"), views) },
        { key: "premium_views", label: "YouTube Premium views", format: "compact", per: (d) => getM(d, "premium_views"), total: s((d) => getM(d, "premium_views")) },
        { key: "premium_watch_hours", label: "Premium watch time", format: "hours", per: (d) => (getM(d, "premium_watch_minutes") === null ? null : getM(d, "premium_watch_minutes")! / 60), total: s((d) => (getM(d, "premium_watch_minutes") === null ? null : getM(d, "premium_watch_minutes")! / 60)) },
      ],
    });
    defs.push({
      id: "engagement",
      title: "Engagement",
      defs: [
        { key: "likes", label: "Likes", format: "compact", per: (d) => get(d, "likes"), total: s((d) => get(d, "likes")) },
        { key: "dislikes", label: "Dislikes", format: "compact", good: "down", per: (d) => get(d, "dislikes"), total: s((d) => get(d, "dislikes")) },
        { key: "comments", label: "Comments", format: "compact", per: (d) => get(d, "comments"), total: s((d) => get(d, "comments")) },
        { key: "shares", label: "Shares", format: "compact", per: (d) => get(d, "shares"), total: s((d) => get(d, "shares")) },
        { key: "engagement_rate", label: "Engagement rate", format: "pct", per: (d) => ratio(eng(d), views(d), 100), total: (l) => ratio(sum(l, eng), sum(l, views), 100) },
        { key: "playlist_adds", label: "Added to playlists", format: "compact", per: (d) => get(d, "playlist_adds"), total: s((d) => get(d, "playlist_adds")) },
        { key: "playlist_removes", label: "Removed from playlists", format: "compact", good: "down", per: (d) => getM(d, "playlist_removes"), total: s((d) => getM(d, "playlist_removes")) },
        { key: "card_clicks", label: "Card clicks", format: "compact", per: (d) => getM(d, "card_clicks"), total: s((d) => getM(d, "card_clicks")) },
        { key: "card_ctr", label: "Card click rate", format: "pct", per: (d) => ratio(getM(d, "card_clicks"), getM(d, "card_impressions"), 100), total: (l) => ratio(sum(l, (d) => getM(d, "card_clicks")), sum(l, (d) => getM(d, "card_impressions")), 100) },
      ],
    });
    defs.push({
      id: "followers",
      title: "Subscribers",
      defs: [
        { key: "subs_gained", label: "Subscribers gained", format: "compact", per: (d) => get(d, "followers_gained"), total: s((d) => get(d, "followers_gained")) },
        { key: "subs_lost", label: "Subscribers lost", format: "compact", good: "down", per: (d) => get(d, "followers_lost"), total: s((d) => get(d, "followers_lost")) },
        {
          key: "subs_net",
          label: "Net subscribers",
          format: "compact",
          per: (d) => (get(d, "followers_gained") === null && get(d, "followers_lost") === null ? null : (get(d, "followers_gained") ?? 0) - (get(d, "followers_lost") ?? 0)),
          total: (l) => {
            const g = sum(l, (d) => get(d, "followers_gained"));
            const x = sum(l, (d) => get(d, "followers_lost"));
            return g === null && x === null ? null : (g ?? 0) - (x ?? 0);
          },
        },
        { key: "subs_per_1k", label: "Subscribers per 1,000 views", format: "decimal", per: null, total: (l) => ratio(sum(l, (d) => get(d, "followers_gained")), sum(l, views), 1000) },
      ],
    });
  } else if (platform === "instagram") {
    const inter = (d: string) => {
      const m = getM(d, "interactions");
      if (m !== null) return m;
      const parts = [get(d, "likes"), get(d, "comments"), get(d, "shares"), get(d, "saves")].filter((x): x is number => x !== null);
      return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    };
    defs.push({
      id: "watching",
      title: "Views and reach",
      defs: [
        { key: "views", label: "Views", format: "compact", per: views, total: s(views) },
        { key: "reach", label: "Reach (added up per day)", format: "compact", per: (d) => get(d, "reach"), total: s((d) => get(d, "reach")) },
        { key: "accounts_engaged", label: "Accounts engaged (per day, added up)", format: "compact", per: (d) => getM(d, "accounts_engaged"), total: s((d) => getM(d, "accounts_engaged")) },
        { key: "profile_link_taps", label: "Profile link taps", format: "compact", per: (d) => getM(d, "profile_link_taps"), total: s((d) => getM(d, "profile_link_taps")) },
      ],
    });
    defs.push({
      id: "engagement",
      title: "Engagement",
      defs: [
        { key: "interactions", label: "Interactions", format: "compact", per: inter, total: s(inter) },
        { key: "likes", label: "Likes", format: "compact", per: (d) => get(d, "likes"), total: s((d) => get(d, "likes")) },
        { key: "comments", label: "Comments", format: "compact", per: (d) => get(d, "comments"), total: s((d) => get(d, "comments")) },
        { key: "shares", label: "Shares", format: "compact", per: (d) => get(d, "shares"), total: s((d) => get(d, "shares")) },
        { key: "saves", label: "Saves", format: "compact", per: (d) => get(d, "saves"), total: s((d) => get(d, "saves")) },
        { key: "replies", label: "Story replies", format: "compact", per: (d) => getM(d, "replies"), total: s((d) => getM(d, "replies")) },
        { key: "reposts", label: "Reposts", format: "compact", per: (d) => getM(d, "reposts"), total: s((d) => getM(d, "reposts")) },
        { key: "engagement_rate", label: "Engagement rate", format: "pct", per: (d) => ratio(inter(d), views(d), 100), total: (l) => ratio(sum(l, inter), sum(l, views), 100) },
      ],
    });
  } else if (platform === "facebook") {
    const watchH = (d: string) => (getM(d, "video_watch_minutes") === null ? null : getM(d, "video_watch_minutes")! / 60);
    defs.push({
      id: "watching",
      title: "Views and watch time",
      defs: [
        { key: "views", label: "Views", format: "compact", per: views, total: s(views) },
        { key: "reach", label: "Reach (added up per day)", format: "compact", per: (d) => get(d, "reach"), total: s((d) => get(d, "reach")) },
        { key: "video_watch_hours", label: "Video watch time", format: "hours", per: watchH, total: s(watchH) },
        { key: "complete_views_30s", label: "30-second views", format: "compact", per: (d) => getM(d, "complete_views_30s"), total: s((d) => getM(d, "complete_views_30s")) },
        { key: "page_visits", label: "Page visits", format: "compact", per: (d) => getM(d, "page_visits"), total: s((d) => getM(d, "page_visits")) },
      ],
    });
    defs.push({
      id: "engagement",
      title: "Engagement",
      defs: [
        { key: "engagements", label: "Engagements", format: "compact", per: (d) => get(d, "engagements"), total: s((d) => get(d, "engagements")) },
        { key: "engagement_rate", label: "Engagement rate", format: "pct", per: (d) => ratio(get(d, "engagements"), views(d), 100), total: (l) => ratio(sum(l, (d) => get(d, "engagements")), sum(l, views), 100) },
      ],
    });
  } else {
    // The day's views worked out per video by the copy (1.19.0), else the change in the running total.
    const tv = (d: string) => n(allRows.get(d)?.views) ?? delta(allRows, d, "total_views");
    const tl = (d: string) => delta(allRows, d, "total_likes");
    defs.push({
      id: "watching",
      title: "Views and likes",
      defs: [
        { key: "views", label: "Views", format: "compact", per: tv, total: s(tv) },
        { key: "likes", label: "Likes", format: "compact", per: tl, total: s(tl) },
      ],
    });
  }
  if (platform !== "youtube")
    defs.push({
      id: "followers",
      title: "Followers",
      defs: [
        { key: "followers_gained", label: "New followers", format: "compact", per: (d) => n(allRows.get(d)?.followers_gained), total: s((d) => n(allRows.get(d)?.followers_gained)) },
        { key: "followers_lost", label: "Followers lost", format: "compact", good: "down", per: (d) => n(allRows.get(d)?.followers_lost), total: s((d) => n(allRows.get(d)?.followers_lost)) },
        { key: "followers_net", label: "Net followers", format: "compact", per: null, total: followersNet },
      ],
    });

  // Money (YouTube's estimate, Facebook's earnings), for the people who see revenue.
  if (money) {
    const rev = new Map(revenueRows.filter((r) => r.content === (platform === "youtube" ? content : "all")).map((r) => [r.day as string, r]));
    const amount = (d: string, k: string) => conv(n(rev.get(d)?.[k]), rev.get(d)?.currency);
    const plain = (d: string, k: string) => n(rev.get(d)?.[k]);
    const revenue = (d: string) => amount(d, "revenue");
    const withViews = (l: string[]) => l.filter((d) => rev.has(d) && views(d) !== null);
    defs.push({
      id: "money",
      title: platform === "youtube" ? "Money" : "Earnings",
      defs: [
        { key: "revenue", label: platform === "youtube" ? "Estimated revenue" : "Earnings", format: "money", per: revenue, total: s(revenue) },
        { key: "rpm", label: "Per 1,000 views (RPM)", format: "money", per: (d) => ratio(revenue(d), views(d), 1000), total: (l) => ratio(sum(withViews(l), revenue), sum(withViews(l), views), 1000) },
        ...(platform === "youtube"
          ? ([
              { key: "cpm", label: "CPM", format: "money", per: (d) => amount(d, "cpm"), total: (l) => weighted(l, (d) => amount(d, "cpm"), (d) => plain(d, "ad_impressions")) },
              { key: "playback_cpm", label: "Playback-based CPM", format: "money", per: (d) => amount(d, "playback_cpm"), total: (l) => weighted(l, (d) => amount(d, "playback_cpm"), (d) => plain(d, "monetized_playbacks")) },
              { key: "ad_impressions", label: "Ad impressions", format: "compact", per: (d) => plain(d, "ad_impressions"), total: s((d) => plain(d, "ad_impressions")) },
              { key: "monetized_playbacks", label: "Monetized playbacks", format: "compact", per: (d) => plain(d, "monetized_playbacks"), total: s((d) => plain(d, "monetized_playbacks")) },
              { key: "ad_revenue", label: "Ad revenue", format: "money", per: (d) => amount(d, "ad_revenue"), total: s((d) => amount(d, "ad_revenue")) },
              { key: "premium_revenue", label: "Premium revenue", format: "money", per: (d) => amount(d, "premium_revenue"), total: s((d) => amount(d, "premium_revenue")) },
              { key: "gross_revenue", label: "Gross revenue", format: "money", per: (d) => amount(d, "gross_revenue"), total: s((d) => amount(d, "gross_revenue")) },
            ] satisfies Def[])
          : []),
      ],
    });
  }

  const groups: AdvGroup[] = defs
    .map((g) => ({
      id: g.id,
      title: g.title,
      tiles: g.defs
        .map((d) => ({ key: d.key, label: d.label, value: d.total(days), prev: d.total(prevDays), format: d.format, good: d.good, hint: METRIC_HELP[d.key] }))
        // A number this platform never shares for this channel isn't shown at all.
        .filter((t) => t.value !== null || t.prev !== null),
    }))
    .filter((g) => g.tiles.length);
  // Followers right now, next to the change.
  const nowFollowers = latest(allRows, "followers");
  const fg = groups.find((g) => g.id === "followers");
  if (nowFollowers !== null) {
    const tile: AdvTile = { key: "followers_now", label: platform === "youtube" ? "Subscribers now" : "Followers now", value: nowFollowers, prev: null, format: "compact", good: "none", hint: METRIC_HELP.followers_now };
    if (fg) fg.tiles.unshift(tile);
    else groups.push({ id: "followers", title: platform === "youtube" ? "Subscribers" : "Followers", tiles: [tile] });
  }
  if (platform === "tiktok") {
    const tv = latest(allRows, "total_views");
    const tl = latest(allRows, "total_likes");
    const g = groups.find((x) => x.id === "watching") ?? (groups.unshift({ id: "watching", title: "Views and likes", tiles: [] }), groups[0]);
    if (tv !== null) g.tiles.push({ key: "total_views", label: "Views, all time", value: tv, prev: null, format: "compact", good: "none", hint: METRIC_HELP.total_views });
    if (tl !== null) g.tiles.push({ key: "total_likes", label: "Likes, all time", value: tl, prev: null, format: "compact", good: "none", hint: METRIC_HELP.total_likes });
  }
  const series: AdvSeries[] = defs
    .flatMap((g) => g.defs)
    .filter((d) => d.per)
    .map((d) => ({ key: d.key, label: d.label, format: d.format, values: days.map(d.per!), prev: prevDays.map(d.per!) }))
    .filter((x) => x.values.some((v) => v !== null));

  // ---- Breakdowns -----------------------------------------------------------
  const notes: string[] = [];
  const sumRows = ((sums.data ?? []) as Row[]).filter((r) => n(r.views) !== null || n(r.value) !== null);
  const prevSumRows = (prevSums.data ?? []) as Row[];
  const breakdowns: AdvBreakdown[] = [];
  const make = (id: string, sub: string, rows: Omit<AdvRow, "label" | "href">[]): AdvBreakdown | null => {
    const meta = DIMENSIONS[id];
    if (!meta || !rows.length) return null;
    const sorted = rows
      .map((r) => ({ ...r, label: id === "engaged_country" ? countryName(r.key) : breakdownLabel(id, r.key), href: breakdownHref(id, r.key) }))
      .sort((a, b) =>
        // Ages read best youngest first; everything else biggest first.
        id.endsWith("_age")
          ? parseInt(a.key.match(/\d+/)?.[0] ?? "0", 10) - parseInt(b.key.match(/\d+/)?.[0] ?? "0", 10)
          : meta.measure === "views"
            ? (b.views ?? 0) - (a.views ?? 0)
            : (b.value ?? 0) - (a.value ?? 0)
      );
    return { id, title: meta.title, sub, measure: meta.measure, percent: !!meta.percent, valueLabel: meta.valueLabel ?? null, rows: sorted };
  };
  const perDay = (dim: string) => {
    const prev = new Map(prevSumRows.filter((r) => r.dimension === dim).map((r) => [r.key as string, r]));
    return sumRows
      .filter((r) => r.dimension === dim)
      .map((r) => ({ key: r.key as string, views: n(r.views), watchMinutes: n(r.watch_minutes), value: n(r.value), prevViews: n(prev.get(r.key as string)?.views), prevValue: n(prev.get(r.key as string)?.value) }));
  };
  // A window: the one that matches the range, else the nearest one there is.
  const windowOf = (dim: string, wanted = span) => {
    const rows = windows.filter((r) => r.dimension === dim);
    const spans = [...new Set(rows.map((r) => Number(r.span)))];
    if (!spans.length) return null;
    const pick = spans.includes(wanted) ? wanted : spans.sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted))[0];
    const list = rows.filter((r) => Number(r.span) === pick);
    const day = list.map((r) => r.day as string).sort().pop() ?? null;
    return { span: pick, day, rows: list.filter((r) => r.day === day).map((r) => ({ key: r.key as string, views: n(r.views), watchMinutes: n(r.watch_minutes), value: n(r.value), prevViews: null, prevValue: null })) };
  };
  const windowSub = (x: { span: number; day: string | null }) => (x.span === 0 ? "As the platform has it now" : `${spanWords(x.span)[0].toUpperCase()}${spanWords(x.span).slice(1)}${x.day ? `, to ${niceDay(x.day)}` : ""}`);
  const push = (b: AdvBreakdown | null) => {
    if (b) breakdowns.push(b);
  };

  if (platform === "youtube") {
    if (content === "all") push(make("traffic_source", "Views in this range", perDay("traffic_source")));
    else {
      // Shorts or long videos only: the window that splits sources by kind.
      const tw = windowOf("traffic_by_type");
      if (tw) {
        const want = content === "shorts" ? ["SHORTS"] : ["VIDEO_ON_DEMAND", "LIVE_STREAM"];
        const merged = new Map<string, Omit<AdvRow, "label" | "href">>();
        for (const r of tw.rows) {
          const [type, src] = r.key.split("|");
          if (!want.includes(type)) continue;
          const cur = merged.get(src) ?? { key: src, views: 0, watchMinutes: 0, value: null, prevViews: null, prevValue: null };
          cur.views = (cur.views ?? 0) + (r.views ?? 0);
          cur.watchMinutes = (cur.watchMinutes ?? 0) + (r.watchMinutes ?? 0);
          merged.set(src, cur);
        }
        push(make("traffic_source", windowSub(tw), [...merged.values()]));
      }
    }
    for (const dim of ["search_term", "external_site", "suggested_by", "playlist"]) {
      const x = windowOf(dim);
      if (x) push(make(dim, windowSub(x), x.rows));
    }
    for (const dim of ["subscribed", "device", "os", "playback_location", "product"]) push(make(dim, "Views in this range", perDay(dim)));
    for (const dim of ["age_gender", "sharing"]) {
      const x = windowOf(dim);
      if (x) push(make(dim, windowSub(x), x.rows));
    }
  } else if (platform === "instagram") {
    for (const dim of ["viewer_type", "content_type", "interactions_by_type", "follows"]) {
      const x = windowOf(dim);
      if (x) push(make(dim, windowSub(x), x.rows));
    }
    for (const dim of ["follower_age", "follower_gender", "follower_city", "engaged_age", "engaged_gender", "engaged_country", "engaged_city"]) {
      const x = windowOf(dim, 0);
      if (x) push(make(dim, windowSub(x), x.rows));
    }
    if (w.days > 28 && breakdowns.length) notes.push("Instagram shares its splits for the last 28 days at most.");
  }
  // Countries (YouTube: views in the range; the others: followers, latest copy).
  if (platform === "youtube") {
    const by = new Map<string, { views: number; watch: number | null }>();
    for (const c of countries as Row[]) {
      const cur = by.get(c.country as string) ?? { views: 0, watch: null };
      cur.views += n(c.value) ?? 0;
      if (n(c.watch_minutes) !== null) cur.watch = (cur.watch ?? 0) + n(c.watch_minutes)!;
      by.set(c.country as string, cur);
    }
    if (by.size)
      breakdowns.push({
        id: "country",
        title: "Countries",
        sub: "Views in this range",
        measure: "views",
        percent: false,
        valueLabel: null,
        rows: [...by.entries()].map(([code, v]) => ({ key: code, label: countryName(code), views: v.views, watchMinutes: v.watch, value: null, prevViews: null, prevValue: null, href: null })).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)),
      });
  } else {
    const list = countries as Row[];
    const day = list[0]?.day;
    const rows = list.filter((r) => r.day === day).map((r) => ({ key: r.country as string, label: countryName(r.country as string), views: null, watchMinutes: null, value: n(r.value), prevViews: null, prevValue: null, href: null }));
    if (rows.length) breakdowns.push({ id: "country", title: "Followers by country", sub: "As the platform has it now", measure: "value", percent: false, valueLabel: "followers", rows: rows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)) });
  }

  // ---- Videos -------------------------------------------------------------------
  const curveOf = new Map(curves.map((r) => [r.external_id as string, readCurve(r.points)]));
  const moneyOf = new Map(videoMoney.map((r) => [r.external_id as string, r]));
  const hooks = await hooksFor(supabase, contentRows);
  const toVideo = videoMapper({ platform, tz: o.tz, curveOf, moneyOf, hooks, conv });
  const everything = withScores(contentRows.map(toVideo));
  const videos = everything.filter((v) => v.platform === platform && (content === "all" || (content === "shorts" ? v.kind === "short" : v.kind === "long")));

  // Retention: the average curve of Shorts and of long videos.
  let retention: AdvancedData["retention"] = null;
  if (platform === "youtube" || platform === "facebook") {
    const pts = (kind: "short" | "long") => everything.filter((v) => v.platform === platform && v.kind === kind).map((v) => curveOf.get(v.id) ?? []).filter((c) => c.length >= 2);
    const sc = pts("short");
    const lc = pts("long");
    if (sc.length || lc.length) {
      const avgDur = (kind: "short" | "long") => {
        const ds = everything.filter((v) => v.platform === platform && v.kind === kind && v.curve && v.durationSec).map((v) => v.durationSec!);
        return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
      };
      const sAvg = averageCurve(sc);
      const lAvg = averageCurve(lc);
      retention = { shorts: sAvg, long: lAvg, counts: { shorts: sc.length, long: lc.length }, shortsSummary: sAvg.length ? summarize(sAvg, avgDur("short")) : null, longSummary: lAvg.length ? summarize(lAvg, avgDur("long")) : null };
    }
  }

  // "What works".
  const asPattern = (v: AdvVideo): PatternVideo => ({
    platform: v.platform,
    id: v.id,
    kind: v.kind,
    title: v.title,
    publishedAt: v.publishedAt,
    durationSec: v.durationSec,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    shares: v.shares,
    saves: v.saves,
    avgViewPct: v.avgViewPct,
    skipRate: v.skipRate,
    subscribersGained: v.subscribersGained,
    // The hook's hold: 3 seconds into a short, 30 into a long video.
    hold3s: (v.kind === "long" ? v.retention?.at30s : v.retention?.at3s) ?? null,
    ourId: v.ours?.kind === "short" ? v.ours.id : null,
    shortType: (v.ours?.kind === "short" ? (v.ours.type as PatternVideo["shortType"]) : null) ?? null,
    hook: v.hook,
    hour: v.hour,
    weekday: v.weekday,
  });
  const pv = everything.map(asPattern);
  const patterns = {
    short: findPatterns(pv, { platform, kind: "short" }),
    long: platform === "youtube" ? findPatterns(pv, { platform, kind: "long" }) : null,
    cross: crossPlatform(pv),
  };

  if (platform === "instagram" || platform === "facebook") notes.push("Reach is added up per day here, so someone who saw posts on two days counts twice.");
  return {
    ...empty,
    groups,
    series,
    retention,
    breakdowns,
    videos,
    patterns,
    currency: display,
    notes,
    hasData: groups.length > 0 || videos.length > 0,
  };
}

/** The day, hour and weekday a moment falls on in a time zone. */
export function localParts(iso: string, tz: string): { day: string | null; hour: number | null; weekday: number | null } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const hour = Number(get("hour"));
    const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
    const day = get("year") && get("month") && get("day") ? `${get("year")}-${get("month")}-${get("day")}` : null;
    return { day, hour: Number.isFinite(hour) ? hour % 24 : null, weekday: wd >= 0 ? wd : null };
  } catch {
    return { day: null, hour: null, weekday: null };
  }
}

/**
 * analytics_content rows → videos (the Advanced page, a video's own page,
 * the Claude export). `curveOf` / `moneyOf` are keyed by external id;
 * retention curves only for `platform`.
 */
export function videoMapper(ctx: {
  platform: SocialPlatform;
  tz: string;
  curveOf: Map<string, RetentionPoint[]>;
  moneyOf: Map<string, Row>;
  hooks: Map<string, string>;
  conv: (amount: number | null, from: unknown) => number | null;
}): (r: Row) => AdvVideo {
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] ?? null : x ?? null);
  return (r: Row): AdvVideo => {
    const sv = one(r.short_videos as Row | Row[] | null);
    const lv = one(r.long_video_projects as Row | Row[] | null);
    const p = r.platform as SocialPlatform;
    const curve = p === ctx.platform ? ctx.curveOf.get(r.external_id as string) ?? [] : [];
    const dur = n(r.duration_seconds);
    const m = (r.metrics as Row | null) ?? {};
    const metrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) {
      if (n(v) !== null) metrics[k] = n(v)!;
      else if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v as Row)) if (n(v2) !== null) metrics[`${k}_${k2}`] = n(v2)!;
    }
    const mon = p === ctx.platform ? ctx.moneyOf.get(r.external_id as string) : undefined;
    const viewsN = n(r.views);
    const rev = mon ? ctx.conv(n(mon.revenue), mon.currency) : null;
    const when = r.published_at ? localParts(r.published_at as string, ctx.tz) : { day: null, hour: null, weekday: null };
    return {
      platform: p,
      id: r.external_id as string,
      kind: r.kind as AdvVideo["kind"],
      title: (r.title as string | null) ?? null,
      url: safeUrl(r.url),
      thumbnail: safeUrl(r.thumbnail_url),
      publishedAt: (r.published_at as string | null) ?? null,
      hour: when.hour,
      weekday: when.weekday,
      day: when.day,
      durationSec: dur,
      views: viewsN,
      likes: n(r.likes),
      comments: n(r.comments),
      shares: n(r.shares),
      saves: n(r.saves),
      reach: n(r.reach),
      engagedViews: n(r.engaged_views),
      watchMinutes: n(r.watch_minutes),
      avgViewSeconds: n(r.avg_view_seconds),
      avgViewPct: n(r.avg_view_pct),
      subscribersGained: n(r.subscribers_gained),
      skipRate: n(r.skip_rate),
      reposts: n(r.reposts),
      impressions: n(r.impressions),
      ctr: n(r.ctr),
      metrics,
      revenue: mon
        ? { revenue: rev, rpm: rev !== null && viewsN ? (rev / viewsN) * 1000 : null, cpm: ctx.conv(n(mon.cpm), mon.currency), playbackCpm: ctx.conv(n(mon.playback_cpm), mon.currency), adImpressions: n(mon.ad_impressions), monetizedPlaybacks: n(mon.monetized_playbacks) }
        : null,
      retention: curve.length >= 2 ? summarize(curve, dur) : null,
      curve: curve.length >= 2 ? resample(curve, 51).map((v) => (v === null ? null : Math.round(v * 1000) / 1000)) : null,
      ours: r.short_id ? { kind: "short", id: r.short_id as string, number: n(sv?.entry_number), type: (sv?.short_type as string | null) ?? null } : r.project_id ? { kind: "long", id: r.project_id as string, number: n(lv?.entry_number), type: ((lv?.video_type as string[] | null) ?? []).join(" + ") || null } : null,
      hook: ctx.hooks.get(`${r.short_id ? "s" : "l"}:${(r.short_id ?? r.project_id) as string}`) ?? null,
      score: null,
      typical: null,
    };
  };
}

/** Each video's "× typical" (against the same platform and kind). */
export function withScores(videos: AdvVideo[]): AdvVideo[] {
  const scores = outlierScores(videos.map((v) => ({ id: `${v.platform}:${v.id}`, platform: v.platform, kind: v.kind, publishedAt: v.publishedAt, views: v.views })));
  return videos.map((v) => {
    const s = scores.get(`${v.platform}:${v.id}`);
    return s ? { ...v, score: s.score, typical: s.typical } : v;
  });
}

const niceDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
let regions: Intl.DisplayNames | null = null;
/** "RO" → "Romania". */
const countryName = (code: string) => {
  try {
    regions ??= new Intl.DisplayNames(["en"], { type: "region" });
    return /^[A-Z]{2}$/.test(code) ? regions.of(code) ?? code : code;
  } catch {
    return code;
  }
};

/** Each linked video's hook: the script's (the used document), else the long video's Hook field. Keyed "s:<short>" / "l:<project>". */
export async function hooksFor(supabase: Supa, rows: Row[], full = false): Promise<Map<string, string>> {
  const shortIds = [...new Set(rows.map((r) => r.short_id as string | null).filter((x): x is string => !!x))];
  const longIds = [...new Set(rows.map((r) => r.project_id as string | null).filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  const docs: Row[] = [];
  const read = async (col: "short_video_id" | "long_video_id", ids: string[]) => {
    for (let i = 0; i < ids.length; i += 100) {
      const first = await supabase.from("scripts").select(`${col}, kind, step, position, content_text`).in(col, ids.slice(i, i + 100)).limit(1000);
      // Before migration 0062 there's no step: without it.
      const data = first.error ? (await supabase.from("scripts").select(`${col}, kind, position, content_text`).in(col, ids.slice(i, i + 100)).limit(1000)).data : first.data;
      docs.push(...((data ?? []) as unknown as Row[]));
    }
  };
  await Promise.all([shortIds.length ? read("short_video_id", shortIds) : null, longIds.length ? read("long_video_id", longIds) : null]);
  const by = new Map<string, Row[]>();
  for (const d of docs) {
    const k = d.short_video_id ? `s:${d.short_video_id}` : `l:${d.long_video_id}`;
    by.set(k, [...(by.get(k) ?? []), d]);
  }
  for (const [k, list] of by) {
    const doc = pickScript(list as { kind?: string | null; step?: string | null; position?: number | null; content_text?: string | null }[]);
    const text = (doc?.content_text as string | undefined) ?? null;
    const hook = full ? text?.trim() || null : hookFromScript(text);
    if (hook) out.set(k, hook);
  }
  // Long videos: the Hook from Ideate when the script has none.
  for (const r of rows) {
    if (!r.project_id || out.has(`l:${r.project_id}`)) continue;
    const lv = Array.isArray(r.long_video_projects) ? (r.long_video_projects as Row[])[0] : (r.long_video_projects as Row | null);
    const h = (lv?.hook as string | null)?.trim();
    if (h) out.set(`l:${r.project_id}`, h.slice(0, full ? 4000 : 300));
  }
  return out;
}

/** One video's own splits, for its details: traffic sources and search terms since it was published. */
export type VideoSplitRow = { dimension: string; key: string; label: string; views: number | null; watchMinutes: number | null; day: string };
export async function getVideoSplits(teamId: string, platform: SocialPlatform, id: string): Promise<{ traffic: VideoSplitRow[]; searches: VideoSplitRow[]; asOf: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from("analytics_breakdowns").select("dimension, key, views, watch_minutes, value, day").eq("team_id", teamId).eq("platform", platform).eq("external_id", id).eq("span", 0).limit(400);
  const rows: VideoSplitRow[] = ((data ?? []) as Row[]).map((r) => ({ dimension: r.dimension as string, key: r.key as string, label: breakdownLabel(r.dimension as string, r.key as string), views: n(r.views), watchMinutes: n(r.watch_minutes), day: r.day as string }));
  const pick = (dim: string) => rows.filter((r) => r.dimension === dim).sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  return { traffic: pick("traffic_source"), searches: pick("search_term"), asOf: rows[0]?.day ?? null };
}

