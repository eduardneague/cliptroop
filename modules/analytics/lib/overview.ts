import "server-only";
import { createClient } from "@/lib/supabase/server";
import { convert, getFxRates, isCurrencyCode } from "@/lib/fx";
import { PLATFORMS, type SocialPlatform } from "@/lib/social/providers";
import { addDays, dayIn, dayList, todayIn, type Window } from "./ranges";
import { numbersVisibility, visibleRows, type NumbersVisibility } from "./accounts";
import { all, contentCols, contentItem, dailyCols, getPlatformStatus, type ContentItem, type PlatformStatus } from "./queries";
import { outlierScores } from "./scores";
import { dailySeries, hourIndex, RATE_WEIGHT, TREND_KEYS, type DailyRow, type Num, type TrendKey } from "./trend-math";
import { liveHours, type Coverage } from "./live-hours";
import type { VideoKind } from "./kinds";

/*
 * Analytics → Overview (1.20.0): the numbers that matter for a range, per
 * platform and per day (or hour by hour for the last 48 hours, from the
 * 10-minute counts), the videos posted on each day of it, the newest videos
 * next to their usual, and (streamed after the page) what got the most
 * views in it. Read with the person's own rights; the accounts connected now
 * only.
 *
 * 1.22.0: the 48 hours come from lib/live-hours.ts (the hours before every
 * video was counted worked out from the account's totals, and marked), with
 * shares and engagement, and the numbers that only come per day (watch
 * time, subscribers, impressions, revenue…) for the last two days copied.
 * Live streams are YouTube's third kind. Lifetime says how far YouTube's
 * earlier days are copied.
 */

type Supa = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

export type OvKey = TrendKey | "revenue";
export type OvSeries = { now: Num[]; prev: Num[] };
export type OvMetric = {
  key: OvKey;
  /** Each platform with this number (now, and the same stretch before). */
  per: Partial<Record<SocialPlatform, OvSeries>>;
  /** Rates (CTR, average view): what each platform's rate is weighted by (impressions, views). */
  weights?: Partial<Record<SocialPlatform, OvSeries>>;
  /** YouTube's Shorts, long videos and live streams, when it splits this number. */
  split: { shorts: OvSeries; long: OvSeries; live: OvSeries | null; wShorts?: OvSeries; wLong?: OvSeries; wLive?: OvSeries } | null;
  /** Hour by hour: each platform's hours worked out from the account's totals (before every video was counted). */
  est?: Partial<Record<SocialPlatform, boolean[]>>;
  /** In the 48 hours, a number that only comes per day: the days it's for (the last two copied), instead of the hours. */
  days?: string[];
};
export type OvMarker = { i: number; platform: SocialPlatform; kind: VideoKind; title: string | null; id: string; thumbnail: string | null; at: string | null };
export type OvTop = ContentItem & { gained: number };
export type OvTopResult = { items: OvTop[]; exact: boolean };
export type Overview = {
  hourly: boolean;
  /** The range's days (YYYY-MM-DD), or its 48 hours (ISO, the hour going on now last). */
  points: string[];
  metrics: OvMetric[];
  /** Videos posted at each point (for the marks under the chart). */
  markers: OvMarker[];
  /** The newest videos, next to the usual of their kind. */
  latest: ContentItem[];
  status: PlatformStatus[];
  /** Revenue's currency (when it's shown). */
  currency: string | null;
  /** Hour by hour: since when there are counts (they fill in over 48 hours). */
  since: string | null;
  /** Hour by hour: per platform, since when every video is counted and how many hours were worked out instead. */
  coverage: Partial<Record<SocialPlatform, Coverage>> | null;
  /** YouTube's earlier days: how far back they're copied so far (null: nothing to say). */
  history: { from: string | null; done: boolean } | null;
  /** YouTube's channel now: all-time views and subscribers (the 10-minute job's, else the morning copy's). */
  youtube: { totalViews: number | null; subscribers: number | null; at: string | null } | null;
  hasData: boolean;
  /** Streamed: the videos that got the most views in the range (`exact` false: the most viewed posted in it, before 0084). */
  top: Promise<OvTopResult>;
};

const n = (v: unknown): Num => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const anyNum = (xs: Num[]) => xs.some((x) => x !== null);

