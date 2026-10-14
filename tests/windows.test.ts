// Window snapshots (1.21.0): which one a range shows (YouTube's whole life
// for Lifetime), what it says it covers, and YouTube's countries from the
// snapshot when the days' own don't cover the range
// (modules/analytics/lib/windows.ts).
import { coversRange, pickSpan, spanFor, windowWords, youtubeCountries } from "../modules/analytics/lib/windows";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// The window for a range.
ok(spanFor("youtube", { days: 7 }) === 7 && spanFor("youtube", { days: 28 }) === 28 && spanFor("youtube", { days: 90 }) === 90 && spanFor("youtube", { days: 365 }) === 365, "YouTube: 7 / 28 / 90 / 365");
ok(spanFor("youtube", { days: 40 }) === 90, "in between: the next one up");
ok(spanFor("youtube", { days: 120, lifetime: true }) === 0 && spanFor("youtube", { days: 500 }) === 0, "Lifetime, or more than a year: the whole life");
ok(spanFor("instagram", { days: 365, lifetime: true }) === 28 && spanFor("instagram", { days: 5 }) === 7, "Instagram: 28 days at most");

// The stored window to show.
ok(pickSpan([7, 28, 90, 365, 0], 90) === 90, "the one asked for");
ok(pickSpan([7, 28, 90, 365], 0) === 365, "the whole life not stored yet: the longest there is");
ok(pickSpan([7, 28], 90) === 28, "else the nearest");
ok(pickSpan([0, 7], 365) === 0, "a year is nearer the whole life than a week");
ok(pickSpan([0, 7], 28) === 7, "28 days, nearer a week");
ok(pickSpan([28, 90], 0) === 90, "the whole life not there: the longest");
ok(pickSpan([], 28) === null, "nothing stored: none");

// In words.
ok(windowWords("youtube", 0, "2026-10-12") === "Since the channel started, to Oct 12", windowWords("youtube", 0, "2026-10-12"));
ok(windowWords("instagram", 0, "2026-10-12") === "As the platform has it now", "Instagram's span 0 is a snapshot");
ok(windowWords("youtube", 365, null) === "The last 12 months" && windowWords("youtube", 28, "2026-10-12") === "The last 28 days, to Oct 12", "spans");

// Coverage.
ok(coversRange(26, { days: 28 }) && !coversRange(25, { days: 28 }), "90% of the days");

// YouTube's countries.
const days = (n: number) => Array.from({ length: n }, (_, i) => [{ country: "RO", value: 100, watch_minutes: 50, day: `2026-10-${String(i + 1).padStart(2, "0")}` }, { country: "MD", value: 10, watch_minutes: null, day: `2026-10-${String(i + 1).padStart(2, "0")}` }]).flat();
const windows = [
  { dimension: "country", key: "RO", span: 0, day: "2026-10-12", views: 900000, watch_minutes: 400000 },
  { dimension: "country", key: "IT", span: 0, day: "2026-10-12", views: 90000, watch_minutes: null },
  { dimension: "country", key: "RO", span: 28, day: "2026-10-12", views: 3000, watch_minutes: 1500 },
  { dimension: "search_term", key: "x", span: 0, day: "2026-10-12", views: 5 },
];
const own = youtubeCountries(days(28), windows, { days: 28 });
ok(own.span === null && own.sub === "Views in this range" && own.rows[0].country === "RO" && own.rows[0].views === 2800 && own.rows[0].watch === 1400, `the days' own when they cover the range (got ${JSON.stringify(own.rows[0])})`);
const life = youtubeCountries(days(20), windows, { days: 400, lifetime: true });
ok(life.span === 0 && life.sub.startsWith("Since the channel started") && life.rows.map((r) => r.country).join() === "RO,IT", `Lifetime: the whole-life snapshot (got ${life.span} ${life.rows.map((r) => r.country).join()})`);
const year = youtubeCountries(days(20), windows, { days: 365 });
ok(year.span === 0, "a year without its own snapshot yet: the longest there is");
const none = youtubeCountries(days(10), [], { days: 90 });
ok(none.span === null && none.rows.length === 2, "no snapshot: the days there are");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("windows: all good");
