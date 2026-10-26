// 1.34.5: the dashboard's Views and Followers graphs. Point at a day (the mouse, or a finger) for a popup with its
// views or new followers; Views has Followers' platform filters, saved with the dashboard.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pointAt, pointX, slotAt, slotMid, viewsWeek } from "../modules/analytics/lib/day-graph";
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
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// --- Which day is pointed at ----------------------------------------------------------------------------------------
// 28 bars across 306 px, 2 px apart: a slot every 11 px, each 9 px wide.
ok(slotAt(0, 306, 28) === 0 && slotAt(8.9, 306, 28) === 0 && slotAt(10, 306, 28) === 1 && slotAt(305, 306, 28) === 27, "bars: the slot under the pointer, a gap split between its two bars");
ok(slotAt(-6, 306, 28) === 0 && slotAt(400, 306, 28) === 27, "bars: past either end, the first or the last day");
ok(near(slotMid(0, 306, 28), 4.5) && near(slotMid(27, 306, 28), 301.5), "bars: a slot's middle (where its popup points)");
ok(Array.from({ length: 28 }, (_, i) => slotAt(slotMid(i, 306, 28), 306, 28)).every((d, i) => d === i), "bars: each middle is its own day");
ok(pointX(0, 300, 28, 5) === 5 && pointX(27, 300, 28, 5) === 295, "a line: its points from edge to edge, inside the padding");
ok(Array.from({ length: 28 }, (_, i) => pointAt(pointX(i, 300, 28, 5), 300, 28, 5)).every((d, i) => d === i), "a line: each point is its own day");
ok(pointAt(-20, 300, 28, 5) === 0 && pointAt(999, 300, 28, 5) === 27, "a line: past either end, the first or the last day");
ok(pointX(0, 300, 1, 5) === 150 && pointAt(42, 300, 1, 5) === 0, "a single day: in the middle");

// --- Views' week ------------------------------------------------------------------------------------------------------
const yt = [...Array.from({ length: 26 }, () => 100), null, null];
const ig = Array.from({ length: 28 }, () => 1);
const all = viewsWeek([yt, ig], 28);
ok(all.cut === 25 && all.line[25] === 101 && all.line[26] === null && all.line[27] === null, "together: up to the last day both have (YouTube's last two days come late), where the line ends");
ok(all.last7 === 707 && all.prev7 === 707, "the last 7 of those days, and the 7 before");
const one = viewsWeek([ig], 28);
ok(one.cut === 27 && one.last7 === 7 && one.prev7 === 7, "one platform: its own days, to the last one it has");
const old = [...Array.from({ length: 11 }, () => 5), ...Array.from({ length: 17 }, () => null)];
ok(viewsWeek([ig, old], 28).cut === 27, "a platform silent for days doesn't hold the line back");
const gappy = viewsWeek([[null, 3, null, 4]], 4);
ok(same(gappy.line, [null, 3, null, 4]) && gappy.last7 === 7 && gappy.prev7 === null, "a day none has stays empty; no week before: nothing to compare");
const none = viewsWeek([[null, null, null]], 3);
ok(none.cut === -1 && same(none.line, [null, null, null]) && none.last7 === 0 && none.prev7 === null, "no numbers yet");

