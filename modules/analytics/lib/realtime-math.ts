/*
 * Realtime's hours before every video was counted (1.22.0). The 10-minute
 * job counts each video's views from its first full pass on (live_since).
 * Before that, only some videos were being read, so those hours fell short
 * (Realtime said 56K where YouTube Studio said 154K for the same 48 hours).
 * Those hours are worked out instead from what the platform says for the
 * whole account: its running total of views (kept every time the job reads
 * it, 0086), else its views per day (the day's views spread over its hours),
 * and shown as estimated. Pure: tests/realtime-math.test.ts.
 */

export type TotalPoint = { at: number; total: number };
const HOUR = 3_600_000;

/** The running total at a moment: a straight line between the points around it. Null outside them. */
export function totalAt(points: TotalPoint[], t: number): number | null {
  const list = points.filter((p) => Number.isFinite(p.at) && Number.isFinite(p.total)).sort((a, b) => a.at - b.at);
  if (!list.length || t < list[0].at || t > list[list.length - 1].at) return null;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.at === t) return p.total;
    const q = list[i + 1];
    if (q && p.at <= t && t <= q.at) return q.at === p.at ? q.total : p.total + ((q.total - p.total) * (t - p.at)) / (q.at - p.at);
  }
  return null;
}

/** What a running total grew by in each hour [h, h + 1 h); null where the points don't reach (never below 0). */
export function hourlyFromTotals(points: TotalPoint[], hourStarts: number[]): (number | null)[] {
  return hourStarts.map((h) => {
    const a = totalAt(points, h);
    const b = totalAt(points, h + HOUR);
    return a === null || b === null ? null : Math.max(0, Math.round(b - a));
  });
}

/** The day (YYYY-MM-DD) a moment falls on in a time zone (the platform's own days). */
export function dayAt(t: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  } catch {
    return new Date(t).toISOString().slice(0, 10);
  }
}

/** Each hour's share of its day's views (the day in `tz`): views ÷ 24. Null when that day has no number. */
export function hourlyFromDays(days: Map<string, number>, hourStarts: number[], tz: string): (number | null)[] {
  return hourStarts.map((h) => {
    const v = days.get(dayAt(h + HOUR / 2, tz));
    return v === undefined || !Number.isFinite(v) ? null : Math.max(0, Math.round(v / 24));
  });
}

/** The estimate for each hour: the running total first, else the day's views. */
export function estimateHours(points: TotalPoint[], days: Map<string, number>, hourStarts: number[], tz: string): { values: (number | null)[]; from: ("totals" | "days" | null)[] } {
  const t = hourlyFromTotals(points, hourStarts);
  const d = hourlyFromDays(days, hourStarts, tz);
  return {
    values: hourStarts.map((_, i) => t[i] ?? d[i]),
    from: hourStarts.map((_, i) => (t[i] !== null ? "totals" : d[i] !== null ? "days" : null)),
  };
}

/**
 * One platform's hours: the counted views from `since` on (every video
 * counted); the hours wholly before it, the estimate when there is one (else
 * what was counted, marked as not every video). `since` null: no full pass
 * yet, so nothing is complete.
 */
export function fillHours(counted: number[], hourStarts: number[], since: number | null, estimate: (number | null)[]): { views: number[]; estimated: boolean[]; partial: boolean[] } {
  const views: number[] = [];
  const estimated: boolean[] = [];
  const partial: boolean[] = [];
  hourStarts.forEach((h, i) => {
    const c = counted[i] ?? 0;
    const before = since === null || h + HOUR <= since;
    const e = estimate[i];
    if (before && e !== null && e !== undefined) {
      // (Never under what was counted: the estimate is for every video, the count for some.)
      views.push(Math.max(c, e));
      estimated.push(e > c);
      partial.push(false);
    } else {
      views.push(c);
      estimated.push(false);
      partial.push(before && c >= 0);
    }
  });
  return { views, estimated, partial };
}