export async function getOverview(
  teamId: string,
  w: Window,
  o: { hourly: boolean; tz: string; revenueAllowed: boolean; currency: string | null }
): Promise<Overview> {
  const supabase = await createClient();
  const [status, vis] = await Promise.all([getPlatformStatus(teamId), numbersVisibility(supabase, teamId)]);
  const shown = PLATFORMS.filter((p) => vis.platforms.has(p));
  const [data, youtube, history] = await Promise.all([
    o.hourly ? hourly(supabase, teamId, o, status, vis, shown) : daily(supabase, teamId, w, o, status, vis, shown),
    shown.includes("youtube") ? youtubeNow(supabase, teamId) : Promise.resolve(null),
    shown.includes("youtube") && w.lifetime && !o.hourly ? historyState(supabase, teamId) : Promise.resolve(null),
  ]);
  return { ...data, youtube, history };
}

/** How far back YouTube's days are copied (0085): the copy goes back a year at a time to the channel's first day. */
async function historyState(supabase: Supa, teamId: string): Promise<Overview["history"]> {
  const { data, error } = await supabase.from("analytics_syncs").select("history_from, history_done").eq("team_id", teamId).eq("platform", "youtube").maybeSingle();
  if (error || !data) return null;
  const r = data as { history_from: string | null; history_done: boolean | null };
  return { from: r.history_from ?? null, done: !!r.history_done };
}

/** YouTube's all-time views and subscribers now: the 10-minute job's totals, else the latest morning copy's. */
async function youtubeNow(supabase: Supa, teamId: string): Promise<Overview["youtube"]> {
  const [live, daily] = await Promise.all([
    supabase.from("analytics_syncs").select("live_totals").eq("team_id", teamId).eq("platform", "youtube").maybeSingle(),
    supabase.from("analytics_daily").select("day, total_views, followers").eq("team_id", teamId).eq("platform", "youtube").eq("content", "all").not("total_views", "is", null).order("day", { ascending: false }).limit(1),
  ]);
  const t = (live.error ? null : (live.data?.live_totals as Row | null)) ?? null;
  const d = ((daily.data ?? []) as Row[])[0];
  const totalViews = n(t?.total_views) ?? n(d?.total_views);
  const subscribers = n(t?.followers) ?? n(d?.followers);
  if (totalViews === null && subscribers === null) return null;
  return { totalViews, subscribers, at: (n(t?.total_views) !== null ? (t?.at as string | undefined) : (d?.day as string | undefined)) ?? null };
}

