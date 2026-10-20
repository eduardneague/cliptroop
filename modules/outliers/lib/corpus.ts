import { median } from "@/modules/analytics/lib/scores";

/*
 * The videos the insights are worked out from (1.27.0), and the little
 * statistics every part shares. Pure.
 */

export type CorpusVideo = {
  id: string;
  channelId: string;
  title: string;
  kind: "long" | "short";
  publishedAt: string;
  views: number | null;
  score: number | null;
  formats: string[];
  bits: number;
  durationS: number | null;
  lang: string | null;
  subs: number | null;
  colors?: string[] | null;
  lum?: number | null;
  sat?: number | null;
};

export { median };

/** An outlier, for the counts: 3× its channel's usual or more. */
export const OUTLIER = 3;

/**
 * How much better a group did than the rest, as a multiple of medians, pulled
 * towards 1 when the group is small (k "pretend" videos at the usual):
 * a group of 4 that did 5× is less sure than a group of 80 that did 2×.
 */
export function shrunkLift(groupMedian: number | null, baseMedian: number | null, n: number, k = 12): number {
  if (groupMedian === null || baseMedian === null || baseMedian <= 0 || groupMedian <= 0 || n <= 0) return 1;
  const raw = Math.log(groupMedian / baseMedian);
  return Math.exp((raw * n) / (n + k));
}

/** The median score of a list of videos (only those with a score). */
export function medianScore(vs: { score: number | null }[]): number | null {
  return median(vs.map((v) => v.score).filter((s): s is number => s !== null && Number.isFinite(s)));
}

/** Share of videos at 3× or more (of those with a score). */
export function hitRate(vs: { score: number | null }[]): number {
  let n = 0;
  let hit = 0;
  for (const v of vs) {
    if (v.score === null || !Number.isFinite(v.score)) continue;
    n++;
    if (v.score >= OUTLIER) hit++;
  }
  return n ? hit / n : 0;
}

/** The ids of the best few by score (ties: more views first). */
export function bestIds(vs: CorpusVideo[], n = 4): string[] {
  return [...vs]
    .filter((v) => v.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.views ?? 0) - (a.views ?? 0))
    .slice(0, n)
    .map((v) => v.id);
}

/**
 * How it's trending: videos posted in the last 30 days against the 90 days
 * before, as a ratio of rates (1 = steady, 2 = twice as many lately).
 */
export function momentum(dates: string[], now = Date.now()): { recent: number; prev: number; mom: number } {
  const d30 = now - 30 * 86_400_000;
  const d120 = now - 120 * 86_400_000;
  let recent = 0;
  let prev = 0;
  for (const d of dates) {
    const t = Date.parse(d);
    if (t >= d30) recent++;
    else if (t >= d120) prev++;
  }
  const mom = (recent + 1) / 30 / ((prev + 1) / 90);
  return { recent, prev, mom: Math.round(mom * 100) / 100 };
}

/** Distinct channels among videos. */
export const channelCount = (vs: { channelId: string }[]) => new Set(vs.map((v) => v.channelId)).size;

/** Deterministic random numbers from a seed (mulberry32): the same seed, the same ideas. */
export function rng(seed: number) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks one item by weight (weights ≤ 0 never picked); null when nothing can be. */
export function pickWeighted<T>(items: T[], weight: (t: T) => number, rand: () => number): T | null {
  let total = 0;
  const ws = items.map((it) => {
    const w = Math.max(0, weight(it));
    total += w;
    return w;
  });
  if (total <= 0) return null;
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1] ?? null;
}

/** A string's hash (FNV-1a), for stable keys and seeds. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
