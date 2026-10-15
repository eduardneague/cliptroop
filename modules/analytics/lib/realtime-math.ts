/*
 * Realtime's hours before every video was counted (1.22.0). The 10-minute
 * job counts each video's views from its first full pass on (live_since).
 * Before that, only some videos were being read, so those hours fell short
 * (Realtime said 56K where YouTube Studio said 154K for the same 48 hours).
 * Those hours are worked out instead from what the platform says for the
 * whole account: its running total of views (kept every time the job reads
 * it, 0086), else its views per day (the day's views spread over its hours),
 * and shown as estimated. 1.23.1: and the public counts themselves come in
 * under the platform's own analytics (132K where YouTube Studio said 182K),
 * so they're lifted by the gap measured on the last complete days
 * (countRatio). Pure: tests/realtime-math.test.ts.
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
 *
 * 1.23.1: `scale` (the platform's own count ÷ the public counts, countRatio)
 * lifts what the public counts give (counted hours, and estimates from the
 * account's running total, the same kind of count) to what the platform's
 * own analytics say; estimates from its views per day are its own already.
 * `scaled` marks the hours it lifted.
 */
export function fillHours(
  counted: number[],
  hourStarts: number[],
  since: number | null,
  estimate: (number | null)[],
  o: { from?: ("totals" | "days" | null)[]; scale?: number } = {}
): { views: number[]; estimated: boolean[]; partial: boolean[]; scaled: boolean[] } {
  const k = o.scale && Number.isFinite(o.scale) && o.scale > 1 ? o.scale : 1;
  const views: number[] = [];
  const estimated: boolean[] = [];
  const partial: boolean[] = [];
  const scaled: boolean[] = [];
  hourStarts.forEach((h, i) => {
    const c = counted[i] ?? 0;
    const before = since === null || h + HOUR <= since;
    const e = estimate[i];
    if (before && e !== null && e !== undefined) {
      // (Never under what was counted: the estimate is for every video, the count for some.)
      const lift = k > 1 && o.from?.[i] !== "days";
      const v = Math.max(c, lift ? Math.round(e * k) : e);
      views.push(v);
      estimated.push(v > c);
      partial.push(false);
      scaled.push(lift && v > c);
    } else {
      const v = k > 1 && !before ? Math.round(c * k) : c;
      views.push(v);
      estimated.push(v > c);
      partial.push(before && c >= 0);
      scaled.push(v > c);
    }
  });
  return { views, estimated, partial, scaled };
}

/**
 * How much more the platform itself counted than the public counts the
 * 10-minute job reads (1.23.1): its own views per day (the morning copy,
 * YouTube Analytics for YouTube) ÷ the counted views on the same days, over
 * `days` (wholly counted, final on the platform). YouTube Studio's realtime
 * came to 182K where the counts added up to 132K: the public counts don't
 * have every view the platform's own analytics have. Null with fewer than 2
 * days that have both, or too few views to say.
 */
export function countRatio(counted: Map<string, number>, own: Map<string, number>, days: string[]): { ratio: number; from: string; to: string; counted: number; own: number } | null {
  const use = [...new Set(days)].sort().filter((d) => (counted.get(d) ?? 0) > 0 && (own.get(d) ?? 0) > 0);
  if (use.length < 2) return null;
  const c = use.reduce((t, d) => t + (counted.get(d) ?? 0), 0);
  const p = use.reduce((t, d) => t + (own.get(d) ?? 0), 0);
  if (c < 500 || p < 500) return null;
  return { ratio: Math.round((p / c) * 1000) / 1000, from: use[0], to: use[use.length - 1], counted: Math.round(c), own: Math.round(p) };
}

/** The ratio realtime uses: a clear gap (3% or more), not an odd one (over 4×), worked out in the last 3 days. */
export function usableRatio(r: { ratio?: unknown; at?: unknown } | null | undefined, now = Date.now()): number | null {
  const x = typeof r?.ratio === "number" ? r.ratio : null;
  const at = typeof r?.at === "string" ? Date.parse(r.at) : NaN;
  if (x === null || !Number.isFinite(x) || x < 1.03 || x > 4) return null;
  if (!Number.isFinite(at) || now - at > 3 * 86_400_000) return null;
  return x;
}

/** The days a ratio can be worked out on, in the platform's own days: wholly counted (after `since`'s day), final (3+ days ago), inside the counts kept (the last 8 days). */
export function ratioDays(since: number | null, now: number, tz: string): string[] {
  if (since === null || !Number.isFinite(since)) return [];
  const first = dayAt(Math.max(since, now - 180 * HOUR), tz);
  const last = dayAt(now - 3 * 86_400_000, tz);
  const out: string[] = [];
  for (let t = now - 8 * 86_400_000; t <= now; t += HOUR) {
    const d = dayAt(t, tz);
    if (d > first && d <= last && !out.includes(d)) out.push(d);
  }
  return out;
}
