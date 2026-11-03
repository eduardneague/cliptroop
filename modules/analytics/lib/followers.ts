/**
 * New followers per day (1.34.4: the dashboard's Followers widget draws
 * them as bars). Pure, so the tests can check them.
 */

type Flow = { gained: (number | null)[]; lost: (number | null)[] };

/**
 * One platform's new followers each day: gained − lost where the platform
 * says (YouTube, Facebook); else the change in its count since the last day
 * it was counted (a gap's change lands on the day after it, so the days add
 * up to the whole change); null where neither is known.
 */
export function followerGains(days: number, daily?: (number | null)[] | null, flow?: Flow | null): (number | null)[] {
  if (flow) {
    return Array.from({ length: days }, (_, i) => {
      const g = flow.gained[i] ?? null;
      const l = flow.lost[i] ?? null;
      return g === null && l === null ? null : (g ?? 0) - (l ?? 0);
    });
  }
  const out: (number | null)[] = Array.from({ length: days }, () => null);
  if (!daily) return out;
  let last: number | null = null;
  for (let i = 0; i < days; i++) {
    const v = daily[i] ?? null;
    if (v === null) continue;
    if (last !== null) out[i] = v - last;
    last = v;
  }
  return out;
}

/** Several platforms' days added together: null on a day none of them has a number. */
export function sumSeries(series: (number | null)[][], days: number): (number | null)[] {
  return Array.from({ length: days }, (_, i) => {
    let any = false;
    let s = 0;
    for (const xs of series) {
      const v = xs[i];
      if (v !== null && v !== undefined) {
        s += v;
        any = true;
      }
    }
    return any ? s : null;
  });
}
