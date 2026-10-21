/*
 * The Overview's numbers (1.20.0), pure so they're tested
 * (tests/trend-math.test.ts): each platform's per-day series from the
 * morning copy's rows, days rolled up into weeks / months, running totals,
 * weighted rates (CTR by impressions), changes.
 */

export type Num = number | null;
export type Gran = "hour" | "day" | "week" | "month";

/** The numbers the Overview can chart (per platform, per day). */
export const TREND_KEYS = ["views", "watch", "followers", "engagement", "likes", "comments", "shares", "impressions", "ctr", "avgView"] as const;
export type TrendKey = (typeof TREND_KEYS)[number];
/** Rates are averaged, weighted by another number (CTR by impressions, average view by views); the rest add up. */
export const RATE_WEIGHT: Partial<Record<TrendKey, TrendKey>> = { ctr: "impressions", avgView: "views" };

export type DailyRow = { platform: string; content?: string | null; day: string } & Record<string, unknown>;

const num = (v: unknown): Num => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const DAY = 86_400_000;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10);

/**
 * One platform's numbers on each of `days` (one `content`: all / shorts /
 * long). TikTok's views: the copy's per-video count (1.19.0), else the
 * change in its running total; its likes only as the change in the total.
 * Followers: gained − lost where the platform says so, else the change
 * between two mornings' counts (it can be negative). Null = no number.
 */
export function dailySeries(rows: DailyRow[], platform: string, days: string[], content = "all"): Record<TrendKey, Num[]> {
  const map = new Map<string, DailyRow>();
  for (const r of rows) if (r.platform === platform && (r.content ?? "all") === content) map.set(r.day, r);
  const field = (d: string, f: string) => num(map.get(d)?.[f]);
  // What happened ON a day = the next morning's running total − that morning's (never below nothing).
  const delta = (d: string, f: string, floor = true) => {
    const a = field(d, f);
    const b = field(nextDay(d), f);
    return a === null || b === null ? null : floor ? Math.max(0, b - a) : b - a;
  };
  const tt = platform === "tiktok";
  const views = (d: string) => (tt ? (field(d, "views") ?? delta(d, "total_views")) : field(d, "views"));
  const likes = (d: string) => (tt ? (field(d, "likes") ?? delta(d, "total_likes")) : field(d, "likes"));
  const engagement = (d: string) => {
    if (tt) return likes(d);
    if (platform === "facebook") {
      const e = field(d, "engagements");
      if (e !== null) return e;
    }
    const parts = [field(d, "likes"), field(d, "comments"), field(d, "shares")].filter((x): x is number => x !== null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  };
  const followers = (d: string) => {
    const r = map.get(d);
    const g = num(r?.followers_gained);
    const l = num(r?.followers_lost);
    if (g !== null || l !== null) return (g ?? 0) - (l ?? 0);
    return delta(d, "followers", false);
  };
  const watch = (d: string) => {
    const m = field(d, "watch_minutes");
    return m === null ? null : m / 60;
  };
  return {
    views: days.map(views),
    watch: days.map(watch),
    followers: days.map(followers),
    engagement: days.map(engagement),
    likes: days.map(likes),
    comments: days.map((d) => field(d, "comments")),
    shares: days.map((d) => field(d, "shares")),
    impressions: days.map((d) => field(d, "impressions")),
    ctr: days.map((d) => field(d, "ctr")),
    avgView: days.map((d) => field(d, "avg_view_seconds")),
  };
}

/** Sum of the numbers (null when there are none). */
export function total(xs: Num[]): Num {
  let s = 0;
  let any = false;
  for (const x of xs)
    if (x !== null && Number.isFinite(x)) {
      s += x;
      any = true;
    }
  return any ? s : null;
}

/** Several series added point by point (null where none has a number). */
export function addSeries(list: Num[][]): Num[] {
  const len = Math.max(0, ...list.map((s) => s.length));
  return Array.from({ length: len }, (_, i) => total(list.map((s) => s[i] ?? null)));
}

/** The last point a series has a number at (-1: none). */
export function lastIndex(xs: readonly (number | null | undefined)[]): number {
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i] !== null && xs[i] !== undefined && Number.isFinite(xs[i])) return i;
  return -1;
}

/**
 * How far every platform has reported (1.29.0): the last point all of them
 * have a number at. YouTube's numbers come two or three days after the day,
 * so until then a total of those days is only the other platforms' and reads
 * as a drop to almost nothing. A platform whose last number is more than
 * `lag` points before the others' stopped reporting (it isn't late), so it
 * doesn't hold the rest back. -1: none has a number.
 */
export function reportedUntil(list: readonly (readonly Num[])[], lag = 4): number {
  const lasts = list.map(lastIndex).filter((i) => i >= 0);
  if (!lasts.length) return -1;
  const end = Math.max(...lasts);
  return Math.min(...lasts.filter((i) => end - i <= lag));
}

/**
 * Series added point by point up to where every platform has reported; the
 * points after are null ("no data yet"), so the line ends there instead of
 * dropping to almost nothing (1.29.0).
 */
export function addReported(list: Num[][], lag = 4): Num[] {
  const sum = addSeries(list);
  const cut = reportedUntil(list, lag);
  return sum.map((v, i) => (i > cut ? null : v));
}

