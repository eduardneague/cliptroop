// Outliers' collector, the pure parts (1.27.0): YouTube's daily budgets and
// pacing, which searches a niche is due for, how much of a channel is about a
// niche, and a thumbnail's numbers from its pixels.
import { hoursIntoQuotaDay, leftToday, pacedCap, readBudgets } from "../modules/outliers/lib/budget";
import { dueSearches, keywordStems, relevanceOf, TASKS } from "../modules/outliers/lib/plan";
import { dHash, lumSat, palette, shortCrop, shrink, thumbNumbers, type Pixels } from "../modules/outliers/lib/thumb-math";
import { hamming } from "../modules/outliers/lib/similar";
import { familyOf } from "../modules/outliers/lib/insights";
import { nicheColor, EXPLORE } from "../modules/outliers/lib/explore";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// Budgets
{
  const b = readBudgets({});
  ok(b.searches === 90 && b.crawlSearches === 45 && b.personSearches === 15 && b.teamSearches === 40 && b.units === 4000 && b.stats === 5000 && b.statsDays === 30 && b.explore, "defaults");
  const c = readBudgets({ OUTLIERS_SEARCHES_PER_DAY: "20", OUTLIERS_CRAWL_SEARCHES: "50", OUTLIERS_STATS_DAYS: "9999", OUTLIERS_EXPLORE: "0", OUTLIERS_DAILY_UNITS: "abc" });
  ok(c.searches === 20 && c.crawlSearches === 20, "the collector never gets more searches than there are");
  ok(c.statsDays === 1095 && !c.explore && c.units === 4000, "limits and odd values");
  ok(pacedCap(2400, 0) === 300 && pacedCap(2400, 21) === 2400 && pacedCap(2400, 12) === 1500, "paced by the hour, with a head start");
  ok(pacedCap(2400, 0, true) === 960, "a new niche may use 40% at once");
  ok(leftToday(2400, 250, 0) === 50 && leftToday(2400, 400, 0) === 0 && leftToday(2400, 2390, 23) === 10, "what's left now");
  const h = hoursIntoQuotaDay(new Date("2026-10-20T07:00:00Z"));
  ok(h === 0, `midnight in Los Angeles in summer time (${h})`);
  ok(hoursIntoQuotaDay(new Date("2026-12-20T20:30:00Z")) === 12.5, "and in winter");
}

// Searches due
{
  const now = Date.parse("2026-10-20T12:00:00Z");
  const team = { keywords: ["fake iphone", "phone review"], crawl: {}, team_id: "t" };
  const due = dueSearches(team, now);
  ok(due.length === TASKS.length * 2, `every search is due for a new niche (${due.length})`);
  ok(due[0].key === "top90:fake iphone" && due[1].key === "top90:phone review", `the top of the last 90 days first, for each keyword (${due.slice(0, 2).map((d) => d.key)})`);
  const done = { ...team, crawl: { searches: { "top90:fake iphone": new Date(now - 2 * 86_400_000).toISOString(), "new:fake iphone": new Date(now - 2 * 86_400_000).toISOString() } } };
  const d2 = dueSearches(done, now);
  ok(!d2.some((d) => d.key === "top90:fake iphone") && d2.some((d) => d.key === "new:fake iphone"), "done 2 days ago: the weekly one waits, the daily one doesn't");
  ok(d2.findIndex((d) => d.key === "new:fake iphone") > d2.findIndex((d) => d.key === "top365:fake iphone"), "never-run searches before repeats");
  const explore = dueSearches({ keywords: ["cooking"], crawl: {}, team_id: null }, now);
  ok(!explore.some((d) => d.task.id === "new"), "explore niches don't chase brand new videos");
  const exDone = dueSearches({ keywords: ["cooking"], crawl: { searches: { "top90:cooking": new Date(now - 10 * 86_400_000).toISOString() } }, team_id: null }, now);
  ok(!exDone.some((d) => d.key === "top90:cooking"), "explore niches search three times less often");
}