async function daily(
  supabase: Supa,
  teamId: string,
  w: Window,
  o: { tz: string; revenueAllowed: boolean; currency: string | null },
  status: PlatformStatus[],
  vis: NumbersVisibility,
  shown: SocialPlatform[]
): Promise<Omit<Overview, "youtube" | "history">> {
  const days = dayList(w.from, w.to);
  const prevDays = dayList(w.prevFrom, w.prevTo);
  const [rows, revenue, posted, latest] = await Promise.all([
    // A day past the range: running totals (TikTok, followers) are copied the morning after.
    dailyCols().then((cols) => all<DailyRow>((a, b) => supabase.from("analytics_daily").select(cols).eq("team_id", teamId).gte("day", w.prevFrom).lte("day", addDays(w.to, 1)).order("day").order("platform").order("content").range(a, b), 80_000)),
    o.revenueAllowed ? revenueByDay(supabase, teamId, w.prevFrom, w.to, o.currency, vis) : Promise.resolve(null),
    publishedIn(supabase, teamId, `${addDays(w.from, -1)}T00:00:00Z`, `${addDays(w.to, 1)}T23:59:59Z`, vis),
    latestVideos(supabase, teamId, vis),
  ]);
  const visible = visibleRows(rows, vis);
  const metrics: OvMetric[] = [];
  const now = new Map(shown.map((p) => [p, dailySeries(visible, p, days)]));
  const before = new Map(shown.map((p) => [p, dailySeries(visible, p, prevDays)]));
  const yt = shown.includes("youtube")
    ? {
        shorts: dailySeries(visible, "youtube", days, "shorts"),
        long: dailySeries(visible, "youtube", days, "long"),
        live: dailySeries(visible, "youtube", days, "live"),
        prevShorts: dailySeries(visible, "youtube", prevDays, "shorts"),
        prevLong: dailySeries(visible, "youtube", prevDays, "long"),
        prevLive: dailySeries(visible, "youtube", prevDays, "live"),
      }
    : null;
  for (const key of TREND_KEYS) {
    const per: OvMetric["per"] = {};
    const weights: NonNullable<OvMetric["weights"]> = {};
    const wk = RATE_WEIGHT[key];
    for (const p of shown) {
      const a = now.get(p)![key];
      const b = before.get(p)![key];
      if (!anyNum(a) && !anyNum(b)) continue;
      per[p] = { now: a, prev: b };
      if (wk) weights[p] = { now: now.get(p)![wk], prev: before.get(p)![wk] };
    }
    if (!Object.keys(per).length) continue;
    let split: OvMetric["split"] = null;
    if (yt && (anyNum(yt.shorts[key]) || anyNum(yt.long[key]))) {
      // Live streams: only once YouTube has said which videos are streams (0086), and when there were any.
      const live = yt.live[key].some((v) => (v ?? 0) !== 0) || yt.prevLive[key].some((v) => (v ?? 0) !== 0) ? { now: yt.live[key], prev: yt.prevLive[key] } : null;
      split = { shorts: { now: yt.shorts[key], prev: yt.prevShorts[key] }, long: { now: yt.long[key], prev: yt.prevLong[key] }, live };
      if (wk) {
        split.wShorts = { now: yt.shorts[wk], prev: yt.prevShorts[wk] };
        split.wLong = { now: yt.long[wk], prev: yt.prevLong[wk] };
        if (live) split.wLive = { now: yt.live[wk], prev: yt.prevLive[wk] };
      }
    }
    metrics.push({ key, per, ...(wk ? { weights } : {}), split });
  }
  if (revenue) {
    const per: OvMetric["per"] = {};
    for (const [p, m] of Object.entries(revenue.per) as [SocialPlatform, Map<string, number>][]) {
      const a = days.map((d) => m.get(d) ?? null);
      const b = prevDays.map((d) => m.get(d) ?? null);
      if (anyNum(a) || anyNum(b)) per[p] = { now: a, prev: b };
    }
    if (Object.keys(per).length) metrics.push({ key: "revenue", per, split: null });
  }
  const index = new Map(days.map((d, i) => [d, i]));
  const markers: OvMarker[] = [];
  for (const v of posted) {
    const i = v.publishedAt ? index.get(dayIn(v.publishedAt, o.tz)) : undefined;
    if (i !== undefined) markers.push(markerOf(i, v));
  }
  return {
    hourly: false,
    points: days,
    metrics,
    markers,
    latest,
    status,
    currency: revenue?.currency ?? null,
    since: null,
    coverage: null,
    hasData: metrics.some((m) => Object.values(m.per).some((s) => anyNum(s.now))),
    top: topInRange(supabase, teamId, w, vis, shown).catch(() => ({ items: [], exact: true })),
  };
}

const markerOf = (i: number, v: ContentItem): OvMarker => ({ i, platform: v.platform, kind: v.kind, title: v.title, id: v.id, thumbnail: v.thumbnail, at: v.publishedAt });

const HOUR = 3_600_000;
/** The numbers that only come per day: in the 48 hours, the last two days copied. */
const PER_DAY_ONLY = ["watch", "followers", "impressions", "ctr", "avgView"] as const;
/** The platforms whose 10-minute counts include shares (YouTube's and Instagram's public counts don't). */
const SHARES_LIVE: SocialPlatform[] = ["tiktok", "facebook"];

