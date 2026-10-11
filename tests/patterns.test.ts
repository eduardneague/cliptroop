// "What works" (1.16.0): patterns found in a team's own videos, only with
// enough videos and a clear difference, worded with the numbers behind them.
import { crossPlatform, findPatterns, hookOpening, median, textFeatures, topVsRest, type PatternVideo } from "../modules/analytics/lib/patterns";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const NOW = Date.parse("2026-10-01T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
let k = 0;
const vid = (o: Partial<PatternVideo>): PatternVideo => ({
  platform: "youtube",
  id: `v${++k}`,
  kind: "short",
  title: "A plain title",
  publishedAt: ago(30),
  durationSec: 45,
  views: 10_000,
  likes: 400,
  comments: 20,
  shares: 10,
  ...o,
});

ok(median([3, 1, 2]) === 2 && median([4, 1, 3, 2]) === 2.5 && median([]) === null, "median");
ok(textFeatures.question("Can you tell?") && !textFeatures.question("No."), "question");
ok(textFeatures.number("I tested 7 phones") && !textFeatures.number("seven"), "number");
ok(textFeatures.caps("This is INSANE") && !textFeatures.caps("This is Insane OK"), "a word in capitals (3+ letters)");
ok(textFeatures.emoji("Wow 😱") && !textFeatures.emoji("Wow"), "emoji");
ok(textFeatures.words("Ce mănânci azi? Hai să vedem!") === 6, "words in any language");
ok(hookOpening("Is this the cheapest food in Bucharest? Let's find out.\nBody") === "Is this the cheapest food in Bucharest?", "the hook's first sentence");

// Too few videos: nothing said.
const few = [vid({}), vid({}), vid({})];
const p0 = findPatterns(few, { platform: "youtube", kind: "short", now: NOW });
ok(p0.findings.length === 0 && p0.considered === 3, "fewer than 6 videos: no findings");

// Too new to count.
const young = Array.from({ length: 8 }, () => vid({ publishedAt: ago(2) }));
const p1 = findPatterns(young, { platform: "youtube", kind: "short", now: NOW });
ok(p1.considered === 0 && p1.tooNew === 8, "videos under a week old wait");

// Short shorts win clearly: a strong length finding.
const lengths = [
  ...Array.from({ length: 7 }, (_, i) => vid({ durationSec: 15, views: 40_000 + i * 1000, publishedAt: ago(20 + i) })),
  ...Array.from({ length: 7 }, (_, i) => vid({ durationSec: 50, views: 10_000 + i * 500, publishedAt: ago(40 + i) })),
];
const p2 = findPatterns(lengths, { platform: "youtube", kind: "short", now: NOW });
const len = p2.findings.find((f) => f.id.endsWith("-length"));
ok(!!len, "a length finding");
ok(!!len && /^Shorts under 20 seconds get \d/.test(len.title), `worded with the group (got "${len?.title}")`);
ok(!!len && len.strength === "strong" && (len.ratio ?? 0) > 3, "big groups and a clear gap: strong");
ok(!!len && len.examples.length === 3 && (len.examples[0].views ?? 0) >= 46_000, "examples: the best of the group first");
ok(!!len && /Median 43K views \(7 shorts\) vs 12K for the rest \(7\)\./.test(len.detail), `detail with medians and counts (got "${len?.detail}")`);
// Momentum: the recent ones (the short ones) are better.
const mom = p2.findings.find((f) => f.id.endsWith("-momentum"));
ok(!!mom && mom.tone === "good", "the latest videos doing better is noticed");

// A binary split names the other group.
const titles = [
  ...Array.from({ length: 4 }, () => vid({ title: "Can you tell which is fake?", views: 30_000 })),
  ...Array.from({ length: 4 }, () => vid({ title: "Testing a fake phone", views: 12_000 })),
];
const p3 = findPatterns(titles, { platform: "youtube", kind: "short", now: NOW });
const q = p3.findings.find((f) => f.id.endsWith("-title_question"));
ok(!!q && q.title === "Titles that ask a question get 2.5× the views", `question titles (got "${q?.title}")`);
ok(!!q && q.detail.includes("vs 12K for titles without a question (4)"), `the other group named (got "${q?.detail}")`);
ok(!!q && q.strength === "hint", "groups of 4: only a hint");

// No clear difference: nothing invented.
const flat = Array.from({ length: 10 }, (_, i) => vid({ views: 10_000 + (i % 2) * 300, durationSec: i % 2 ? 15 : 50, publishedAt: ago(10 + i) }));
ok(findPatterns(flat, { platform: "youtube", kind: "short", now: NOW }).findings.length === 0, "no clear difference: no finding");

// Other platforms and kinds stay out.
const mixed = [...lengths, ...Array.from({ length: 6 }, () => vid({ platform: "tiktok", views: 1 })), ...Array.from({ length: 6 }, () => vid({ kind: "long", views: 1 }))];
ok(findPatterns(mixed, { platform: "youtube", kind: "short", now: NOW }).considered === 14, "only this platform's shorts are compared");

// Skip rate (Instagram) split at the team's own middle.
const reels = [
  ...Array.from({ length: 4 }, () => vid({ platform: "instagram", skipRate: 20, views: 50_000 })),
  ...Array.from({ length: 4 }, () => vid({ platform: "instagram", skipRate: 45, views: 9_000 })),
];
const p4 = findPatterns(reels, { platform: "instagram", kind: "short", now: NOW });
const skip = p4.findings.find((f) => f.id.endsWith("-skip"));
ok(!!skip && skip.title.startsWith("Reels skipped by under 33% of viewers get"), `skip rate (got "${skip?.title}")`);

// Hooks from our scripts.
const hooks = [
  ...Array.from({ length: 4 }, () => vid({ hook: "Would you eat this? Let's see.", views: 25_000 })),
  ...Array.from({ length: 4 }, () => vid({ hook: "Today we try street food. It's good.", views: 8_000 })),
  ...Array.from({ length: 3 }, () => vid({ hook: null, views: 8_000 })),
];
const hq = findPatterns(hooks, { platform: "youtube", kind: "short", now: NOW }).findings.find((f) => f.id.endsWith("-hook_question"));
ok(!!hq && hq.groups.reduce((t, g) => t + g.n, 0) === 8, "videos without a hook aren't counted for hooks");

// Top fifth vs the rest.
const t = topVsRest(lengths);
ok(!!t && t.some((r) => r.label === "Length" && r.top === "15 s" && r.rest === "50 s"), "top vs rest shows what tells them apart");
ok(topVsRest(few) === null, "too few for top vs rest");

// The same shorts across platforms.
const cross = ["a", "b", "c", "d"].flatMap((id) => [
  vid({ ourId: id, platform: "youtube", views: 40_000 }),
  vid({ ourId: id, platform: "tiktok", views: 10_000 }),
  vid({ ourId: id, platform: "instagram", views: 20_000 }),
]);
const cp = crossPlatform(cross, NOW);
ok(!!cp && cp.title === "The same shorts get 4.0× more views on YouTube than on TikTok", `cross-platform (got "${cp?.title}")`);
ok(!!cp && cp.detail.startsWith("Median views of the shorts posted on more than one platform: YouTube 40K (4) · Instagram 20K (4) · TikTok 10K (4)"), `cross-platform detail (got "${cp?.detail}")`);
ok(crossPlatform(cross.slice(0, 6), NOW) === null, "fewer than 3 shorts on two platforms: nothing");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("patterns: all good");
