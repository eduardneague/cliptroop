import { median, outlierScores } from "@/modules/analytics/lib/scores";

/*
 * How far a video beat its channel (1.27.0). Pure.
 *
 * The score is the same rule as the team's own Analytics ("× typical"): a
 * video's views ÷ the median views of the same channel's videos of the same
 * kind (Shorts with Shorts, long with long) posted just before it, up to 30.
 * Live streams don't count. A young video hasn't had its views yet, so it
 * also gets a projection: where its score is heading, from how much of its
 * views a video usually has at that age (`shareAt`).
 */

export type ChannelVideo = { id: string; kind: string; publishedAt: string; views: number | null };

export type ChannelNumbers = {
  scores: Map<string, number | null>;
  longMedian: number | null;
  shortMedian: number | null;
  longN: number;
  shortN: number;
  uploadsWeek: number | null;
  lastUpload: string | null;
};

const LATEST = 30;

/** Every video's score, the channel's usual views for each kind, and how often it posts. */
export function channelNumbers(videos: ChannelVideo[], now = Date.now()): ChannelNumbers {
  const counted = videos.filter((v) => v.kind === "long" || v.kind === "short");
  const raw = outlierScores(counted.map((v) => ({ id: v.id, platform: "youtube", kind: v.kind, publishedAt: v.publishedAt, views: v.views })));
  const scores = new Map<string, number | null>();
  for (const v of videos) scores.set(v.id, raw.get(v.id)?.score ?? null);
  const usual = (kind: string) => {
    const latest = counted
      .filter((v) => v.kind === kind && v.views !== null && Date.parse(v.publishedAt) < now - 2 * 86_400_000)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, LATEST)
      .map((v) => v.views as number);
    return { m: latest.length >= 3 ? median(latest) : null, n: latest.length };
  };
  const l = usual("long");
  const s = usual("short");
  return { scores, longMedian: l.m, shortMedian: s.m, longN: l.n, shortN: s.n, uploadsWeek: uploadsPerWeek(videos.map((v) => v.publishedAt), now), lastUpload: latest(videos.map((v) => v.publishedAt)) };
}

function latest(dates: string[]): string | null {
  let best: string | null = null;
  for (const d of dates) if (!best || d > best) best = d;
  return best;
}

/** Uploads a week over the last 90 days (or since its oldest video we know of, if newer). */
export function uploadsPerWeek(dates: string[], now = Date.now()): number | null {
  if (!dates.length) return null;
  const since = now - 90 * 86_400_000;
  const times = dates.map((d) => Date.parse(d)).filter((t) => Number.isFinite(t));
  if (!times.length) return null;
  const recent = times.filter((t) => t >= since);
  const oldest = Math.min(...times);
  const spanDays = Math.max(7, (now - Math.max(since, oldest)) / 86_400_000);
  return Math.round((recent.length / spanDays) * 7 * 10) / 10;
}

/**
 * How much of its views a video usually has at this age (hours since it was
 * posted), against where it ends up: about a third on day one, two thirds in
 * a week, nearly all of it in two months. A smooth curve between the points.
 */
const CURVE: [number, number][] = [
  [0, 0],
  [3, 0.06],
  [6, 0.11],
  [12, 0.19],
  [24, 0.3],
  [48, 0.42],
  [72, 0.5],
  [168, 0.68],
  [336, 0.8],
  [720, 0.9],
  [1440, 0.97],
  [2160, 1],
];
export function shareAt(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return CURVE[1][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [h1, s1] = CURVE[i];
    if (hours <= h1) {
      const [h0, s0] = CURVE[i - 1];
      return s0 + ((s1 - s0) * (hours - h0)) / (h1 - h0);
    }
  }
  return 1;
}

/** The score a young video is heading for (null once it's two weeks old, or without a score). */
export function projectedScore(score: number | null, publishedAt: string, now = Date.now()): number | null {
  if (score === null || !Number.isFinite(score)) return null;
  const hours = (now - Date.parse(publishedAt)) / 3_600_000;
  if (!Number.isFinite(hours) || hours >= 14 * 24) return null;
  // At least 12% of the way: a two-hour-old video can't be projected 50 times over.
  const share = Math.max(0.12, shareAt(hours));
  return Math.round((score / share) * 100) / 100;
}

/** Views an hour: between the last two readings when there are two, else since it was posted. */
export function viewsPerHour(views: number | null, publishedAt: string, readings: { at: string; views: number | null }[] = [], now = Date.now()): number | null {
  const pts = readings.filter((r) => r.views !== null).sort((a, b) => a.at.localeCompare(b.at));
  if (pts.length >= 2) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const hours = (Date.parse(b.at) - Date.parse(a.at)) / 3_600_000;
    if (hours >= 0.25) return Math.max(0, Math.round(((b.views as number) - (a.views as number)) / hours));
  }
  if (views === null) return null;
  const hours = (now - Date.parse(publishedAt)) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return Math.round(views / Math.max(1, hours));
}

export type Band = "none" | "below" | "usual" | "good" | "great" | "huge" | "viral";

/** How a score reads: below usual, usual, 2–5×, 5–10×, 10–25×, 25× and more. */
export function band(score: number | null | undefined): Band {
  if (score === null || score === undefined || !Number.isFinite(score)) return "none";
  if (score < 0.8) return "below";
  if (score < 2) return "usual";
  if (score < 5) return "good";
  if (score < 10) return "great";
  if (score < 25) return "huge";
  return "viral";
}

export const BAND_LABEL: Record<Band, string> = {
  none: "No score yet",
  below: "Below its usual",
  usual: "About its usual",
  good: "2–5× its usual",
  great: "5–10× its usual",
  huge: "10–25× its usual",
  viral: "25× or more",
};

/**
 * The usual a video's score is measured against (1.31.8): its views ÷ its score, which is the median views of the
 * channel's videos of its kind posted just before it (the score keeps that number fixed as the views move,
 * collector.ts → refreshVideos). Not the channel's usual now: a channel that grew since makes that one bigger, so
 * "14M views, usual 5.6M, 3.3×" didn't add up (14M ÷ 4.2M then = 3.3×). Null without a score or views.
 */
export function usualThen(v: { views: number | null; score: number | null }): number | null {
  if (v.views === null || v.score === null || !Number.isFinite(v.views) || !Number.isFinite(v.score) || v.score <= 0 || v.views <= 0) return null;
  return Math.round(v.views / v.score);
}

/** Whether two usuals are far enough apart to say both (more than 15% from each other). */
export function usualsDiffer(then: number | null, now: number | null): boolean {
  if (!then || !now) return false;
  return Math.abs(now - then) / Math.min(now, then) > 0.15;
}

/** "3.4×", "12×", "0.6×". */
export function multText(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return "–";
  if (score >= 100) return `${Math.round(score)}×`;
  if (score >= 10) return `${Math.round(score)}×`;
  // (0.96 rounds to "1.0": written "1×" like 1.04, never both.)
  if (score >= 0.95) return `${score.toFixed(1).replace(/\.0$/, "")}×`;
  return `${score.toFixed(score < 0.1 ? 2 : 1)}×`;
}
