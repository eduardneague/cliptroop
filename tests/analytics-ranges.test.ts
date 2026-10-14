// Analytics date ranges: right length, back-to-back with the previous period, buckets cover every day once;
// 1.20.0: 48 hours on the Overview only, Lifetime from the first day with numbers, custom days checked.
import { RANGES, windowFor, bucketsFor, addDays, bucketOf, dayList, rangesFor, readRange, readTab, readCustom, daysBetween } from "../modules/analytics/lib/ranges";
let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log("FAIL", m); } };
for (const to of ["2026-10-03", "2026-03-01", "2024-02-29", "2026-01-01"]) {
  for (const r of RANGES) {
    // Lifetime and custom: from a start day (here 400 days back); the rest have a fixed length.
    const start = r.days ? null : addDays(to, -399);
    const days = r.days || 400;
    const w = windowFor(r.id, to, start);
    ok(w.to === to, `${r.id} to`);
    ok(dayList(w.from, w.to).length === days, `${r.id} ${to} days ${dayList(w.from, w.to).length}`);
    ok(w.days === days, `${r.id} w.days`);
    ok(addDays(w.prevTo, 1) === w.from, `${r.id} prev adjacent`);
    ok(dayList(w.prevFrom, w.prevTo).length === days, `${r.id} prev len`);
    const b = bucketsFor(w);
    ok(b[0].from === w.from && b[b.length - 1].to === w.to, `${r.id} ${to} bucket ends`);
    for (let i = 1; i < b.length; i++) ok(addDays(b[i - 1].to, 1) === b[i].from, `${r.id} contiguous ${i}`);
    ok(new Set(b.map((x) => x.key)).size === b.length, `${r.id} unique keys`);
    for (const d of dayList(w.from, w.to)) ok(bucketOf(b, d) !== null, `${r.id} covers ${d}`);
  }
}
// Without a start: lifetime is a year, custom 28 days.
ok(windowFor("lifetime", "2026-10-03").days === 365, "lifetime without a start: 365 days");
ok(windowFor("custom", "2026-10-03").days === 28, "custom without a start: 28 days");
ok(windowFor("lifetime", "2026-10-03", "2026-10-03").days === 1, "lifetime starting today: one day");
ok(windowFor("lifetime", "2026-10-03", "2026-11-01").days === 365, "a start after the end is ignored");
// 1.21.0: Lifetime says so (its splits come from the platforms' whole-life snapshots).
ok(windowFor("lifetime", "2026-10-03", "2025-01-27").lifetime === true, "Lifetime is marked");
ok(!windowFor("12m", "2026-10-03").lifetime && !windowFor("custom", "2026-10-03", "2025-01-27").lifetime, "the other ranges aren't");

// Tabs and their ranges.
ok(readTab(undefined) === "overview" && readTab("nope") === "overview", "the Overview is the default tab");
ok(readTab("realtime") === "realtime" && readTab("insights") === "insights", "the new tabs");
ok(rangesFor("overview").includes("48h"), "48 hours on the Overview");
ok(!rangesFor("audience").includes("48h") && !rangesFor("production").includes("48h"), "no 48 hours elsewhere");
ok(rangesFor("realtime").length === 0, "Realtime has its own 48 hours");
ok(readRange("48h", "overview") === "48h", "48h kept on the Overview");
ok(readRange("48h", "content") === "7d", "48h becomes 7 days elsewhere");
ok(readRange("bogus") === "28d", "28 days by default");
ok(readRange("lifetime", "audience") === "lifetime" && readRange("custom", "revenue") === "custom", "lifetime and custom everywhere");

// Custom days.
ok(JSON.stringify(readCustom("2026-09-01", "2026-09-30", "2026-10-03")) === JSON.stringify({ from: "2026-09-01", to: "2026-09-30" }), "custom days as picked");
ok(readCustom("2026-09-01", "2026-12-30", "2026-10-03")?.to === "2026-10-03", "the end is cut to the last day with numbers");
ok(readCustom("2026-10-05", "2026-10-09", "2026-10-03") === null, "a range after the last day: none");
ok(readCustom("2026-09-30", "2026-09-01", "2026-10-03") === null, "from after to: none");
ok(readCustom("2026-02-30", "2026-03-01", "2026-10-03") === null, "not a real day: none");
ok(readCustom("2026-9-1", "2026-09-30", "2026-10-03") === null, "not YYYY-MM-DD: none");
ok(readCustom(["2026-09-01"], "2026-09-30", "2026-10-03") === null, "an array (?from=a&from=b): none");
ok(readCustom("2010-01-01", "2026-09-30", "2026-10-03") === null && daysBetween("2010-01-01", "2026-09-30") > 3660, "at most 10 years");
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
