/*
 * A small limit on how often one person (or one address) may do something,
 * per server instance (1.31.0). It keeps a sliding window of the last
 * calls' times in memory: enough to stop a loop or a script hammering one
 * endpoint, not a guarantee across all of Vercel's instances (the database
 * and Supabase Auth keep their own limits for what matters most).
 */

type Window = { at: number[] };

const buckets = new Map<string, Map<string, Window>>();
/** Past this many keys in one bucket, the oldest ones are dropped (memory stays small). */
const MAX_KEYS = 5000;

/**
 * Whether `key` has gone over `max` calls in the last `windowMs` in
 * `bucket` (this call counts). `now` is for tests.
 */
export function overLimit(bucket: string, key: string, max: number, windowMs: number, now = Date.now()): boolean {
  let b = buckets.get(bucket);
  if (!b) buckets.set(bucket, (b = new Map()));
  const w = b.get(key) ?? { at: [] };
  w.at = w.at.filter((t) => now - t < windowMs);
  w.at.push(now);
  // Most recently used last, so the oldest are dropped first.
  b.delete(key);
  b.set(key, w);
  if (b.size > MAX_KEYS) {
    for (const k of b.keys()) {
      b.delete(k);
      if (b.size <= MAX_KEYS) break;
    }
  }
  return w.at.length > max;
}

/** Forget everything (tests). */
export function resetLimits() {
  buckets.clear();
}
