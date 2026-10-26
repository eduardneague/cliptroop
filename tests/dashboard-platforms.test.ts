// 1.34.4: the dashboard's Followers widget draws the new followers of each day (bars), with the platforms as filters
// under it; Upcoming shorts shows each short's platforms and filters by platform. Both save the choice with the
// dashboard.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { followerGains, sumSeries } from "../modules/analytics/lib/followers";
import { CATALOG } from "../modules/dashboard/layout";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// --- New followers per day ------------------------------------------------------------------------------------------
ok(same(followerGains(4, null, { gained: [10, null, 5, 0], lost: [2, null, null, 3] }), [8, null, 5, -3]), "gained − lost where the platform says (YouTube, Facebook)");
ok(same(followerGains(4, [100, 104, 104, 101]), [null, 4, 0, -3]), "else the change in the count");
ok(same(followerGains(5, [100, null, null, 109, 110]), [null, null, null, 9, 1]), "a gap's change lands on the day after it (the days add up to the whole change)");
ok(same(followerGains(3, [null, 50, 55]), [null, null, 5]), "the first count has nothing to compare with");
ok(same(followerGains(3), [null, null, null]) && same(followerGains(2, undefined, null), [null, null]), "no counts: nothing");
ok(same(followerGains(3, [1, 2, 3], { gained: [5, 5, 5], lost: [0, 0, 0] }), [5, 5, 5]), "the platform's own gained and lost win over the counts");
ok(same(sumSeries([[1, null, 3], [2, null, null]], 3), [3, null, 3]), "several platforms: each day's sum, none where none has a number");
ok(same(sumSeries([], 2), [null, null]), "no platforms: nothing");

// --- Followers --------------------------------------------------------------------------------------------------------
const w = read("modules/dashboard/components/analytics-widgets.tsx");
const fol = w.slice(w.indexOf("export function FollowersWidget"), w.indexOf("// Top videos of the last 28 days."));
ok(/const gains = sumSeries\(\s*sel\.map\(\(p\) => followerGains\(a\.days\.length, a\.followersDaily\?\.\[p\], a\.followersFlow\?\.\[p\]\)\),/.test(fol), "the bars: the picked platforms' new followers each day");
ok(/<GainBars days=\{a\.days\} values=\{gains\}/.test(fol) && !/AreaGraph|followersLine/.test(w), "bars, not the running total's flat line (gone)");
ok(/role="radiogroup" aria-label="Platform"/.test(fol) && /onClick=\{\(\) => choose\(p\)\}/.test(fol) && /onSettings\?\.\(\{ platform: v \}\);/.test(fol), "the platforms are filters, the choice saved with the dashboard");
ok(/const shown: P \| "all" = pick !== "all" && list\.includes\(pick\) \? pick : "all";/.test(fol), "a saved platform with no counts any more: every platform");
ok(/const total = count\(sel\);/.test(fol) && /a\.perPlatform\[p\]\?\.followersNet/.test(fol), "the number and its change follow the filter");
ok(/lostColor=\{shown === "youtube" \? "rgb\(var\(--ink\) \/ 0\.35\)" : undefined\}/.test(fol), "a lost day stays visible on YouTube's own red");
const bars = w.slice(w.indexOf("function GainBars"), w.indexOf("function GraphRoom"));
ok(/const zero = \(neg \/ range\) \* 100;/.test(bars) && /title=\{`\$\{shortDay\(days\[i\]\)\}: /.test(bars) && /role="img" aria-label=\{`New followers per day/.test(bars), "a day that lost followers goes below the line; each day says its number; screen readers get the sum");

// --- Upcoming shorts ----------------------------------------------------------------------------------------------------
const t = read("modules/dashboard/components/team-widgets.tsx");
const up = t.slice(t.indexOf("export function UpcomingShortsWidget"), t.indexOf("export function UpcomingLongsWidget"));
ok(/<PlatformFilter compact iconsOnly=\{box\.w < 230\} value=\{platform\} onChange=\{choose\} counts=\{counts\} total=\{items\.length\}/.test(up), "platforms as filters, each with how many of these shorts go there");
ok(/const list = platform === "all" \? items : items\.filter\(\(s\) => s\.platforms\.includes\(platform\)\);/.test(up), "only Instagram's, or only TikTok's…");
ok(/<PlatformMark key=\{p\} platform=\{p\} posted=\{s\.posted\.includes\(p\)\}/.test(up), "each short's platforms, a tick where it's out already");
ok(/onSettings\?\.\(\{ platform: v \}\);/.test(up) && /No upcoming shorts for \$\{PLATFORM_META\[platform as Platform\]\.name\}\./.test(up), "saved; nothing for a platform says so");
const q = read("modules/dashboard/lib/queries.ts");
ok(/\.select\("id, entry_number, title, planned_date, stage, platforms, short_video_posts\(platform\), editor:/.test(q) && /\.limit\(30\),/.test(q), "the query brings the platforms, the posted ones, and enough for one platform's list");
ok(/platforms: \(\(r\.platforms as string\[\] \| null\) \?\? \[\]\)/.test(q) && /posted: \(\(r\.short_video_posts as \{ platform: string \}\[\] \| null\) \?\? \[\]\)\.map\(\(x\) => x\.platform\)/.test(q), "and passes them on");

// --- Saved with the dashboard -----------------------------------------------------------------------------------------
ok(same(CATALOG.followers.settings, { platform: "all" }) && same(CATALOG.upcomingShorts.settings, { platform: "all" }), "both start on every platform");
const studio = read("modules/dashboard/components/studio.tsx");
ok(/"topVideos", "followers", "upcomingShorts"\]/.test(studio) && /if \(w\.type === "topVideos" \|\| w\.type === "followers" \|\| w\.type === "upcomingShorts"\)/.test(studio), "both have the settings gear, with the platform picker");
ok(/<UpcomingShortsWidget items=\{data\.upcomingShorts\} settings=\{w\.settings\} onSettings=\{update\} \/>/.test(studio) && /<FollowersWidget teamId=\{data\.teamId\} settings=\{w\.settings\} onSettings=\{update\} \/>/.test(studio), "the board passes their settings and saves the changes");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("dashboard platforms ok");
