/*
 * Audience retention curves (0081): where viewers stop watching.
 * A curve is a list of points [where in the video 0…1, share of viewers
 * still watching (1 = all of them; above 1 where people rewatch), compared
 * with videos of a similar length 0…1 (YouTube) or null]. Shared by the
 * daily copy, the Advanced page and the export for Claude (no server parts).
 */

export type RetentionPoint = [number, number, number | null];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** A YouTube retention report's rows → the curve (sorted, at most 101 points). */
export function retentionPoints(list: Record<string, unknown>[]): RetentionPoint[] {
  return list
    .map((r) => [num(r.elapsedVideoTimeRatio), num(r.audienceWatchRatio), num(r.relativeRetentionPerformance)] as const)
    .filter((p): p is readonly [number, number, number | null] => p[0] !== null && p[1] !== null && p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] < 50)
    .sort((x, y) => x[0] - y[0])
    .slice(0, 101)
    .map(([x, w, rel]) => [Math.round(x * 1000) / 1000, Math.round(w * 10000) / 10000, rel === null ? null : Math.round(rel * 1000) / 1000]);
}

/**
 * Facebook's retention graph: an object of interval → share still watching
 * ({"0": 1, "1": 0.93, …}; sometimes in percent) → the same kind of curve.
 */
export function facebookRetention(value: unknown): RetentionPoint[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => [Number(k), num(v)] as const)
    .filter((e): e is readonly [number, number] => Number.isFinite(e[0]) && e[0] >= 0 && e[1] !== null && e[1] >= 0)
    .sort((x, y) => x[0] - y[0])
    .slice(0, 101);
  if (entries.length < 2) return [];
  const percent = entries.some(([, v]) => v > 1.5);
  const last = entries[entries.length - 1][0] || 1;
  return entries.map(([k, v]) => [Math.round((k / last) * 1000) / 1000, Math.round((percent ? v / 100 : v) * 10000) / 10000, null]);
}

/** A stored curve, checked (anything odd is dropped). */
export function readCurve(v: unknown): RetentionPoint[] {
  if (!Array.isArray(v)) return [];
  const out: RetentionPoint[] = [];
  for (const p of v) {
    if (!Array.isArray(p)) continue;
    const x = num(p[0]);
    const w = num(p[1]);
    const rel = num(p[2]);
    if (x === null || w === null || x < 0 || x > 1 || w < 0) continue;
    out.push([x, w, rel]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Share still watching at position x (0…1), in between points by a straight line. Null without a curve. */
export function curveAt(points: RetentionPoint[], x: number): number | null {
  if (!points.length) return null;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

/** "Compared with similar videos" at x, the same way (null where YouTube didn't say). */
export function relativeAt(points: RetentionPoint[], x: number): number | null {
  const withRel = points.filter((p) => p[2] !== null) as [number, number, number][];
  if (!withRel.length) return null;
  return curveAt(
    withRel.map((p) => [p[0], p[2], null]),
    x
  );
}

/** The same curve at n evenly spaced points (0, 1/(n-1), … 1). */
export function resample(points: RetentionPoint[], n = 51): (number | null)[] {
  return Array.from({ length: n }, (_, i) => curveAt(points, i / (n - 1)));
}

/** Several videos' curves averaged point by point (each video counts once). */
export function averageCurve(curves: RetentionPoint[][], n = 51): RetentionPoint[] {
  const usable = curves.filter((c) => c.length >= 2);
  if (!usable.length) return [];
  const out: RetentionPoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const ys = usable.map((c) => curveAt(c, x)).filter((v): v is number => v !== null);
    const rels = usable.map((c) => relativeAt(c, x)).filter((v): v is number => v !== null);
    out.push([Math.round(x * 1000) / 1000, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0, rels.length ? rels.reduce((a, b) => a + b, 0) / rels.length : null]);
  }
  return out;
}

export type RetentionSummary = {
  /** Still watching after the first 3 seconds (the hook), 0…1+. */
  at3s: number | null;
  /** …after 30 seconds (long videos). */
  at30s: number | null;
  at25: number | null;
  at50: number | null;
  at75: number | null;
  /** At the very end. */
  end: number | null;
  /** The steepest drop after the opening: where (0…1) and how much was lost over ~5% of the video. */
  biggestDrop: { at: number; lost: number } | null;
  /** Compared with videos of a similar length, on average (0…1, 0.5 = typical). */
  relative: number | null;
  /** Rewatched parts: positions where more than everyone is watching (loops, replays). */
  rewatchPeak: { at: number; ratio: number } | null;
};

/** The numbers that matter in a curve, for a video `duration` seconds long. */
export function summarize(points: RetentionPoint[], duration: number | null): RetentionSummary {
  const none: RetentionSummary = { at3s: null, at30s: null, at25: null, at50: null, at75: null, end: null, biggestDrop: null, relative: null, rewatchPeak: null };
  if (points.length < 2) return none;
  const d = duration && duration > 0 ? duration : null;
  const at = (x: number) => {
    const v = curveAt(points, x);
    return v === null ? null : Math.round(v * 1000) / 1000;
  };
  // The steepest stretch after the first 10% (the opening always drops).
  let drop: RetentionSummary["biggestDrop"] = null;
  for (let x = 0.1; x <= 0.95; x += 0.01) {
    const a = curveAt(points, x);
    const b = curveAt(points, Math.min(1, x + 0.05));
    if (a === null || b === null) continue;
    const lost = a - b;
    if (lost > 0.03 && (!drop || lost > drop.lost)) drop = { at: Math.round(x * 100) / 100, lost: Math.round(lost * 1000) / 1000 };
  }
  const rels = points.map((p) => p[2]).filter((v): v is number => v !== null);
  let peak: RetentionSummary["rewatchPeak"] = null;
  for (const [x, y] of points) if (x > 0.02 && y > 1.02 && (!peak || y > peak.ratio)) peak = { at: x, ratio: Math.round(y * 100) / 100 };
  return {
    at3s: d ? at(Math.min(1, 3 / d)) : null,
    at30s: d && d > 45 ? at(Math.min(1, 30 / d)) : null,
    at25: at(0.25),
    at50: at(0.5),
    at75: at(0.75),
    end: at(1),
    biggestDrop: drop,
    relative: rels.length ? Math.round((rels.reduce((a, b) => a + b, 0) / rels.length) * 1000) / 1000 : null,
    rewatchPeak: peak,
  };
}