// Relevance
{
  const stems = keywordStems(["fake iphone", "phone review", "the best"]);
  ok(JSON.stringify(stems) === JSON.stringify([["iphone"], ["phone"]]), `a keyword's topic words (${JSON.stringify(stems)})`);
  const titles = [
    { title: "I Bought 3 Fake iPhones", tags: null },
    { title: "Pasta recipe", tags: ["cooking"] },
    { title: "Best camera", tags: ["phone"] },
    { title: "Unboxing", tags: null },
  ];
  ok(relevanceOf(titles, stems) === 0.5, `half the channel is about it (${relevanceOf(titles, stems)})`);
  ok(relevanceOf([], stems) === 0 && relevanceOf(titles, []) === 0, "nothing to go on: 0");
  ok(relevanceOf([{ title: "iPhone 17 review", tags: null }], keywordStems(["iphone 17"])) === 1, "numbers count in keywords");
}

// Thumbnails
{
  // A 64×36 picture: left half red, right half blue, a white stripe at the bottom.
  const w = 64;
  const h = 36;
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const white = y >= 30;
      data[i] = white ? 255 : x < 32 ? 220 : 20;
      data[i + 1] = white ? 255 : 20;
      data[i + 2] = white ? 255 : x < 32 ? 30 : 230;
    }
  const p: Pixels = { width: w, height: h, data, channels: 3 };
  const cells = shrink(p, 2, 1);
  ok(cells.length === 2 && cells[0][0] > 150 && cells[1][2] > 150, "shrinking keeps each half's colour");
  const pal = palette(p);
  ok(pal.length >= 2 && pal.length <= 5, `a few main colours (${pal})`);
  ok(familyOf(pal[0]) === "red" || familyOf(pal[0]) === "blue", `the biggest colour first (${pal[0]} → ${familyOf(pal[0])})`);
  ok(pal.some((c) => familyOf(c) === "light"), "the white stripe is one of them");
  const hash = dHash(p);
  ok(/^[0-9a-f]{16}$/.test(hash), `a 16-character fingerprint (${hash})`);
  const brighter = { ...p, data: data.map((v) => Math.min(255, v + 10)) };
  ok(hamming(hash, dHash(brighter)) <= 4, "a slightly brighter copy has nearly the same fingerprint");
  const flipped = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) flipped[(y * w + x) * 3 + c] = data[(y * w + (w - 1 - x)) * 3 + c];
  ok(hamming(hash, dHash({ ...p, data: flipped })) > 8, "a mirrored picture doesn't");
  const ls = lumSat(p);
  ok(ls.lum > 40 && ls.lum < 200 && ls.sat > 100, `brightness and colourfulness (${JSON.stringify(ls)})`);
  const crop = shortCrop(480, 360);
  ok(crop.w === 203 && crop.x === 139 && crop.h === 360, `a Short's tall middle (${JSON.stringify(crop)})`);
  const all = thumbNumbers(p);
  ok(all.hash === hash && all.colors.length === pal.length, "all at once");
  const rgba: Pixels = { width: 2, height: 1, data: [255, 0, 0, 255, 0, 0, 255, 255], channels: 4 };
  ok(shrink(rgba, 2, 1)[1][2] === 255, "four channels (with alpha) read right");
}

// Colours of niches
ok(nicheColor("blue") === "rgb(var(--obj-blue))" && nicheColor("pink") === "rgb(var(--pink))" && nicheColor("nope") === "rgb(var(--obj-blue))", "niche colours");
ok(EXPLORE.length === 24 && new Set(EXPLORE.map((e) => e.slug)).size === 24 && EXPLORE.every((e) => e.keywords.length >= 3 && e.name.length <= 40), "24 explore niches, each with keywords");

if (fails) {
  console.log(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log("outliers collector: all checks passed");
