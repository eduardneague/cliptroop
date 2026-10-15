// Realtime's hours before every video was counted (1.22.0,
// modules/analytics/lib/realtime-math.ts): worked out from the account's
// running total of views, else its views per day, never below what was counted.
import { countRatio, dayAt, estimateHours, fillHours, hourlyFromDays, hourlyFromTotals, ratioDays, totalAt, usableRatio } from "../modules/analytics/lib/realtime-math";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const H = 3_600_000;
const t0 = Date.UTC(2026, 9, 13, 10); // 10:00 UTC
const pts = [
  { at: t0, total: 1000 },
  { at: t0 + 2 * H, total: 1300 },
  { at: t0 + 3 * H, total: 1300 },
];
ok(totalAt(pts, t0 + H) === 1150, `a straight line between two points (got ${totalAt(pts, t0 + H)})`);
ok(totalAt(pts, t0 - 1) === null && totalAt(pts, t0 + 3 * H + 1) === null, "nothing outside the points");
ok(totalAt([...pts].reverse(), t0 + 2 * H) === 1300, "order doesn't matter");
const hours = hourlyFromTotals(pts, [t0 - H, t0, t0 + H, t0 + 2 * H, t0 + 3 * H]);
ok(hours.join() === ",150,150,0,", `per hour, null where they don't reach (got ${hours.join()})`);
ok(hourlyFromTotals([{ at: t0, total: 500 }, { at: t0 + H, total: 400 }], [t0])[0] === 0, "never below 0 (a platform can take views away)");

// The day's views spread over its 24 hours, in the platform's own days.
const days = new Map([["2026-10-13", 2400]]);
ok(hourlyFromDays(days, [t0], "UTC")[0] === 100, "a day's views ÷ 24");
ok(hourlyFromDays(days, [Date.UTC(2026, 9, 14, 12)], "UTC")[0] === null, "a day without a number");
// 02:00 UTC on Oct 14 is still Oct 13 in Los Angeles (YouTube's days).
ok(dayAt(Date.UTC(2026, 9, 14, 2), "America/Los_Angeles") === "2026-10-13", `Pacific time (got ${dayAt(Date.UTC(2026, 9, 14, 2), "America/Los_Angeles")})`);
ok(hourlyFromDays(days, [Date.UTC(2026, 9, 14, 2)], "America/Los_Angeles")[0] === 100, "an hour belongs to its day in that time zone");

// Totals first, then days.
const e = estimateHours(pts, days, [t0 - H, t0], "UTC");
ok(e.values[0] === 100 && e.from[0] === "days", `before the totals: the day's share (got ${e.values[0]}, ${e.from[0]})`);
ok(e.values[1] === 150 && e.from[1] === "totals", "with the totals: their growth");

// Filling: counted from `since` on; before it the estimate, never below the count.
const starts = [t0, t0 + H, t0 + 2 * H, t0 + 3 * H];
const f = fillHours([40, 300, 200, 210], starts, t0 + 2 * H, [150, 150, 999, 999]);
ok(f.views.join() === "150,300,200,210", `before since: the estimate (not under the count); from since on: counted (got ${f.views.join()})`);
ok(f.estimated.join() === "true,false,false,false", `marked where the estimate was used (got ${f.estimated.join()})`);
const g = fillHours([5, 6], [t0, t0 + H], null, [null, 80]);
ok(g.views.join() === "5,80" && g.partial[0] && !g.partial[1] && g.estimated[1], `no full pass yet: every hour is before it (got ${g.views.join()} ${g.partial.join()})`);
const h = fillHours([5, 6], [t0, t0 + H], t0 + H / 2, [70, 80]);
ok(h.views.join() === "5,6" && !h.estimated[0], `the hour since falls in is counted (got ${h.views.join()})`);

// 1.23.1: the public counts lifted to the platform's own count.
const s = fillHours([40, 300, 200, 0], starts, t0 + 2 * H, [150, 150, 999, 999], { from: ["totals", "days", null, null], scale: 1.5 });
ok(s.views.join() === "225,300,300,0", `counted hours and running-total estimates lifted, the platform's own days not, 0 stays 0 (got ${s.views.join()})`);
ok(s.scaled.join() === "true,false,true,false" && s.estimated.join() === "true,false,true,false", `the lifted ones are marked (got ${s.scaled.join()} / ${s.estimated.join()})`);
const same = fillHours([40, 300], [t0, t0 + H], t0, [null, null], { scale: 1 });
ok(same.views.join() === "40,300" && !same.scaled.some(Boolean), "a ratio of 1 changes nothing");

// How much more the platform counted, on the days both are complete for.
const counted = new Map([["2026-10-08", 60_000], ["2026-10-09", 70_000], ["2026-10-10", 0], ["2026-10-11", 65_000]]);
const own = new Map([["2026-10-08", 84_000], ["2026-10-09", 95_000], ["2026-10-10", 90_000], ["2026-10-12", 1]]);
const r = countRatio(counted, own, ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
ok(!!r && r.from === "2026-10-08" && r.to === "2026-10-09" && r.counted === 130_000 && r.own === 179_000 && Math.abs(r.ratio - 1.377) < 0.001, `only days with both (got ${JSON.stringify(r)})`);
ok(countRatio(counted, own, ["2026-10-08"]) === null, "one day isn't enough");
ok(countRatio(new Map([["a", 100], ["b", 100]]), new Map([["a", 300], ["b", 300]]), ["a", "b"]) === null, "too few views to say");
const now = Date.UTC(2026, 9, 15, 17);
ok(usableRatio({ ratio: 1.38, at: new Date(now - 3600_000).toISOString() }, now) === 1.38, "a fresh, clear gap is used");
ok(usableRatio({ ratio: 1.01, at: new Date(now).toISOString() }, now) === null, "a gap under 3% isn't");
ok(usableRatio({ ratio: 9, at: new Date(now).toISOString() }, now) === null, "an odd one (over 4×) isn't");
ok(usableRatio({ ratio: 1.4, at: new Date(now - 4 * 86_400_000).toISOString() }, now) === null, "an old one isn't");
ok(usableRatio(null, now) === null, "none");
// Wholly counted, final, kept: counting since Oct 9 10:00 UTC, now Oct 15 17:00 UTC (10:00 in Los Angeles).
const rd = ratioDays(Date.UTC(2026, 9, 9, 10), now, "America/Los_Angeles");
ok(rd.join() === "2026-10-10,2026-10-11,2026-10-12", `the days after the one counting started, up to 3 days ago (got ${rd.join()})`);
ok(ratioDays(null, now, "UTC").length === 0, "not counted yet: none");
const old = ratioDays(Date.UTC(2026, 8, 1), now, "UTC");
ok(old[0] === "2026-10-09" && old[old.length - 1] === "2026-10-12", `inside the counts kept (got ${old.join()})`);

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("realtime-math: all passed");
