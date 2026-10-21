/*
 * YouTube's daily allowance, shared out (1.27.0). Pure.
 *
 * Since June 2026 a Google Cloud project gets three separate budgets a day
 * (midnight Pacific time to midnight): 100 searches, 10,000 units for every
 * other call (1 unit per call of up to 50 videos or channels), and 10,000
 * calls of videos.batchGetStats. Posting, analytics and the live counts use
 * the same 10,000 units, so Outliers only ever takes its own share:
 *
 *   OUTLIERS_SEARCHES_PER_DAY  searches Outliers may use in all (default 90)
 *   OUTLIERS_CRAWL_SEARCHES    of those, the collector's (default 45; the rest are people's)
 *   OUTLIERS_PERSON_SEARCHES   fresh YouTube searches one person may run a day (default 15)
 *   OUTLIERS_TEAM_SEARCHES     and one team (default 40)
 *   OUTLIERS_DAILY_UNITS       units of the 10,000 (default 4000)
 *   OUTLIERS_STATS_PER_DAY     batchGetStats calls (default 5000)
 *   OUTLIERS_STATS_DAYS        how long views over time are kept (default 30;
 *                              up to 1095 once YouTube's derived-metrics terms are accepted)
 *   OUTLIERS_EXPLORE           "0" turns the built-in explore niches off
 *   OUTLIERS_EXPLORE_UNITS     of the units, the explore niches' own (default 1200, 1.29.0:
 *                              they fill from well-known channels, so they need units,
 *                              not searches; a team's collecting can't use them up)
 *   OUTLIERS_EXPLORE_SEARCHES  of the collector's searches, the explore niches' (default 6)
 *
 * The collector also paces itself: by any hour it may have used its day's
 * share up to that hour plus a head start, so a busy morning doesn't leave
 * nothing for the evening, except for a niche that was just added.
 */

export type Budgets = {
  searches: number;
  crawlSearches: number;
  personSearches: number;
  teamSearches: number;
  units: number;
  stats: number;
  statsDays: number;
  explore: boolean;
  /** The explore niches' own units and searches (inside `units` and `crawlSearches`). */
  exploreUnits: number;
  exploreSearches: number;
};

const int = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function readBudgets(env: Record<string, string | undefined> = process.env): Budgets {
  const searches = int(env.OUTLIERS_SEARCHES_PER_DAY, 90, 0, 100_000);
  const crawlSearches = Math.min(searches, int(env.OUTLIERS_CRAWL_SEARCHES, 45, 0, 100_000));
  const units = int(env.OUTLIERS_DAILY_UNITS, 4000, 0, 10_000_000);
  const explore = env.OUTLIERS_EXPLORE !== "0";
  return {
    searches,
    crawlSearches,
    personSearches: int(env.OUTLIERS_PERSON_SEARCHES, 15, 0, 10_000),
    teamSearches: int(env.OUTLIERS_TEAM_SEARCHES, 40, 0, 100_000),
    units,
    stats: int(env.OUTLIERS_STATS_PER_DAY, 5000, 0, 10_000_000),
    statsDays: int(env.OUTLIERS_STATS_DAYS, 30, 1, 1095),
    explore,
    // Never more than half of either, so the teams always keep most of it.
    exploreUnits: explore ? Math.min(Math.floor(units / 2), int(env.OUTLIERS_EXPLORE_UNITS, 1200, 0, 10_000_000)) : 0,
    exploreSearches: explore ? Math.min(Math.floor(crawlSearches / 2), int(env.OUTLIERS_EXPLORE_SEARCHES, 6, 0, 100_000)) : 0,
  };
}

/** Hours since YouTube's day started (midnight in Los Angeles), 0…24. */
export function hoursIntoQuotaDay(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

/**
 * How much of a daily budget the collector may have spent by now: its share
 * of the hours gone plus a 3-hour head start (never more than the day's).
 * `boost` (a niche added in the last day) lets it use up to 40% at once.
 */
export function pacedCap(daily: number, hours: number, boost = false): number {
  const share = Math.min(1, (hours + 3) / 24);
  const paced = Math.floor(daily * share);
  return boost ? Math.max(paced, Math.floor(daily * 0.4)) : paced;
}

/** What the collector may still spend today out of `used` (never below 0). */
export function leftToday(daily: number, used: number, hours: number, boost = false): number {
  return Math.max(0, Math.min(daily - used, pacedCap(daily, hours, boost) - used));
}
