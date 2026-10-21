// Profiles (1.28.0): levels (the same numbers as 0093's vp_level_for / vp_level_floor), achievements, frames, the showcases' layout.
import { achievementsFor, FRAMES, frameLevel, levelFloor, levelFor, levelProgress, levelTint, readStats, xpToNext, ACHIEVEMENTS } from "../lib/profile/progress";
import { addShowcase, DEFAULT_PROFILE_LAYOUT, readProfileLayout, SHOWCASES, ABOUT_MAX } from "../modules/profile/layout";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// Levels: checked against the same values as supabase/tests/profiles.test.sql.
const pairs: [number, number][] = [[0, 0], [99, 0], [100, 1], [999, 9], [1000, 10], [2999, 19], [3000, 20], [4500, 25], [5460, 28], [15000, 50]];
for (const [xp, lv] of pairs) ok(levelFor(xp) === lv, `levelFor(${xp}) = ${lv} (got ${levelFor(xp)})`);
ok(levelFloor(10) === 1000 && levelFloor(28) === 5400 && levelFloor(50) === 15000, "levelFloor");
for (let l = 0; l < 120; l++) ok(levelFor(levelFloor(l)) === l && levelFor(levelFloor(l) - 1) === Math.max(0, l - 1), `floor of level ${l} is where it starts`);
ok(xpToNext(0) === 100 && xpToNext(9) === 100 && xpToNext(10) === 200 && xpToNext(25) === 300, "XP per level grows every 10");
const p = levelProgress(5460);
ok(p.level === 28 && p.into === 60 && p.need === 300 && p.left === 240 && Math.abs(p.share - 0.2) < 1e-9, "progress into level 28");
ok(levelFor(-5) === 0 && levelFor(Number.NaN) === 0, "no XP → level 0");
ok(levelTint(0) !== levelTint(10) && levelTint(10) === levelTint(19), "a new colour every 10 levels");

// Frames unlock in order, from "none" at 0.
ok(FRAMES[0].id === "none" && FRAMES[0].level === 0, "no frame always");
ok(FRAMES.every((f, i) => i === 0 || f.level > FRAMES[i - 1].level), "frames unlock in order");
ok(frameLevel("glow") === 5 && frameLevel("crown") === 50, "frame levels (vp_frame_level)");

// Stats and achievements.
ok(readStats(null) === null && readStats("x") === null, "private or not there → null");
const s = readStats({
  xp: 1200, tasks: 12, on_time: 10, dated: 11, videos: 7, teams: 2, first_at: "2026-01-02T10:00:00Z", last_at: "2026-10-01T10:00:00Z",
  by: { script: 10, edit: 1, review: 1, junk: "x" },
  ranks: { all: { 1: "2026-01-02T10:00:00Z", 5: "2026-02-01T10:00:00Z", 10: "2026-05-01T10:00:00Z" }, script: { 1: "2026-01-02T10:00:00Z", 10: "2026-09-01T10:00:00Z" }, edit: { 1: "2026-03-01T10:00:00Z" }, review: { 1: "2026-04-01T10:00:00Z" }, ontime: { 10: "2026-08-01T10:00:00Z" } },
  team_dates: { 2: "2026-06-01T10:00:00Z" }, levels: { 5: "2026-03-01T10:00:00Z", 10: "2026-09-15T10:00:00Z" },
  streak: { best: 8, current: 2, dates: { 3: "2026-02-03T10:00:00Z", 7: "2026-07-07T10:00:00Z" } },
  days: { "2026-10-01": 2, bad: "x" },
})!;
ok(s.onTime === 10 && s.by.script === 10 && !("junk" in s.by) && !("bad" in s.days), "stats read and cleaned");
const a = achievementsFor(s);
const get = (id: string) => a.find((x) => x.id === id)!;
ok(a.length === ACHIEVEMENTS.length, "every achievement listed");
ok(get("first-step").unlocked && get("first-step").at === "2026-01-02T10:00:00Z", "first step: reached on the first one's date");
ok(get("on-a-roll").unlocked && get("on-a-roll").at === "2026-05-01T10:00:00Z", "10 steps: the 10th's date");
ok(!get("workhorse").unlocked && get("workhorse").have === 12 && get("workhorse").goal === 50, "50 steps: 12 of 50");
ok(get("wordsmith").unlocked && get("wordsmith").at === "2026-09-01T10:00:00Z", "10 scripts");
ok(get("right-on-time").unlocked, "10 on time");
ok(get("on-fire").unlocked && get("on-fire").at === "2026-07-07T10:00:00Z" && !get("unstoppable").unlocked, "streaks");
ok(get("level-10").unlocked && get("level-10").at === "2026-09-15T10:00:00Z", "level 10 (1200 XP)");
ok(get("crossover").unlocked && get("crossover").at === "2026-06-01T10:00:00Z", "2 teams");
ok(!get("all-rounder").unlocked && get("all-rounder").have === 3, "3 kinds of steps so far (script, edit, review)");
ok(a.findIndex((x) => !x.unlocked) > a.findLastIndex((x) => x.unlocked), "reached ones first");
ok(a[0].at === "2026-09-15T10:00:00Z", "newest reached first");

// The showcases' layout.
ok(readProfileLayout(null) === DEFAULT_PROFILE_LAYOUT && readProfileLayout({ v: 2, items: [] }) === DEFAULT_PROFILE_LAYOUT, "nothing saved → the default");
const dirty = readProfileLayout({
  v: 1,
  items: [
    { id: "a", type: "stats", x: 40, y: 0, w: 99, h: 1 },
    { id: "a", type: "about", x: 0, y: 0, w: 6, h: 3, settings: { text: "x".repeat(5000), evil: 1 } },
    { id: "z", type: "stats", x: 0, y: 9, w: 6, h: 3 },
    { id: "b", type: "nope", x: 0, y: 0, w: 2, h: 2 },
    { id: "<script>", type: "featured", x: 0, y: 0, w: 4, h: 3, settings: { id: "bad id!" } },
  ],
});
ok(dirty.items.length === 3, "unknown and repeated showcases dropped");
const stats = dirty.items.find((x) => x.type === "stats")!;
ok(stats.w === SHOWCASES.stats.limits.maxW && stats.h === SHOWCASES.stats.limits.minH && stats.x === 0, "sizes kept to limits, inside the grid");
const about = dirty.items.find((x) => x.type === "about")!;
ok(about.id !== "a" && (about.settings?.text as string).length === ABOUT_MAX && !("evil" in (about.settings ?? {})), "ids unique, About me cut to its length, unknown settings dropped");
const feat = dirty.items.find((x) => x.type === "featured")!;
ok(feat.id === "s-featured" && feat.settings === undefined, "bad ids and settings replaced");
const overlaps = dirty.items.some((x, i) => dirty.items.some((y, j) => i !== j && x.x < y.x + y.w && x.x + x.w > y.x && x.y < y.y + y.h && x.y + x.h > y.y));
ok(!overlaps, "nothing overlaps");
const added = addShowcase(DEFAULT_PROFILE_LAYOUT, "about");
ok(added.layout.items.length === DEFAULT_PROFILE_LAYOUT.items.length + 1 && added.layout.items.some((x) => x.id === added.id && x.type === "about"), "adding a showcase");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("profile: ok");
