// Insights (1.20.0, lib/insights-math.ts): what changed lately, the best time to post, tips.
import { allBestTimes, bestTimes, heatVideos, breakoutAlerts, ctrAlert, followerAlerts, gapAlerts, momentumAlerts, slumpAlerts, allAlerts, slotName, tipFor, type InsightVideo } from "../modules/analytics/lib/insights-math";
import type { Finding } from "../modules/analytics/lib/patterns";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 13, 12);
const vid = (o: Partial<InsightVideo> & { daysAgo: number }): InsightVideo => ({
  platform: "youtube",
  id: Math.random().toString(36).slice(2),
  kind: "short",
  title: "A video",
  views: 1000,
  score: 1,
  hour: 18,
  weekday: 1,
  ...o,
  publishedAt: new Date(now - o.daysAgo * DAY).toISOString(),
});

// Views this week vs last week.
const up = momentumAlerts([{ platform: "youtube", views: [...Array(7).fill(100), ...Array(7).fill(150)] }]);
ok(up.length === 1 && up[0].tone === "good" && /up 50%/.test(up[0].title), `views up 50% (got ${up[0]?.title})`);
const down = momentumAlerts([{ platform: "tiktok", views: [...Array(7).fill(200), ...Array(7).fill(100)] }]);
ok(down.length === 1 && down[0].tone === "bad" && /down 50%/.test(down[0].title), "views down 50%");
ok(momentumAlerts([{ platform: "youtube", views: [...Array(7).fill(100), ...Array(7).fill(110)] }]).length === 0, "10% is no news");
ok(momentumAlerts([{ platform: "youtube", views: [...Array(7).fill(10), ...Array(7).fill(30)] }]).length === 0, "too few views to say");
ok(momentumAlerts([{ platform: "youtube", views: [...Array(7).fill(null), ...Array(7).fill(300)] }]).length === 0, "a week without numbers: nothing to compare");

// A video taking off; a run under the usual; a break in posting.
const vids: InsightVideo[] = [
  vid({ daysAgo: 2, score: 4.2, views: 9000, title: "Taking off" }),
  vid({ daysAgo: 30, score: 5, views: 20000, title: "Old hit" }),
  ...[10, 12, 14, 16, 18].map((d) => vid({ platform: "tiktok", daysAgo: d, score: 0.5 })),
];
const b = breakoutAlerts(vids, now);
ok(b.length === 1 && /Taking off/.test(b[0].title) && b[0].video?.platform === "youtube", "a new video at 4.2× is taking off (an old hit isn't news)");
const s = slumpAlerts(vids, now);
ok(s.length === 1 && s[0].platform === "tiktok" && s[0].tone === "bad", "the last 5 TikToks all under the usual");
ok(slumpAlerts([...vids, vid({ platform: "tiktok", daysAgo: 10.5, score: 1.1 })], now).length === 0, "one at the usual breaks the run");
// 1.23.1: young videos are measured against older ones' whole lives: not a slump.
ok(slumpAlerts([4, 5, 6, 7, 8].map((d) => vid({ platform: "instagram", daysAgo: d, score: 0.5 })), now).length === 0, "videos under 10 days old don't make a slump");
const regular = [20, 22, 24, 26, 28, 30, 32].map((d) => vid({ kind: "long", daysAgo: d }));
const g = gapAlerts(regular, now);
ok(g.length === 1 && /20 days/.test(g[0].title) && /every 2 days/.test(g[0].detail), `a 20-day break when the usual is 2 (got ${g[0]?.title} / ${g[0]?.detail})`);
ok(gapAlerts([2, 4, 6, 8, 10, 12].map((d) => vid({ daysAgo: d })), now).length === 0, "posting as usual: no alert");
// 1.23.1: a kind stopped long ago (148 days after one every 2 days) isn't a nudge.
ok(gapAlerts([148, 150, 152, 154, 156, 158, 160].map((d) => vid({ kind: "live", daysAgo: d })), now).length === 0, "a kind left behind long ago: no alert");
ok(/Your last 7 came out about every 2 days/.test(g[0]?.detail ?? ""), `the detail says what it's based on (got ${g[0]?.detail})`);

