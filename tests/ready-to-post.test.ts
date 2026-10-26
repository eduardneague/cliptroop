// 1.34.3: a short's Ready to post card. At a glance, where each platform is (a tile each, a teal tick where it's posted);
// when posts go out (in 30 minutes, the team's times on the planned day, or chosen); one caption for Instagram, TikTok
// and Facebook unless one gets its own; what will happen and the buttons always in sight; quiet posts folded to a line.
// And every platform logo in full colour, a teal tick where it's posted (the shorts list, the calendar).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, firstWhen, fmtDay, fmtWhen, quarter, slotOf, soonSlot, teamSlot, todayStr } from "../app/(dashboard)/shorts/[id]/post-times";

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

// --- When: the times (this device's clock) --------------------------------------------------------------------------
const at = (h: number, m: number, d = 26) => new Date(2026, 9, d, h, m).getTime();
const now = at(11, 40);
ok(todayStr(now) === "2026-10-26" && addDays("2026-10-31", 1) === "2026-11-01" && addDays("2026-12-31", 1) === "2027-01-01", "days");
ok(quarter("17:07") === "17:00" && quarter("09:59") === "09:45" && quarter("18:00") === "18:00", "a team's time on the picker's quarter hours");
ok(same(soonSlot(at(11, 40)), { date: "2026-10-26", time: "12:15" }) && same(soonSlot(at(11, 45)), { date: "2026-10-26", time: "12:15" }), "in 30 minutes, on the next quarter hour");
ok(same(soonSlot(at(23, 50)), { date: "2026-10-27", time: "00:30" }), "late in the evening: tomorrow");
ok(same(teamSlot("2026-10-27", "17:00", now), { date: "2026-10-27", time: "17:00" }), "team's times: on the planned day");
ok(same(teamSlot("2026-10-20", "17:00", now), { date: "2026-10-26", time: "17:00" }) && same(teamSlot(null, "17:00", now), { date: "2026-10-26", time: "17:00" }), "a planned day gone, or none: today");
ok(same(teamSlot(null, "12:00", now), { date: "2026-10-26", time: "12:00" }), "15 minutes or more away: today");
ok(same(teamSlot(null, "11:50", now), { date: "2026-10-27", time: "11:45" }), "gone or under 15 minutes away: the next day");
ok(same(teamSlot("2026-10-26", "", now), { date: "2026-10-26", time: "17:00" }), "no time set: 17:00");
ok(firstWhen("2026-10-27", now) === "team" && firstWhen("2026-10-26", now) === "soon" && firstWhen(null, now) === "soon" && firstWhen("2026-10-01", now) === "soon", "starts on the team's times only for a short planned for a later day");
ok(fmtWhen({ date: "2026-10-26", time: "12:15" }, now) === "Today 12:15" && fmtWhen({ date: "2026-10-27", time: "17:00" }, now) === "Tomorrow 17:00", "Today / Tomorrow");
ok(fmtDay("2026-10-28", now) === "Wed, Oct 28" && fmtWhen({ date: "2026-10-28", time: "18:00" }, now) === "Wed, Oct 28 18:00", "a later day by name");
ok(same(slotOf(new Date(2026, 9, 27, 16, 9).toISOString()), { date: "2026-10-27", time: "16:09" }), "a post's time as a day and time here");

