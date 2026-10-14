// YouTube's reach reports (1.19.0): impressions and click-through rate per
// video and day, from the Reporting API's CSV (lib/reach-parse.ts).
import { cursorAfter, parseReachCsv, sumReach } from "../modules/analytics/lib/reach-parse";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const HEAD = "date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr";

// The usual: the CTR as a share of 1.
const a = parseReachCsv(`${HEAD}\n20261012,UCx,abc123,15230,0.0412\n20261012,UCx,def_456-X,1000,0.1\n`);
ok(a.length === 2, `two rows (got ${a.length})`);
ok(a[0].day === "2026-10-12" && a[0].video === "abc123" && a[0].impressions === 15230, "day, video and impressions");
ok(a[0].ctr === 4.12, `0.0412 is 4.12% (got ${a[0].ctr})`);
ok(a[1].ctr === 10, `0.1 is 10% (got ${a[1].ctr})`);

// Out of 100 (any value above 1 says so).
const b = parseReachCsv(`${HEAD}\n20261012,UCx,abc123,2000,4.5\n20261012,UCx,def456,100,0.5\n`);
ok(b[0].ctr === 4.5 && b[1].ctr === 0.5, `percent values stay (got ${b.map((r) => r.ctr).join(", ")})`);

// The same video and day twice: impressions add, the CTR is weighted.
const c = parseReachCsv(`${HEAD}\r\n20261012,UCx,abc123,1000,0.05\r\n20261012,UCx,abc123,3000,0.09\r\n`);
ok(c.length === 1 && c[0].impressions === 4000, `merged into one row of 4,000 (got ${c.length}, ${c[0]?.impressions})`);
ok(c[0].ctr === 8, `weighted CTR 8% (got ${c[0].ctr})`);

// Bad rows are skipped; a missing CTR stays unknown; columns found by name, quotes allowed.
const d = parseReachCsv(
  [
    "video_id,date,video_thumbnail_impressions,channel_id,video_thumbnail_impressions_ctr",
    '"q""1",20261012,10,UCx,0.1',
    "good1,2026-10-12,10,UCx,0.1",
    "good2,20261012,abc,UCx,0.1",
    "good3,20261012,-5,UCx,0.1",
    'good4,20261013,"1,500",UCx,',
    "good5,20261013,20,UCx,0.25",
  ].join("\n")
);
ok(d.length === 1 && d[0].video === "good5", `only the clean row with a number (got ${d.map((r) => r.video).join(", ")})`);
const e = parseReachCsv(`${HEAD}\n20261013,UCx,good6,50,\n`);
ok(e.length === 1 && e[0].ctr === null && e[0].impressions === 50, "no CTR: impressions only");
ok(parseReachCsv("").length === 0 && parseReachCsv(HEAD).length === 0, "nothing in, nothing out");
ok(parseReachCsv("date,video_id\n20261012,abc").length === 0, "without impressions: nothing");
ok(parseReachCsv(`﻿${HEAD}\n20261012,UCx,abc123,5,0`)[0]?.ctr === 0, "a byte-order mark and a zero CTR");
// 1.22.0: no impressions, no click-through rate (not 0%).
ok(parseReachCsv(`${HEAD}\n20261012,UCx,abc123,0,0`)[0]?.ctr === null, "no impressions: no CTR");

// A day's totals: impressions add up, the CTR is weighted by impressions.
const t = sumReach([
  { impressions: 1000, ctr: 5 },
  { impressions: 3000, ctr: 9 },
  { impressions: 500, ctr: null },
  { impressions: null, ctr: 50 },
]);
ok(t.impressions === 4500, `4,500 impressions (got ${t.impressions})`);
ok(t.ctr === 8, `CTR from the rows that have one (got ${t.ctr})`);
ok(sumReach([]).ctr === null && sumReach([{ impressions: 10, ctr: null }]).ctr === null, "no CTR known: null");

// 1.22.0: the next run never skips a report made at the same moment as the last one saved.
const R = (t: string) => ({ createTime: t });
ok(cursorAfter([R("2026-10-01T08:00:00Z"), R("2026-10-01T09:00:00Z")], R("2026-10-01T10:00:00Z"), null) === "2026-10-01T09:00:00Z", "after the last one saved");
ok(cursorAfter([R("2026-10-01T08:00:00Z"), R("2026-10-01T09:00:00Z")], R("2026-10-01T09:00:00Z"), null) === "2026-10-01T08:00:00Z", "the next one at the same moment: the moment before");
ok(cursorAfter([R("2026-10-01T09:00:00Z")], R("2026-10-01T09:00:00Z"), "2026-09-30T00:00:00Z") === "2026-09-30T00:00:00Z", "only that moment saved: where it started");
ok(cursorAfter([], R("2026-10-01T09:00:00Z"), "2026-09-30T00:00:00Z") === "2026-09-30T00:00:00Z", "nothing saved: unchanged");
ok(cursorAfter([R("2026-10-01T09:00:00Z")], null, null) === "2026-10-01T09:00:00Z", "the last one there");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("reach: all good");