async function hourly(
  supabase: Supa,
  teamId: string,
  o: { tz: string; revenueAllowed: boolean; currency: string | null },
  status: PlatformStatus[],
  vis: NumbersVisibility,
  shown: SocialPlatform[]
): Promise<Omit<Overview, "youtube" | "history">> {
  const today = todayIn(o.tz);
  const from = addDays(today, -16);
  const [lh, posted, latest, rows, revenue] = await Promise.all([
    liveHours(supabase, teamId, shown, 96),
    publishedIn(supabase, teamId, new Date(Math.floor(Date.now() / HOUR) * HOUR - 47 * HOUR).toISOString(), new Date().toISOString(), vis),
    latestVideos(supabase, teamId, vis),
    dailyCols().then((cols) => all<DailyRow>((a, b) => supabase.from("analytics_daily").select(cols).eq("team_id", teamId).eq("content", "all").gte("day", from).lte("day", addDays(today, 1)).order("day").order("platform").range(a, b), 2_000)),
    o.revenueAllowed ? revenueByDay(supabase, teamId, from, today, o.currency, vis) : Promise.resolve(null),
  ]);
  const slots = lh.slots;
  const points = slots.slice(48).map((t) => new Date(t).toISOString());
  const first = lh.first ? Date.parse(lh.first) : null;
  // Hours before the first count aren't zeros (nothing was counted yet), unless they were worked out from the totals.
  const counted = (i: number) => first !== null && slots[i] + HOUR > first;
  const metrics: OvMetric[] = [];
  const views: OvMetric = { key: "views", per: {}, split: null, est: {} };
  const likes: OvMetric = { key: "likes", per: {}, split: null };
  const comments: OvMetric = { key: "comments", per: {}, split: null };
  const shares: OvMetric = { key: "shares", per: {}, split: null };
  const engagement: OvMetric = { key: "engagement", per: {}, split: null };
  const halves = (xs: Num[]): OvSeries => ({ now: xs.slice(48), prev: xs.slice(0, 48) });
  for (const p of shown) {
    const x = lh.per[p];
    if (!x) continue;
    const v = x.views.map((val, i) => (x.estimated[i] || counted(i) ? val : null));
    if (anyNum(v)) {
      views.per[p] = halves(v);
      // (Lifted to the platform's own count, 1.23.1: drawn as counted, said in the note.)
      views.est![p] = x.estimated.map((e, i) => e && !x.lifted?.[i]).slice(48);
    }
    const l = x.likes.map((val, i) => (counted(i) ? val : null));
    const c = x.comments.map((val, i) => (counted(i) ? val : null));
    const sh = SHARES_LIVE.includes(p) ? x.shares.map((val, i) => (counted(i) ? val : null)) : null;
    if (anyNum(l)) likes.per[p] = halves(l);
    if (anyNum(c)) comments.per[p] = halves(c);
    if (sh && anyNum(sh)) shares.per[p] = halves(sh);
    const e = l.map((val, i) => (val === null && c[i] === null ? null : (val ?? 0) + (c[i] ?? 0) + (sh?.[i] ?? 0)));
    if (anyNum(e)) engagement.per[p] = halves(e);
  }
  for (const m of [views, engagement, likes, comments, shares]) if (Object.keys(m.per).length) metrics.push(m);

  // The numbers that only come per day, for the last two days copied (and the two before, to compare).
  const visible = visibleRows(rows, vis);
  const dayIds = dayList(from, today);
  const perDay = new Map(shown.map((p) => [p, dailySeries(visible, p, dayIds)]));
  const lastOf = (series: (p: SocialPlatform) => Num[] | null) => {
    let last = -1;
    for (const p of shown) {
      const xs = series(p);
      if (!xs) continue;
      for (let i = xs.length - 1; i > last; i--)
        if (xs[i] !== null) {
          last = i;
          break;
        }
    }
    return last;
  };
  const pickDays = (series: (p: SocialPlatform) => Num[] | null, key: OvKey, weight?: (p: SocialPlatform) => Num[] | null) => {
    const last = lastOf(series);
    if (last < 3) return;
    const at = (xs: Num[], a: number, b: number) => [xs[a] ?? null, xs[b] ?? null];
    const m: OvMetric = { key, per: {}, split: null, days: [dayIds[last - 1], dayIds[last]] };
    for (const p of shown) {
      const xs = series(p);
      if (!xs || !anyNum(at(xs, last - 1, last))) continue;
      m.per[p] = { now: at(xs, last - 1, last), prev: at(xs, last - 3, last - 2) };
      const ws = weight?.(p);
      if (ws) (m.weights ??= {})[p] = { now: at(ws, last - 1, last), prev: at(ws, last - 3, last - 2) };
    }
    if (Object.keys(m.per).length) metrics.push(m);
  };
  for (const key of PER_DAY_ONLY) {
    const wk = RATE_WEIGHT[key];
    pickDays((p) => perDay.get(p)?.[key] ?? null, key, wk ? (p) => perDay.get(p)?.[wk] ?? null : undefined);
  }
  if (revenue) {
    const money = (p: SocialPlatform) => {
      const m = revenue.per[p];
      return m ? dayIds.map((d) => m.get(d) ?? null) : null;
    };
    pickDays(money, "revenue");
  }

  const markers: OvMarker[] = [];
  for (const v of posted) {
    const i = v.publishedAt ? hourIndex(points, v.publishedAt) : -1;
    if (i >= 0) markers.push(markerOf(i, v));
  }
  return {
    hourly: true,
    points,
    metrics,
    markers,
    latest,
    status,
    currency: revenue?.currency ?? null,
    since: lh.first,
    coverage: lh.coverage,
    hasData: metrics.some((m) => !m.days && Object.values(m.per).some((s) => s.now.some((x) => (x ?? 0) > 0))),
    top: topLive(supabase, teamId, vis).catch(() => ({ items: [], exact: true })),
  };
}

