import { addDays } from "./ranges";

/*
 * YouTube's older numbers (1.21.0; sync.ts youtubeHistory). The first copy
 * fetched 90 days, so Lifetime started 90 days before the channel was
 * connected. Each copy now goes back a year per report, newest first, until
 * the channel's first day. Pure; tests/history-math.test.ts.
 */

type Row = Record<string, unknown>;

/** The stretch before `to` that one report covers: at most `size` days, never before `born`. Null: nothing older to fetch. */
export function historyChunk(to: string, born: string, size = 365): { from: string; to: string } | null {
  if (!to || !born || to < born) return null;
  const from = addDays(to, -(Math.max(1, size) - 1));
  return { from: from < born ? born : from, to };
}

const viewsOf = (r: Row) => {
  const v = Number(r.views ?? 0);
  return Number.isFinite(v) ? v : 0;
};

/**
 * The rows of one stretch of YouTube's history to save. From the first day
 * with views on: the days before it are before the channel had any (not
 * zeros to draw on a chart, and not where Lifetime starts). Every later day
 * YouTube left out is saved as zeros: history is final, so a day it left
 * out had nothing. `base`: the fields every row has (team, platform,
 * updated_at). `first`: the first day with views (null: none in it).
 */
export function historyRows(rows: Row[], from: string, to: string, base: Row): { rows: Row[]; first: string | null } {
  const inside = rows.filter((r) => typeof r.day === "string" && r.day >= from && r.day <= to);
  const first =
    inside
      .filter((r) => (r.content ?? "all") === "all" && viewsOf(r) > 0)
      .map((r) => r.day as string)
      .sort()[0] ?? null;
  if (!first) return { rows: [], first: null };
  const kept = inside.filter((r) => (r.day as string) >= first);
  const have = new Set(kept.filter((r) => (r.content ?? "all") === "all").map((r) => r.day as string));
  // The kinds YouTube split this stretch into (1.22.0: Shorts, long videos, live streams):
  // a day left out had none of any of them either.
  const kinds = [...new Set(kept.map((r) => String(r.content ?? "all")).filter((c) => c !== "all"))];
  const split = new Set(kept.filter((r) => (r.content ?? "all") !== "all").map((r) => `${r.day}|${r.content}`));
  for (let d = first; d <= to; d = addDays(d, 1)) {
    if (!have.has(d)) kept.push({ ...base, day: d, content: "all", views: 0, watch_minutes: 0, likes: 0, comments: 0, shares: 0, followers_gained: 0, followers_lost: 0 });
    for (const k of kinds) if (!split.has(`${d}|${k}`)) kept.push({ ...base, day: d, content: k, views: 0, watch_minutes: 0, likes: 0, comments: 0, shares: 0 });
  }
  kept.sort((a, b) => String(a.day).localeCompare(String(b.day)) || String(a.content ?? "all").localeCompare(String(b.content ?? "all")));
  return { rows: kept, first };
}