// CTR, followers.
ok(ctrAlert(4.1, 5.6, 50_000)?.tone === "bad", "CTR down 1.5 points");
ok(ctrAlert(6, 5.5, 50_000) === null, "half a point is no news");
ok(ctrAlert(9, 5, 200) === null, "too few impressions to say");
ok(followerAlerts([{ platform: "instagram", net: [-3, -4, -2, 1, -5, -2, -1] }])[0]?.tone === "bad", "losing followers this week");
ok(followerAlerts([{ platform: "instagram", net: [-1, 2, 0, 1, -1, 0, 1] }]).length === 0, "a few up and down: nothing");
ok(allAlerts([up, down, b, s], 2).length === 2, "at most the limit, biggest first");

// The best time to post: Tuesdays 16–20 clearly better.
const heatVids: InsightVideo[] = [
  ...[8, 9, 10, 11].map((d) => vid({ daysAgo: d * 7, weekday: 1, hour: 17, score: 2.5 })),
  ...Array.from({ length: 10 }, (_, i) => vid({ daysAgo: 10 + i * 3, weekday: 4, hour: 9, score: 0.8 })),
  vid({ daysAgo: 1, weekday: 6, hour: 22, score: 9 }),
];
const h = bestTimes(heatVids, { platform: "youtube", kind: "short", now });
ok(!!h && h.cells.length === 42 && h.considered === 14, `7 × 6 cells from the settled videos only (got ${h?.considered})`);
ok(h?.best.length === 1 && slotName(h.best[0]) === "Tuesdays 16–20" && h.best[0].median === 2.5, `the best slot (got ${h?.best.map((c) => slotName(c))})`);
ok(bestTimes(heatVids.slice(0, 5), { platform: "youtube", kind: "short", now }) === null, "fewer than 12 videos: nothing yet");
// Every platform together (1.27.5).
{
  const yt = Array.from({ length: 8 }, (_, i) => vid({ daysAgo: 8 + i, weekday: 1, hour: 17, score: 2 }));
  const tt = Array.from({ length: 8 }, (_, i) => vid({ platform: "tiktok", daysAgo: 8 + i, weekday: 1, hour: 18, score: 1.6 }));
  const longs = Array.from({ length: 13 }, (_, i) => vid({ kind: "long", daysAgo: 9 + i, weekday: 5, hour: 10, score: 1 }));
  const r = allBestTimes([...yt, ...tt, ...longs], [{ platform: "youtube", kind: "short" }, { platform: "tiktok", kind: "short" }, { platform: "youtube", kind: "long" }], now);
  ok(r.heat.length === 2 && r.heat[0].platform === "all" && r.heat[0].kind === "short", `every platform's shorts first (got ${r.heat.map((h) => h.platform + ":" + h.kind)})`);
  ok(r.heat[0].considered === 16 && r.heat[0].platforms.join() === "youtube,tiktok", "both platforms' shorts in it, though neither has 12 of its own");
  ok(r.heat[0].best.length === 1 && slotName(r.heat[0].best[0]) === "Tuesdays 16–20" && r.heat[0].best[0].median === 1.8, "their best slot together");
  ok(r.heat[1].platform === "youtube" && r.heat[1].kind === "long", "long videos of one platform only: just its own map (no \"every platform\" copy)");
  ok(r.waiting.length === 2 && r.waiting.every((w) => w.have === 8 && w.kind === "short"), "the platforms still short of their own map, with how many they have");
  ok(heatVideos([...yt, vid({ daysAgo: 2 })], { platform: "all", kind: "short", now }).length === 8, "videos under a week old don't count yet");
}

// Tips.
const f = (id: string, tone: Finding["tone"] = "good"): Finding => ({ id, tone, strength: "hint", title: "", detail: "", ratio: 1.5, groups: [], examples: [] });
ok(!!tipFor(f("youtube-short-hour")) && tipFor(f("youtube-short-hour")) !== tipFor(f("youtube-short-length")), "each kind of finding has its tip");
ok(tipFor(f("tiktok-short-momentum", "bad")) !== tipFor(f("tiktok-short-momentum", "good")), "momentum: a different tip up or down");
ok(!!tipFor(f("cross-platform", "info")), "cross-platform tip");
ok(!!tipFor(f("youtube-short-title_question")) && tipFor(f("youtube-short-title_question")) !== tipFor(f("youtube-short-hook_question")), "titles and hooks get their own tips");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("insights math: all good");