/** Videos posted between two moments (the chart's marks), oldest first. */
async function publishedIn(supabase: Supa, teamId: string, fromIso: string, toIso: string, vis: NumbersVisibility): Promise<ContentItem[]> {
  const { data } = await supabase
    .from("analytics_content")
    .select("platform, external_id, kind, title, url, thumbnail_url, published_at, views, likes, comments, shares, short_id, project_id")
    .eq("team_id", teamId)
    .gte("published_at", fromIso)
    .lte("published_at", toIso)
    .order("published_at", { ascending: true })
    .limit(600);
  return visibleRows((data ?? []) as Row[], vis).map(contentItem);
}

/** The newest videos, each with "× typical" (measured against the 300 newest). */
async function latestVideos(supabase: Supa, teamId: string, vis: NumbersVisibility): Promise<ContentItem[]> {
  const cols = await contentCols();
  const { data } = await supabase.from("analytics_content").select(cols).eq("team_id", teamId).not("published_at", "is", null).order("published_at", { ascending: false }).limit(300);
  const rows = visibleRows((data ?? []) as unknown as Row[], vis);
  const items = rows.map(contentItem);
  const scores = outlierScores(items.map((i) => ({ id: `${i.platform}:${i.id}`, platform: i.platform, kind: i.kind, publishedAt: i.publishedAt, views: i.views })));
  return items.slice(0, 6).map((i) => {
    const s = scores.get(`${i.platform}:${i.id}`);
    return { ...i, score: s?.score ?? null, typical: s?.typical ?? null };
  });
}

/** The videos behind some (platform, id) pairs, in that order. */
async function videosFor(supabase: Supa, teamId: string, keys: { platform: string; id: string; gained: number }[]): Promise<OvTop[]> {
  if (!keys.length) return [];
  const cols = await contentCols();
  const byPlatform = new Map<string, string[]>();
  for (const k of keys) byPlatform.set(k.platform, [...(byPlatform.get(k.platform) ?? []), k.id]);
  const lists = await Promise.all([...byPlatform].map(([p, ids]) => supabase.from("analytics_content").select(cols).eq("team_id", teamId).eq("platform", p).in("external_id", ids.slice(0, 100))));
  const found = new Map<string, ContentItem>();
  for (const l of lists) for (const r of (l.data ?? []) as unknown as Row[]) {
    const i = contentItem(r);
    found.set(`${i.platform}:${i.id}`, i);
  }
  return keys.flatMap((k) => {
    const i = found.get(`${k.platform}:${k.id}`);
    return i ? [{ ...i, gained: k.gained }] : [];
  });
}