// --- The card ----------------------------------------------------------------------------------------------------------
const panel = read("app/(dashboard)/shorts/[id]/schedule-panel.tsx");
ok(/const \[whenMode, setWhenMode\] = useState<"soon" \| "team" \| "custom">\(\(\) => firstWhen\(plannedDate\)\);/.test(panel), "When starts from the short's planned day");
ok(/const whenOf = \(p: Platform\) => \(whenMode === "soon" \? soon : whenMode === "team" \? teamSlot\(plannedDate, defaultTimes\[p\]\) : when\[p\]\);/.test(panel), "the team's own posting times are used (they were passed in and ignored)");
ok(!/when\[p\]\.(date|time)/.test(panel), "every check, the review and what's sent go through whenOf");
ok(/const w = whenOf\(p\);\s*const at = nowMode \? new Date\(\)\.toISOString\(\) : localIso\(w\.date, w\.time\);/.test(panel), "what's scheduled is what the card shows");
ok(/\{ value: "soon", label: "In 30 min" \},\s*\{ value: "team", label: "Team's times" \},\s*\{ value: "custom", label: "Choose" \}/.test(panel), "the three choices");
ok(/if \(mode === "custom" && whenMode !== "custom"\) setWhen\(/.test(panel), "choosing starts from the times shown");
ok(/options: \{ caption: captionOf\("instagram"\) \}/.test(panel) && /options: \{ \.\.\.tt, caption: captionOf\("tiktok"\) \}/.test(panel) && /options: \{ caption: captionOf\("facebook"\) \}/.test(panel), "one caption for Instagram, TikTok and Facebook, unless one has its own");
ok(/if \(p === "instagram"\) setIg\(\{ caption: shared \}\);/.test(panel), "its own caption starts from the shared one");
ok(/caption=\{captionFor\("tiktok"\)\}/.test(panel) && !/<span className=\{label\}>Caption<\/span>\s*<textarea value=\{v\.caption\}/.test(panel), "TikTok's caption is the card's (still there to edit, as TikTok asks)");
ok(/Posting to <b className="text-ink">\{creator\.nickname\}<\/b>/.test(panel) && /Who can see this video/.test(panel) && /placeholder="Choose…"/.test(panel) && /Disclose commercial content/.test(panel) && /Music Usage Confirmation/.test(panel), "TikTok's review asks for these, all still on the card");
ok(/const showTiles = active\.length > 0 \|\| platforms\.some\(\(p\) => !!byHand\(p\)\);/.test(panel), "tiles once anything is scheduled or posted");
ok(/<PlatformMark platform=\{p\} posted=\{t\.tone === "done"\}/.test(panel) && /onClick=\{\(\) => jump\(p\)\}/.test(panel) && /if \(el\) flashElement\(el\);/.test(panel), "a tile: its logo (ticked when posted), and a press goes to that platform");
ok(/\{postedCount === platforms\.length \? "Posted everywhere" : `\$\{postedCount\} of \$\{platforms\.length\} posted`\}/.test(panel), "how many are posted");
ok(/className="sticky z-\[6\] bottom-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\] md:bottom-4/.test(panel) && /bg-surface glass-pane/.test(panel), "what happens and the buttons stay in sight, above the phone's tab bar");
ok(!/variant="big"/.test(panel) && /variant="row" onDone=\{refresh\}/.test(panel), "Post everywhere now: a button in a line, not a banner over the card");
ok(/const calm = post\.status === "published" \|\| \(\(post\.status === "scheduled" \|\| post\.status === "waiting"\) && !late && post\.attempts === 0\);/.test(panel) && /useState\(!calm\)/.test(panel), "published or quietly waiting: one line, the steps on request");
ok(/if \(!calm\) setStepsOpen\(true\);/.test(panel), "once it starts, late or fails, its steps open by themselves");
ok(/Stop editing/.test(panel), "editing a post can be left without scheduling");
ok(/hourCycle: "h23"/.test(panel), "times read the same way all over the card (24-hour, like the picker)");
ok(!/function tomorrow\(\)/.test(panel), "dead code gone");
const hint = read("app/(dashboard)/shorts/[id]/workflow-actions.tsx");
ok(/Approved\. Schedule it below, or post it right away\./.test(hint), "the hint above says what the card does");
const button = read("modules/short-videos/components/post-now-button.tsx");
ok(/variant\?: "small" \| "row";/.test(button) && /platform === "all" \? "Post everywhere now" : "Post now"/.test(button), "Post now: no unused big variant; for all, its name says so");

// --- Logos: full colour, a tick where it's posted --------------------------------------------------------------------
const mark = read("modules/short-videos/components/platform-mark.tsx");
ok(/\{posted && \(/.test(mark) && /background: "rgb\(var\(--teal\)\)"/.test(mark) && /<CheckIcon/.test(mark) && !/grayscale|opacity-/.test(mark), "PlatformMark: the logo as it is, the teal tick only when posted");
const toggles = read("modules/short-videos/components/posted-toggles.tsx");
ok(/<PlatformMark platform=\{p\} posted=\{on\}/.test(toggles) && !/grayscale/.test(toggles), "the shorts list's Posted column: not greyed out any more");
const calendar = read("app/(dashboard)/calendar/calendar-view.tsx");
ok(/<PlatformMark platform=\{p as "youtube"\} posted=\{posted\} className="w-7 h-7 rounded-md" tick="md" \/>/.test(calendar) && !/ring-2 ring-green ring-offset-1/.test(calendar), "the calendar's quick view: the same tick (it had a green ring)");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("ready to post ok");
