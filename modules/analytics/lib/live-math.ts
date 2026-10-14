/**
 * One video's live counts (1.19.0): the views it gained in a stretch of
 * time, from the counts the 10-minute job kept (analytics_live). A change
 * between two looks is spread evenly over the time between them, exactly
 * like analytics_live_hours() / analytics_live_gains() in the database
 * (migration 0083). Pure: tested in tests/live-math.test.ts.
 */

export type LivePoint = { at: number; views: number | null };

export const COUNT_KEYS = ["views", "likes", "comments", "shares"] as const;
export type CountKey = (typeof COUNT_KEYS)[number];
export type Counts = Record<CountKey, number | null>;
/** A video's counts as stored, with when the live job last read them (live_at) and when its row last changed. */
export type SeenCounts = Counts & { liveAt: string | null; updatedAt: string | null };
export type Snapshot = Counts & { id: string; at: string };

/**
 * What to keep of one read of some videos (lib/live.ts): `fresh`, the counts
 * now, for a video whose counts changed or that the live job sees for the
 * first time (its starting point); `before`, for a video whose counts
 * changed, the counts as last seen at the moment they were seen (unless
 * that's now), so the change is spread over exactly the time it happened in.
 * `keys`: the counts this read has (the others keep their stored values).
 */
export function snapshotsOf(read: { id: string; counts: Partial<Counts> }[], seen: Map<string, SeenCounts>, keys: readonly CountKey[], now: string): { fresh: Snapshot[]; before: Snapshot[] } {
  const nowMs = Date.parse(now);
  const fresh: Snapshot[] = [];
  const before: Snapshot[] = [];
  for (const r of read) {
    const was = seen.get(r.id);
    const cur = Object.fromEntries(COUNT_KEYS.map((k) => [k, keys.includes(k) ? (r.counts[k] ?? null) : (was?.[k] ?? null)])) as Counts;
    if (cur.views === null && cur.likes === null) continue;
    const changed = !!was && keys.some((k) => cur[k] !== null && cur[k] !== was[k]);
    if (!was || !was.liveAt || changed) fresh.push({ id: r.id, at: now, ...cur });
    if (was && changed && (was.views !== null || was.likes !== null)) {
      const at = Date.parse(was.liveAt ?? was.updatedAt ?? "");
      // (Older than the 8 days kept: nothing to spread it from.)
      if (Number.isFinite(at) && at < nowMs && nowMs - at < 8 * 86_400_000)
        before.push({ id: r.id, at: new Date(at).toISOString(), views: was.views, likes: was.likes, comments: was.comments, shares: was.shares });
    }
  }
  return { fresh, before };
}

type Step = { a: number; b: number; gain: number };

/** Each change between two looks (never negative: a platform can take views away). */
function steps(points: LivePoint[]): Step[] {
  const list = points.filter((p) => Number.isFinite(p.at)).sort((x, y) => x.at - y.at);
  const out: Step[] = [];
  for (let i = 1; i < list.length; i++) {
    const p = list[i - 1];
    const q = list[i];
    if (q.at <= p.at) continue;
    const gain = p.views === null || q.views === null ? 0 : Math.max(0, q.views - p.views);
    out.push({ a: p.at, b: q.at, gain });
  }
  return out;
}

/** The part of a step inside [from, to). */
const share = (s: Step, from: number, to: number) => {
  const lo = Math.max(s.a, from);
  const hi = Math.min(s.b, to);
  return hi > lo ? (s.gain * (hi - lo)) / (s.b - s.a) : 0;
};

/** Views gained from `from` (ms) to `to` (default: no end). */
export function gainedBetween(points: LivePoint[], from: number, to = Infinity): number {
  return Math.round(steps(points).reduce((t, s) => t + share(s, from, to), 0));
}

/** Views per hour, `hours` hours ending with the hour `now` is in (oldest first; each hour starts at `at`). */
export function perHour(points: LivePoint[], now: number, hours = 48): { at: number; views: number }[] {
  const HOUR = 3_600_000;
  const last = Math.floor(now / HOUR) * HOUR;
  const list = steps(points);
  return Array.from({ length: hours }, (_, i) => {
    const at = last - (hours - 1 - i) * HOUR;
    return { at, views: Math.round(list.reduce((t, s) => t + share(s, at, at + HOUR), 0)) };
  });
}

/**
 * Views per slot of `stepMs` over the last `count` slots, the last one
 * ending at `now` (1.21.0: a video's last 60 minutes in 10-minute slots),
 * oldest first; each slot starts at `at`.
 */
export function perSlot(points: LivePoint[], now: number, count = 6, stepMs = 600_000): { at: number; views: number }[] {
  const list = steps(points);
  const start = now - count * stepMs;
  return Array.from({ length: count }, (_, i) => {
    const at = start + i * stepMs;
    return { at, views: Math.round(list.reduce((t, s) => t + share(s, at, at + stepMs), 0)) };
  });
}

/** An hour's name for a tooltip: "Today, 3 PM", "Yesterday, 11 PM", "Mon, 9 AM" (the viewer's time). */
export function hourName(at: number, now: number): string {
  const d = new Date(at);
  const n = new Date(now);
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dayStart(n) - dayStart(d)) / 86_400_000);
  const day = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "short" });
  return `${day}, ${d.toLocaleTimeString("en-US", { hour: "numeric" })}`;
}

/**
 * How often the counts are read (1.19.0): every 10 minutes, or LIVE_MINUTES
 * (20, 30 or 60) for a lighter load on a small hosting plan. The timer still
 * calls every 10 minutes (at :05, :15 …); the calls in between do nothing.
 */
export function liveDue(now = new Date(), every = Number(process.env.LIVE_MINUTES)): boolean {
  const step = [20, 30, 60].includes(every) ? every / 10 : 1;
  return Math.floor(now.getUTCMinutes() / 10) % step === 0;
}