// --- The pointer and the popup ---------------------------------------------------------------------------------------
const w = read("modules/dashboard/components/analytics-widgets.tsx");
const hook = w.slice(w.indexOf("function useDayPointer"), w.indexOf("function DayTip"));
ok(/onPointerMove: \(e: React\.PointerEvent<HTMLDivElement>\) => \{\s*if \(e\.pointerType === "mouse" \|\| e\.buttons\) setDay\(at\(e\)\);/.test(hook), "the day under the mouse, or under a finger dragged along");
ok(/finger\.current = e\.pointerType !== "mouse";\s*if \(finger\.current\) setDay\(at\(e\)\);/.test(hook), "a finger shows the day it touches");
ok(/onClick: \(e: React\.MouseEvent\) => \{\s*if \(finger\.current\) e\.preventDefault\(\);/.test(hook), "a tap reads the graph instead of opening Analytics");
ok(/if \(e\.pointerType === "mouse"\) setDay\(null\);/.test(hook), "the mouse leaving: gone (a finger's day stays)");
ok(/document\.addEventListener\("pointerdown", away, true\);/.test(hook) && /if \(!ref\.current\?\.contains\(e\.target as Node\)\) setDay\(null\);/.test(hook), "a touch anywhere else: gone");
ok(/window\.addEventListener\("scroll", gone, \{ capture: true, passive: true \}\);/.test(hook) && /window\.removeEventListener\("scroll", gone, \{ capture: true \}\);/.test(hook), "a scroll: gone (the popup would stay behind)");
ok(/style: \{ touchAction: "pan-y" \}/.test(hook), "the page still scrolls up and down over a graph");
const tip = w.slice(w.indexOf("function DayTip"), w.indexOf("function TipDay"));
ok(/createPortal\(/.test(tip) && /document\.body/.test(tip) && /role="tooltip"/.test(tip) && /pointer-events-none fixed z-\[90\]/.test(tip), "the popup: in a portal, so the widget's rounded corners can't cut it off");
ok(/at \+ 14 \+ w <= Math\.min\(box\.right \+ 24, window\.innerWidth - 8\) \? at \+ 14 : at - 14 - w/.test(tip) && /Math\.max\(8, Math\.min\(left, window\.innerWidth - w - 8\)\)/.test(tip), "beside the day, flipped near the edge, kept in the window");

// --- Followers --------------------------------------------------------------------------------------------------------
const bars = w.slice(w.indexOf("function GainBars"), w.indexOf("export function FollowersWidget"));
ok(/useDayPointer\(n, \(x, w\) => slotAt\(x, w, n\)\)/.test(bars) && /<DayTip host=\{bind\.ref\} x=\{\(w\) => slotMid\(day, w, n\)\}>/.test(bars), "Followers: each bar points at its day");
ok(/day === i \? "bg-ink\/\[0\.07\]" : ""/.test(bars) && !/title=\{`\$\{shortDay/.test(bars), "the bar pointed at is lit (the slow browser tooltips are gone)");
const fol = w.slice(w.indexOf("export function FollowersWidget"), w.indexOf("// Top videos of the last 28 days."));
ok(/v > 0 \? `new \$\{people\}` : `\$\{people\} lost`/.test(fol) && /No count that day/.test(fol) && /No new \{people\}/.test(fol), "a day: its new followers (or lost), or that it has no count");
ok(/\{per\.length > 1 && <TipRows rows=\{per\.map\(/.test(fol), "every platform together: each one's number that day too");

// --- Views ------------------------------------------------------------------------------------------------------------
const views = w.slice(w.indexOf("export function ViewsWidget"), w.indexOf("// Followers: how many now"));
ok(/const \[pick, choose\] = usePlatformPick\(settings, onSettings\);/.test(views) && /const shown: P \| "all" = pick !== "all" && active\.includes\(pick\) \? pick : "all";/.test(views), "Views: a platform picked (or every one)");
ok(/const week = \(p: P \| "all"\) => viewsWeek\(p === "all" \? PLATFORMS\.map\(\(q\) => a\.views\[q\]\) : \[a\.views\[p\]\], a\.days\.length\);/.test(views), "its numbers and line: that platform's days, or all of them together");
ok(/<PlatformChips\s+list=\{active\}\s+shown=\{shown\}\s+onPick=\{choose\}\s+num=\{\(p\) => week\(p\)\.last7\}/.test(views), "the filters, each with the number you see when you pick it");
ok(/const color = shown === "all" \? "rgb\(var\(--amber\)\)" : COLOR\[shown\];/.test(views), "the line in the platform's colour");
ok(/<ViewsLine\s+values=\{wk\.line\}/.test(views) && /\{line && box\.h >= 150 && <DayAxis days=\{a\.days\} what="views per day"/.test(views), "each day of the 28, with the first and last day under it");
ok(/sel\.length > 1 \? "Not all in yet" : "Not in yet"/.test(views) && /i > lastIndex\(a\.views\[p\]\) \? "not in yet" : "–"/.test(views), "a day YouTube hasn't reported yet says so");
ok(/<\/Link>\s*\{active\.length > 1 && \(\s*<PlatformChips/.test(views), "the filters sit outside the link to Analytics");
// 1.35.1: the chips are FilterChips (filter-chips.tsx), shared with Upcoming shorts and longs.
const chips = w.slice(w.indexOf("function PlatformChips"), w.indexOf("function usePlatformPick"));
const fc = read("modules/dashboard/components/filter-chips.tsx");
ok(/<FilterChips label="Platform" options=\{options\} value=\{shown\} onPick=\{onPick\} counts=\{wide\}/.test(chips), "the filters are the shared chips");
ok(/role="radiogroup" aria-label=\{label\}/.test(fc) && /role="radio"/.test(fc) && /tabIndex=\{i === at \? 0 : -1\}/.test(fc) && /e\.key === "ArrowRight" \|\| e\.key === "ArrowDown" \? 1/.test(fc), "the filters: a radio group, arrow keys move between them");
const pickHook = w.slice(w.indexOf("function usePlatformPick"), w.indexOf("// Views: the last 7 days"));
ok(/onSettings\?\.\(\{ platform: v \}\);/.test(pickHook), "the pick is saved with the dashboard");

// --- Saved with the dashboard -----------------------------------------------------------------------------------------
ok(same(CATALOG.views.settings, { platform: "all" }), "Views starts on every platform");
const studio = read("modules/dashboard/components/studio.tsx");
ok(/const HAS_SETTINGS: WidgetType\[\] = \[[^\]]*"views"/.test(studio) && /w\.type === "views"/.test(studio), "Views has the settings gear, with the platform picker");
ok(/<ViewsWidget teamId=\{data\.teamId\} settings=\{w\.settings\} onSettings=\{update\} \/>/.test(studio), "the board passes its settings and saves the changes");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("dashboard graphs ok");