/** An average of rates, weighted (CTR by impressions). Null without weight. */
export function weightedAvg(values: Num[], weights: Num[]): Num {
  let s = 0;
  let w = 0;
  values.forEach((v, i) => {
    const k = weights[i];
    if (v === null || k === null || k === undefined || !(k > 0)) return;
    s += v * k;
    w += k;
  });
  return w ? s / w : null;
}

/**
 * Rates of several platforms put together point by point, each weighted by
 * its own weight (two platforms' CTR → one CTR). Returns the rates and the
 * summed weights.
 */
export function combineRates(list: { values: Num[]; weights: Num[] }[]): { values: Num[]; weights: Num[] } {
  const len = Math.max(0, ...list.map((s) => s.values.length));
  const values: Num[] = [];
  const weights: Num[] = [];
  for (let i = 0; i < len; i++) {
    values.push(weightedAvg(list.map((s) => s.values[i] ?? null), list.map((s) => s.weights[i] ?? null)));
    weights.push(total(list.map((s) => s.weights[i] ?? null)));
  }
  return { values, weights };
}

export type TrendBucket = { key: string; label: string; tip: string; idx: number[] };

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });

/**
 * Days grouped for the chart: each day, weeks from Monday, or months
 * (the first and last cut to the range). `idx` = the days' positions.
 */
export function bucketDays(days: string[], gran: "day" | "week" | "month"): TrendBucket[] {
  if (gran === "day")
    return days.map((d, i) => ({ key: d, label: fmt(d, { month: "short", day: "numeric" }), tip: fmt(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" }), idx: [i] }));
  const out: TrendBucket[] = [];
  days.forEach((d, i) => {
    const key =
      gran === "month"
        ? d.slice(0, 7)
        : (() => {
            const t = Date.parse(`${d}T00:00:00Z`);
            const dow = (new Date(t).getUTCDay() + 6) % 7;
            return new Date(t - dow * DAY).toISOString().slice(0, 10);
          })();
    const last = out[out.length - 1];
    if (last && last.key === key) last.idx.push(i);
    else out.push({ key, label: "", tip: "", idx: [i] });
  });
  for (const b of out) {
    const a = days[b.idx[0]];
    const z = days[b.idx[b.idx.length - 1]];
    if (gran === "month") {
      b.label = `${fmt(a, { month: "short" })} ’${a.slice(2, 4)}`;
      b.tip = b.idx.length >= 28 || a.endsWith("-01") ? fmt(a, { month: "long", year: "numeric" }) : `${fmt(a, { month: "short", day: "numeric" })} – ${fmt(z, { month: "short", day: "numeric", year: "numeric" })}`;
    } else {
      b.label = fmt(a, { month: "short", day: "numeric" });
      b.tip = a === z ? fmt(a, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : `${fmt(a, { month: "short", day: "numeric" })} – ${fmt(z, { month: "short", day: "numeric", year: "numeric" })}`;
    }
  }
  return out;
}

/** A per-day series added up (or, for a rate, averaged by its weight) per bucket. */
export function rollup(values: Num[], buckets: TrendBucket[], weights?: Num[]): Num[] {
  return buckets.map((b) =>
    weights ? weightedAvg(b.idx.map((i) => values[i] ?? null), b.idx.map((i) => weights[i] ?? null)) : total(b.idx.map((i) => values[i] ?? null))
  );
}

/**
 * Running total: everything up to each point (null before the first number;
 * gaps keep the total; null after the last number too, 1.29.0: days with no
 * data yet don't carry it on as if nothing happened).
 */
export function runningTotal(values: Num[]): Num[] {
  let s: number | null = null;
  const last = lastIndex(values);
  return values.map((v, i) => {
    if (v !== null && Number.isFinite(v)) s = (s ?? 0) + v;
    return i > last ? null : s;
  });
}

/** Change in percent (null when there's nothing to compare with). */
export function change(now: Num, prev: Num): Num {
  if (now === null || prev === null) return null;
  if (prev === 0) return now === 0 ? 0 : null;
  return ((now - prev) / Math.abs(prev)) * 100;
}

/** The granularities a range offers, and the one it starts with. */
export function gransFor(days: number, hourly: boolean): Gran[] {
  if (hourly) return ["hour"];
  if (days <= 14) return ["day"];
  if (days <= 120) return ["day", "week"];
  if (days <= 800) return ["day", "week", "month"];
  return ["week", "month"];
}
export function defaultGran(days: number, hourly: boolean): Gran {
  if (hourly) return "hour";
  return days <= 45 ? "day" : days <= 200 ? "week" : "month";
}

/** The index of a moment among hourly slots (`slots` = ISO hour starts, oldest first), or -1. */
export function hourIndex(slots: string[], iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || !slots.length) return -1;
  const first = Date.parse(slots[0]);
  const i = Math.floor((t - first) / 3_600_000);
  return i >= 0 && i < slots.length ? i : -1;
}

/**
 * The hourly slots ending with the hour going on now (oldest first), as
 * ISO strings: `count` of them.
 */
export function hourSlots(now: number, count: number): string[] {
  const top = Math.floor(now / 3_600_000) * 3_600_000;
  return Array.from({ length: count }, (_, i) => new Date(top - (count - 1 - i) * 3_600_000).toISOString());
}
