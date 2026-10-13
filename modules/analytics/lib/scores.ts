/*
 * How a video did next to the team's usual (1.17.0). Pure: the Advanced
 * page's Best performing, each video's page, the Content tab.
 *
 * "× typical" (the outlier score): a video's views ÷ the median views of the
 * same platform's videos of the same kind (Shorts with Shorts, long videos
 * with long videos) posted just before it (up to 30). The median, not the
 * average, so one viral video doesn't make every other one look bad. A
 * channel's first videos (fewer than 5 before them) are measured against all
 * the others instead.
 */

export type ScoreInput = { id: string; platform: string; kind: string; publishedAt: string | null; views: number | null };
export type Score = {
  /** views ÷ typical (null: not enough videos to say, or no views yet). */
  score: number | null;
  /** The typical views it's measured against. */
  typical: number | null;
  /** How many videos made "typical". */
  peers: number;
};

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const WINDOW = 30;
const MIN_BEFORE = 5;
const MIN_PEERS = 3;

const groupKey = (v: { platform: string; kind: string }) => `${v.platform}|${v.kind}`;

/** Every video's score, by id (videos without views or peers get score null). */
export function outlierScores(videos: ScoreInput[], opts: { window?: number } = {}): Map<string, Score> {
  const window = opts.window ?? WINDOW;
  const out = new Map<string, Score>();
  const groups = new Map<string, ScoreInput[]>();
  for (const v of videos) groups.set(groupKey(v), [...(groups.get(groupKey(v)) ?? []), v]);
  for (const list of groups.values()) {
    // Oldest first; undated ones last (they can only be measured against everyone).
    const sorted = [...list].sort((a, b) => (a.publishedAt ?? "9999").localeCompare(b.publishedAt ?? "9999"));
    const withViews = (xs: ScoreInput[]) => xs.filter((x) => x.views !== null && Number.isFinite(x.views)).map((x) => x.views as number);
    sorted.forEach((v, i) => {
      const before = v.publishedAt ? withViews(sorted.slice(0, i).filter((x) => x.publishedAt && x.publishedAt < v.publishedAt!)).slice(-window) : [];
      const pool = before.length >= MIN_BEFORE ? before : withViews(sorted.filter((x) => x.id !== v.id)).slice(-window * 2);
      const typical = pool.length >= MIN_PEERS ? median(pool) : null;
      const score = typical !== null && typical > 0 && v.views !== null ? v.views / typical : null;
      out.set(v.id, { score, typical, peers: pool.length >= MIN_PEERS ? pool.length : 0 });
    });
  }
  return out;
}

/** "3.4×", "0.6×", "12×". */
export function scoreText(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "–";
  if (score >= 10) return `${Math.round(score)}×`;
  if (score >= 1) return `${score.toFixed(1)}×`;
  return `${score.toFixed(score < 0.1 ? 2 : 1)}×`;
}

/** How the score reads: clearly above, about usual, or below. */
export function scoreTone(score: number | null): "high" | "up" | "usual" | "down" | "none" {
  if (score === null) return "none";
  if (score >= 3) return "high";
  if (score >= 1.4) return "up";
  if (score > 0.7) return "usual";
  return "down";
}

/** Rank (1 = best) of `id` by `get` among `list`; null when it has no number. Ties share the better rank. */
export function rankOf<T extends { id: string }>(list: T[], id: string, get: (x: T) => number | null, lowerIsBetter = false): { rank: number; of: number } | null {
  const vals = list.map((x) => ({ id: x.id, v: get(x) })).filter((x): x is { id: string; v: number } => x.v !== null && Number.isFinite(x.v));
  const me = vals.find((x) => x.id === id);
  if (!me) return null;
  const better = vals.filter((x) => (lowerIsBetter ? x.v < me.v : x.v > me.v)).length;
  return { rank: better + 1, of: vals.length };
}

// ---------------------------------------------------------------------------
// Growth: views by the day since it was posted
// ---------------------------------------------------------------------------

/** One row of analytics_content_days: "daily" = that day's views; "total" = the running total that morning. */
export type DayRow = { day: string; source: "daily" | "total"; views: number | null };

const DAY = 86_400_000;
const dayNum = (d: string) => Math.round(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY);

