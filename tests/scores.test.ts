// "× typical" and growth curves (1.17.0): a video's views next to the
// median of the same kind posted before it, ranks, and views by the day
// since it was posted (from YouTube's per-day numbers or the copies' totals).
import { cumulativeByAge, median, outlierScores, perDayFrom, rankOf, scoreText, scoreTone, typicalCurve, versusTypical, type DayRow, type ScoreInput } from "../modules/analytics/lib/scores";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const near = (a: number | null | undefined, b: number, eps = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) < eps;

// Median.
ok(median([]) === null, "no numbers, no median");
ok(median([5]) === 5, "one number");
ok(median([3, 1, 2]) === 2, "odd count");
ok(median([4, 1, 3, 2]) === 2.5, "even count: the middle two averaged");
ok(median([1, NaN, 3]) === 2, "not-a-number left out");

// Scores: each against the (up to 30) of the same kind before it.
const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}T12:00:00Z`;
const shorts: ScoreInput[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `s${n}`, platform: "youtube", kind: "short", publishedAt: day(n), views: 1000 * n }));
const longs: ScoreInput[] = [{ id: "l1", platform: "youtube", kind: "long", publishedAt: day(3), views: 50_000 }];
const viral: ScoreInput = { id: "s8", platform: "youtube", kind: "short", publishedAt: day(8), views: 40_000 };
const sc = outlierScores([...shorts, ...longs, viral]);
// s8: the 7 before it have a median of 4,000.
ok(near(sc.get("s8")?.typical, 4000) && near(sc.get("s8")?.score, 10) && sc.get("s8")?.peers === 7, `s8 is 10× its typical (got ${sc.get("s8")?.score})`);
// s6: 5 before it (1K..5K): median 3K → 2×.
ok(near(sc.get("s6")?.typical, 3000) && near(sc.get("s6")?.score, 2), `s6 vs the 5 before it (got ${sc.get("s6")?.typical})`);
// s2: fewer than 5 before it: measured against all the others (1,3,4,5,6,7,40 K → 5K).
ok(near(sc.get("s2")?.typical, 5000), `an early video against all the others (got ${sc.get("s2")?.typical})`);
// A long video alone: nothing to compare with.
ok(sc.get("l1")?.score === null && sc.get("l1")?.peers === 0, "long videos are only compared with long videos");
// No views: no score.
const nv = outlierScores([...shorts, { id: "x", platform: "youtube", kind: "short", publishedAt: day(9), views: null }]);
ok(nv.get("x")?.score === null && nv.get("x")?.typical !== null, "no views yet: typical known, no score");
// Other platforms don't mix.
const mixed = outlierScores([...shorts, { id: "t1", platform: "tiktok", kind: "short", publishedAt: day(9), views: 99 }]);
ok(mixed.get("t1")?.score === null, "a TikTok video isn't measured against YouTube Shorts");
// Only the 30 before it count.
const many: ScoreInput[] = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, platform: "youtube", kind: "short", publishedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), views: i < 10 ? 1_000_000 : 100 }));
many.push({ id: "last", platform: "youtube", kind: "short", publishedAt: "2026-03-01T00:00:00Z", views: 300 });
ok(near(outlierScores(many).get("last")?.typical, 100), "the oldest ones (beyond 30) don't count");

// Words and tones.
ok(scoreText(3.44) === "3.4×" && scoreText(12.6) === "13×" && scoreText(0.55) === "0.6×" && scoreText(0.04) === "0.04×" && scoreText(null) === "–", "score text");
ok(scoreTone(3.2) === "high" && scoreTone(1.5) === "up" && scoreTone(1) === "usual" && scoreTone(0.5) === "down" && scoreTone(null) === "none", "score tone");

// Ranks.
const list = [
  { id: "a", v: 10 },
  { id: "b", v: 30 },
  { id: "c", v: null },
  { id: "d", v: 30 },
  { id: "e", v: 5 },
];
const r = (id: string, low = false) => rankOf(list, id, (x) => x.v, low);
ok(r("b")?.rank === 1 && r("d")?.rank === 1 && r("a")?.rank === 3 && r("a")?.of === 4, "ties share the better rank; no number isn't counted");
ok(r("c") === null, "no number, no rank");
ok(r("e", true)?.rank === 1, "lower is better when asked");

// Growth from YouTube's per-day numbers.
const yt: DayRow[] = [
  { day: "2026-10-01", source: "daily", views: 100 },
  { day: "2026-10-02", source: "daily", views: 300 },
  { day: "2026-10-04", source: "daily", views: 50 },
];
const c1 = cumulativeByAge(yt, "2026-10-01", 10, "2026-10-08");
ok(c1.length === 8 && c1[0] === 100 && c1[1] === 400 && c1[2] === 400 && c1[3] === 450 && c1[4] === null, `daily numbers add up, a missing day is 0, unknown after the last (got ${JSON.stringify(c1)})`);
ok(cumulativeByAge(yt, "2026-09-25", 10, "2026-10-08").every((v) => v === null), "numbers that start long after posting: unknown");
const early: DayRow[] = [
  { day: "2026-09-30", source: "daily", views: 20 },
  { day: "2026-10-01", source: "daily", views: 80 },
];
ok(cumulativeByAge(early, "2026-10-01", 3, "2026-10-03")[0] === 100, "YouTube's day before (its time zone) counts as the first day");
ok(cumulativeByAge(yt, "2026-10-01", 2, "2026-10-08").length === 3, "only up to maxAge");

// Growth from running totals (the copies).
const tt: DayRow[] = [
  { day: "2026-10-02", source: "total", views: 1000 },
  { day: "2026-10-05", source: "total", views: 4000 },
];
const c2 = cumulativeByAge(tt, "2026-10-01", 10, "2026-10-06");
ok(c2[0] === 0 && c2[1] === 1000 && c2[2] === 2000 && c2[3] === 3000 && c2[4] === 4000 && c2[5] === null, `totals: 0 on the day it was posted, a straight line between copies (got ${JSON.stringify(c2)})`);
const late: DayRow[] = [{ day: "2026-10-09", source: "total", views: 9000 }];
const c3 = cumulativeByAge(late, "2026-10-01", 10, "2026-10-10");
ok(c3[0] === null && c3[8] === 9000, "a first copy long after posting: unknown before it");
ok(JSON.stringify(perDayFrom([0, 1000, 2000, null, 4000])) === JSON.stringify([0, 1000, 1000, null, null]), "per day from a running total");

// Typical curve and the line of words.
const t = typicalCurve(
  [
    [10, 20, 30],
    [20, 40, null],
    [30, 60, 90],
  ],
  3
);
ok(t[0] === 20 && t[1] === 40 && t[2] === null, `typical: the median at each day, needs 3 videos (got ${JSON.stringify(t)})`);
// Different videos on different days: the typical never goes down.
const mono = typicalCurve(
  [
    [10, 50, 50],
    [10, 50, null],
    [10, 60, 20],
    [null, null, 20],
  ],
  3
);
ok(mono[1] === 50 && mono[2] === 50, `typical views so far never fall (got ${JSON.stringify(mono)})`);
const vt = versusTypical([5, 30, 50, 80], [10, 20, 40, 60]);
ok(!!vt && vt.ahead && vt.since === 1 && near(vt.ratio, 80 / 60), `ahead since day 1 (got ${JSON.stringify(vt)})`);
const vb = versusTypical([5, 10], [10, 20]);
ok(!!vb && !vb.ahead && vb.since === 0, "behind from the start");
ok(versusTypical([null], [null]) === null, "nothing to compare");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("scores: all good");
