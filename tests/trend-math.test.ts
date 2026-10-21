// The Overview's numbers (1.20.0, lib/trend-math.ts): each platform's day from the morning copy
// (TikTok's per-video views or the change in its running total, followers gained − lost or the change
// in the count), days rolled up into weeks and months, rates weighted, running totals, changes.
import { addReported, addSeries, bucketDays, lastIndex, reportedUntil, change, combineRates, dailySeries, defaultGran, gransFor, hourIndex, hourSlots, rollup, runningTotal, total, weightedAvg, type DailyRow } from "../modules/analytics/lib/trend-math";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const days = ["2026-10-01", "2026-10-02", "2026-10-03"];
const rows: DailyRow[] = [
  { platform: "youtube", content: "all", day: "2026-10-01", views: 100, likes: 5, comments: 1, shares: 2, watch_minutes: 90, followers_gained: 4, followers_lost: 1, impressions: 1000, ctr: 5 },
  { platform: "youtube", content: "all", day: "2026-10-02", views: 200, likes: 10, comments: null, shares: null, watch_minutes: 120, followers_gained: 2, followers_lost: 3, impressions: 3000, ctr: 9 },
  { platform: "youtube", content: "shorts", day: "2026-10-01", views: 70 },
  // TikTok: the copy's own per-day views on the 2nd; otherwise the change in the running total.
  { platform: "tiktok", content: "all", day: "2026-10-01", total_views: 1000, total_likes: 50, followers: 300 },
  { platform: "tiktok", content: "all", day: "2026-10-02", total_views: 1400, total_likes: 70, followers: 290, views: 333 },
  { platform: "tiktok", content: "all", day: "2026-10-03", total_views: 1500, total_likes: 65, followers: 310 },
  { platform: "tiktok", content: "all", day: "2026-10-04", total_views: 1600, total_likes: 80, followers: 320 },
  { platform: "facebook", content: "all", day: "2026-10-01", engagements: 42, likes: 1, comments: 1 },
];
const yt = dailySeries(rows, "youtube", days);
ok(eq(yt.views, [100, 200, null]), `YouTube views per day (got ${JSON.stringify(yt.views)})`);
ok(eq(yt.watch, [1.5, 2, null]), "watch time in hours");
ok(eq(yt.followers, [3, -1, null]), "followers: gained − lost (it can be negative)");
ok(eq(yt.engagement, [8, 10, null]), "engagement: likes + comments + shares that are there");
ok(eq(yt.impressions, [1000, 3000, null]) && eq(yt.ctr, [5, 9, null]), "impressions and CTR");
ok(eq(dailySeries(rows, "youtube", days, "shorts").views, [70, null, null]), "one content (Shorts) at a time");
const tt = dailySeries(rows, "tiktok", days);
ok(eq(tt.views, [400, 333, 100]), `TikTok: running total's change, the copy's own count when there is one (got ${JSON.stringify(tt.views)})`);
ok(eq(tt.likes, [20, 0, 15]), `TikTok likes: the change, never below zero (got ${JSON.stringify(tt.likes)})`);
ok(eq(tt.followers, [-10, 20, 10]), `TikTok followers: the change in the count, which can drop (got ${JSON.stringify(tt.followers)})`);
ok(eq(dailySeries(rows, "facebook", days).engagement.slice(0, 1), [42]), "Facebook: its own post engagements");
ok(eq(dailySeries(rows, "instagram", days).views, [null, null, null]), "no rows: no numbers (not zeros)");

ok(total([1, null, 2]) === 3 && total([null, null]) === null, "total: nulls skipped, none = null");
ok(eq(addSeries([[1, null, 3], [2, null, null]]), [3, null, 3]), "series added point by point");
ok(weightedAvg([5, 9], [1000, 3000]) === 8, "CTR weighted by impressions: 8%");
ok(weightedAvg([5, null], [0, 10]) === null, "no weight: no rate");
const c = combineRates([
  { values: [5, 10], weights: [1000, 0] },
  { values: [9, 20], weights: [3000, 100] },
]);
ok(eq(c.values, [8, 20]) && eq(c.weights, [4000, 100]), `two platforms' rates into one (got ${JSON.stringify(c)})`);

