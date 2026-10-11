// Audience retention curves (1.16.0): reading YouTube's and Facebook's
// shapes, the share still watching anywhere in a video, averages and the
// summary the Advanced page and the Claude export show.
import { averageCurve, curveAt, facebookRetention, readCurve, relativeAt, resample, retentionPoints, summarize, type RetentionPoint } from "../modules/analytics/lib/retention";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const near = (a: number | null | undefined, b: number, eps = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) < eps;

// YouTube's report rows.
const yt = retentionPoints([
  { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.5, relativeRetentionPerformance: 0.6 },
  { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1.2, relativeRetentionPerformance: 0.7 },
  { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2, relativeRetentionPerformance: null },
  { elapsedVideoTimeRatio: "0.25", audienceWatchRatio: "0.8" },
  { elapsedVideoTimeRatio: 2, audienceWatchRatio: 0.1 },
  { elapsedVideoTimeRatio: 0.75, audienceWatchRatio: null },
]);
ok(yt.length === 4, `YouTube rows: out-of-range and empty points dropped (got ${yt.length})`);
ok(yt[0][0] === 0 && yt[3][0] === 1, "sorted by position");
ok(yt[1][0] === 0.25 && yt[1][1] === 0.8 && yt[1][2] === null, "numbers sent as text are read; no relative = null");
ok(yt[0][1] === 1.2, "rewatches (above 1) are kept");

// Anywhere in between: a straight line between points.
ok(near(curveAt(yt, 0.375), 0.65), "halfway between two points");
ok(near(curveAt(yt, 0), 1.2) && near(curveAt(yt, 1), 0.2), "the ends");
ok(curveAt([], 0.5) === null, "no curve: no answer");
ok(near(relativeAt(yt, 0.25), 0.65), "compared with similar videos, only where YouTube said");

// Facebook's graph: an object of intervals, sometimes in percent.
const fb = facebookRetention({ "0": 100, "1": 80, "2": 50, "3": 40, "4": 30 });
ok(fb.length === 5 && near(fb[0][1], 1) && near(fb[4][1], 0.3) && near(fb[2][0], 0.5), "percent → shares; intervals → positions");
const fb2 = facebookRetention({ "2": 0.5, "0": 1, "1": 0.9 });
ok(near(fb2[1][1], 0.9) && near(fb2[2][0], 1), "shares stay shares; any order");
ok(facebookRetention(null).length === 0 && facebookRetention([1, 2]).length === 0 && facebookRetention({ "0": 1 }).length === 0, "nothing usable: no curve");

// Stored curves are checked when read.
ok(readCurve([[0, 1, null], ["x", 1], [0.5, -1], [1, 0.3, 0.4]]).length === 2, "odd points in storage are dropped");
ok(readCurve("nope").length === 0, "not a list: no curve");

// Even spacing, and averages where each video counts once.
const flat: RetentionPoint[] = [
  [0, 1, 0.5],
  [1, 1, 0.5],
];
const half: RetentionPoint[] = [
  [0, 1, null],
  [1, 0, null],
];
const r = resample(half, 5);
ok(r.length === 5 && near(r[2], 0.5) && near(r[4], 0), "resampled at even steps");
const avg = averageCurve([flat, half, []], 3);
ok(avg.length === 3 && near(avg[1][1], 0.75) && near(avg[2][1], 0.5) && near(avg[0][2], 0.5), "averaged point by point, empty curves ignored");
ok(averageCurve([]).length === 0, "nothing to average");

// The summary.
const curve: RetentionPoint[] = [
  [0, 1, 0.6],
  [0.05, 0.7, 0.6],
  [0.4, 0.62, 0.6],
  [0.45, 0.4, 0.6],
  [1, 0.3, 0.6],
];
const s = summarize(curve, 60);
ok(near(s.at3s, 0.7), "after 3 s of a 60 s video (5%)");
ok(near(s.at30s, 0.391, 0.001), `after 30 s, halfway through (got ${s.at30s})`);
ok(!!s.biggestDrop && s.biggestDrop.at >= 0.38 && s.biggestDrop.at <= 0.41, `the steep drop around 40% (got ${s.biggestDrop?.at})`);
ok(near(s.relative, 0.6), "compared with similar videos, on average");
ok(s.rewatchPeak === null, "no rewatches");
const short = summarize(
  [
    [0, 1, null],
    [0.5, 1.4, null],
    [1, 0.9, null],
  ],
  20
);
ok(short.at30s === null, "30 s doesn't apply to a 20 s video");
ok(!!short.rewatchPeak && near(short.rewatchPeak.ratio, 1.4), "a rewatched part is found");
ok(summarize([[0, 1, null]], 30).at25 === null, "one point isn't a curve");
ok(summarize(curve, null).at3s === null, "no length: no seconds");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("retention: all good");