async function topInRange(supabase: Supa, teamId: string, w: Window, vis: NumbersVisibility, shown: SocialPlatform[]): Promise<OvTopResult> {
  if (!shown.length) return { items: [], exact: true };
  // Lifetime (1.21.0): every video's own count since it was posted (the
  // per-day counts only reach back a few weeks).
  if (w.lifetime) {
    const cols = await contentCols();
    const { data } = await supabase.from("analytics_content").select(cols).eq("team_id", teamId).in("platform", shown).not("views", "is", null).order("views", { ascending: false }).limit(10);
    const items = visibleRows((data ?? []) as unknown as Row[], vis)
      .map(contentItem)
      .filter((i) => (i.views ?? 0) > 0)
      .map((i) => ({ ...i, gained: i.views ?? 0 }));
    return { items, exact: true };
  }
  const { data, error } = await supabase.rpc("analytics_top_content", { p_team: teamId, p_from: w.from, p_to: w.to, p_limit: 10, p_platforms: shown });
  if (!error) {
    const keys = ((data ?? []) as Row[]).map((r) => ({ platform: r.platform as string, id: r.external_id as string, gained: n(r.views) ?? 0 }));
    return { items: (await videosFor(supabase, teamId, keys)).filter((i) => vis.platforms.has(i.platform)), exact: true };
  }
  // Before migration 0084 (PGRST202: the database doesn't have the function yet): the most viewed videos posted in the range.
  // Said once per server, not on every page (in development it showed as an error on screen).
  if (!missingSaid) {
    missingSaid = true;
    console.warn(`[analytics top content] ${error.code === "PGRST202" ? "Run the database update (migration 0084 and later) for exact top content." : `${error.code ?? ""} ${error.message}`}`);
  }
  const cols = await contentCols();
  const { data: rows } = await supabase
    .from("analytics_content")
    .select(cols)
    .eq("team_id", teamId)
    .gte("published_at", `${w.from}T00:00:00Z`)
    .lte("published_at", `${w.to}T23:59:59Z`)
    .order("views", { ascending: false, nullsFirst: false })
    .limit(20);
  const items = visibleRows((rows ?? []) as unknown as Row[], vis)
    .map(contentItem)
    .filter((i) => (i.views ?? 0) > 0)
    .slice(0, 10)
    .map((i) => ({ ...i, gained: i.views ?? 0 }));
  return { items, exact: false };
}

let missingSaid = false;

async function topLive(supabase: Supa, teamId: string, vis: NumbersVisibility): Promise<OvTopResult> {
  const { data, error } = await supabase.rpc("analytics_live_gains", { p_team: teamId, p_minutes: 2880 });
  if (error) return { items: [], exact: true };
  const keys = ((data ?? []) as Row[])
    .filter((r) => vis.platforms.has(r.platform as SocialPlatform) && (n(r.views) ?? 0) > 0)
    .sort((a, b) => (n(b.views) ?? 0) - (n(a.views) ?? 0))
    .slice(0, 10)
    .map((r) => ({ platform: r.platform as string, id: r.external_id as string, gained: n(r.views) ?? 0 }));
  return { items: await videosFor(supabase, teamId, keys), exact: true };
}

/**
 * The platforms' money per day (YouTube's estimate, Facebook's earnings),
 * in the currency this person picked (when there's a rate for it). RLS
 * leaves it empty for people who don't see revenue.
 */
async function revenueByDay(supabase: Supa, teamId: string, from: string, to: string, wanted: string | null, vis: NumbersVisibility) {
  const stored = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const [rows, fx] = await Promise.all([
    all((a, b) => supabase.from("analytics_revenue_daily").select("*").eq("team_id", teamId).eq("content", "all").gte("day", from).lte("day", to).order("day").range(a, b)),
    getFxRates(),
  ]);
  const pick = isCurrencyCode(wanted) ? wanted : stored;
  const currency = pick === stored || (fx?.rates[pick] && fx?.rates[stored]) ? pick : stored;
  const per: Partial<Record<SocialPlatform, Map<string, number>>> = {};
  for (const r of rows) {
    const p = ((r.platform as string | null) ?? "youtube") as SocialPlatform;
    if (!vis.platforms.has(p)) continue;
    const amount = Number(r.revenue) || 0;
    const cur = isCurrencyCode(r.currency) ? (r.currency as string) : stored;
    const v = convert(amount, cur, currency, fx) ?? amount;
    const m = (per[p] ??= new Map());
    m.set(r.day as string, (m.get(r.day as string) ?? 0) + v);
  }
  // A Page outside Facebook's program reports zeros: no Facebook money to show.
  if (per.facebook && ![...per.facebook.values()].some((v) => v !== 0)) delete per.facebook;
  return { currency, per };
}