// Weeks from Monday, months; the first and last cut to the range.
const range = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 8, 25 + i)).toISOString().slice(0, 10)); // Fri Sep 25 → Tue Nov 3
const weeks = bucketDays(range, "week");
ok(weeks[0].key === "2026-09-21" && weeks[0].idx.length === 3, `the first week from Monday Sep 21, 3 days in range (got ${weeks[0].key}, ${weeks[0].idx.length})`);
ok(weeks.slice(1, -1).every((w) => w.idx.length === 7), "whole weeks in between");
ok(weeks.reduce((t, w) => t + w.idx.length, 0) === 40, "every day once");
const months = bucketDays(range, "month");
ok(months.length === 3 && months[0].label === "Sep ’26" && months[1].tip === "October 2026", `months (got ${months.map((m) => m.label + "/" + m.tip).join(", ")})`);
ok(bucketDays(days, "day").length === 3 && bucketDays(days, "day")[0].label === "Oct 1", "days as they are");
const vals = range.map((_, i) => (i % 2 ? 1 : null));
ok(eq(rollup(vals, weeks).slice(0, 2), [1, 4]), `sums per week (got ${JSON.stringify(rollup(vals, weeks).slice(0, 2))})`);
ok(eq(rollup([5, 9], [{ key: "a", label: "", tip: "", idx: [0, 1] }], [1000, 3000]), [8]), "a rate per bucket is weighted");
ok(eq(runningTotal([null, 2, null, 3]), [null, 2, 2, 5]), "running total: nothing before the first number, gaps keep it");
ok(eq(runningTotal([1, 2, null, null]), [1, 3, null, null]), "running total: nothing after the last number (no data yet)");
ok(change(120, 100) === 20 && change(80, 100) === -20 && change(5, 0) === null && change(0, 0) === 0 && change(null, 5) === null, "changes");
ok(eq(gransFor(7, false), ["day"]) && eq(gransFor(90, false), ["day", "week"]) && eq(gransFor(365, false), ["day", "week", "month"]) && eq(gransFor(2, true), ["hour"]), "granularities per range");
ok(defaultGran(28, false) === "day" && defaultGran(90, false) === "week" && defaultGran(365, false) === "month" && defaultGran(2, true) === "hour", "the granularity a range starts with");

const now = Date.UTC(2026, 9, 13, 12, 30);
const slots = hourSlots(now, 96);
ok(slots.length === 96 && slots[95] === "2026-10-13T12:00:00.000Z" && slots[0] === "2026-10-09T13:00:00.000Z", "96 hours ending with the one going on now");
ok(hourIndex(slots, "2026-10-13T12:59:00Z") === 95 && hourIndex(slots, "2026-10-09T12:59:00Z") === -1 && hourIndex(slots, "nope") === -1, "a moment's hour");

// 1.29.0: days a platform hasn't reported yet aren't totals of the others (the line ends there).
{
  const yt = [100, 120, 110, null, null];
  const ig = [10, 12, 11, 9, 8];
  ok(lastIndex(yt) === 2 && lastIndex(ig) === 4 && lastIndex([null, null]) === -1, "lastIndex");
  ok(reportedUntil([yt, ig]) === 2, `YouTube two days late: totals to its last day (got ${reportedUntil([yt, ig])})`);
  ok(eq(addReported([yt, ig]), [110, 132, 121, null, null]), `no drop to almost nothing at the end (got ${JSON.stringify(addReported([yt, ig]))})`);
  // A platform that stopped long ago (more than the lag) doesn't hold the rest back.
  const fb = [5, null, null, null, null, null, null, null];
  const yt2 = [1, 2, 3, 4, 5, 6, 7, 8];
  ok(reportedUntil([fb, yt2]) === 7, "a platform that stopped isn't late");
  ok(eq(addReported([[1, 2], [3, 4]]), [4, 6]), "all reported: the same as adding");
  ok(eq(addReported([[null], [null]]), [null]), "nothing at all");
}
if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("trend math: all good");