/**
 * Views since it was posted, day by day: index 0 = the day it was posted.
 * "daily" rows are added up from the first day (a day without a row counts as
 * 0 once the numbers have started, since YouTube keeps a video's busy days);
 * "total" rows are the running totals as each copy saw them, with the days
 * between two copies filled in a straight line. Null where it can't be known
 * (before the first number, when that isn't the start).
 */
export function cumulativeByAge(rows: DayRow[], postedDay: string, maxAge: number, lastDay: string): (number | null)[] {
  const start = dayNum(postedDay);
  const end = Math.min(start + maxAge, dayNum(lastDay));
  const len = Math.max(0, end - start + 1);
  const out: (number | null)[] = new Array(len).fill(null);
  if (!len) return out;
  // YouTube counts days in its own time zone: a day "before" it was posted here is its first day.
  const daily = rows.filter((r) => r.source === "daily" && r.views !== null).map((r) => ({ a: Math.max(0, dayNum(r.day) - start), v: r.views as number }));
  const totals = rows.filter((r) => r.source === "total" && r.views !== null).map((r) => ({ a: dayNum(r.day) - start, v: r.views as number }));
  if (daily.length >= totals.length && daily.length) {
    const by = new Map<number, number>();
    for (const x of daily) by.set(x.a, (by.get(x.a) ?? 0) + x.v);
    const first = Math.min(...daily.map((x) => x.a));
    const last = Math.max(...daily.map((x) => x.a));
    // Known from the start only if the numbers begin on the day it was posted or the next.
    if (first > 1) return out;
    let run = 0;
    for (let a = 0; a < len; a++) {
      if (a > last) break;
      run += by.get(a) ?? 0;
      out[a] = run;
    }
    return out;
  }
  if (!totals.length) return out;
  const pts = totals.filter((x) => x.a >= 0).sort((x, y) => x.a - y.a);
  // A first copy within a day of posting: it started from 0 on the day it was posted.
  if (pts.length && pts[0].a <= 1 && pts[0].a > 0) pts.unshift({ a: 0, v: 0 });
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.a < len) out[p.a] = p.v;
    const q = pts[i + 1];
    if (!q) break;
    for (let a = p.a + 1; a < q.a && a < len; a++) out[a] = Math.round(p.v + ((q.v - p.v) * (a - p.a)) / (q.a - p.a));
  }
  return out;
}

/** Each day's own views from a running total (the first day keeps its total). */
export function perDayFrom(cumulative: (number | null)[]): (number | null)[] {
  return cumulative.map((v, i) => {
    if (v === null) return null;
    if (i === 0) return v;
    const p = cumulative[i - 1];
    return p === null ? null : Math.max(0, v - p);
  });
}

/**
 * The typical curve: at each age, the median of the curves that reach it
 * (needs `min` of them). Views so far never go down, but the videos with a
 * number change from day to day, so the medians are kept from falling.
 */
export function typicalCurve(curves: (number | null)[][], len: number, min = MIN_PEERS): (number | null)[] {
  const out: (number | null)[] = [];
  let floor = 0;
  for (let a = 0; a < len; a++) {
    const at = curves.map((c) => c[a]).filter((v): v is number => v !== null && v !== undefined);
    const m = at.length >= min ? median(at) : null;
    if (m === null) out.push(null);
    else {
      floor = Math.max(floor, m);
      out.push(floor);
    }
  }
  return out;
}

/** The first day it was ahead of typical and stayed ahead, or fell behind: for one line of words. */
export function versusTypical(mine: (number | null)[], typical: (number | null)[]): { ahead: boolean; since: number; ratio: number } | null {
  let lastBoth = -1;
  for (let a = 0; a < Math.min(mine.length, typical.length); a++) if (mine[a] !== null && typical[a] !== null) lastBoth = a;
  if (lastBoth < 0) return null;
  const t = typical[lastBoth]!;
  const m = mine[lastBoth]!;
  const ahead = m >= t;
  let since = lastBoth;
  for (let a = lastBoth; a >= 0; a--) {
    if (mine[a] === null || typical[a] === null) break;
    if (mine[a]! >= typical[a]! !== ahead) break;
    since = a;
  }
  return { ahead, since, ratio: t > 0 ? m / t : m > 0 ? Infinity : 1 };
}
