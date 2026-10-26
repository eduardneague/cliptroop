// 1.35.1: Upcoming shorts and Upcoming longs filter like Followers and Views (the same chips, a tick on each click),
// by platform (or only that platform) and by editor; Upcoming longs shows each video's thumbnail (its winner or its
// first sketch) and editors; Top videos lists the 20 best in a scrolling list, with "View all" at its top right.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { editedBy, editorChoice, editorPick, editorsOf, goesTo, nothingFor, type Person } from "../modules/dashboard/lib/upcoming-filters";
import { CATALOG, topVideosHref } from "../modules/dashboard/layout";

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

// --- The platform filter ------------------------------------------------------------------------------------------------
ok(goesTo(["youtube", "instagram"], "all") && goesTo([], "all", true), "every platform: every short");
ok(goesTo(["youtube", "instagram"], "instagram") && !goesTo(["youtube"], "instagram"), "a platform: the shorts that go there, with others or not");
ok(goesTo(["instagram"], "instagram", true) && !goesTo(["youtube", "instagram"], "instagram", true), "only: the shorts that go there and nowhere else");
ok(goesTo(["instagram", "instagram"], "instagram", true) && goesTo(["instagram", "threads"], "instagram", true), "a platform twice, or one we don't post to, doesn't make it two");
ok(!goesTo([], "tiktok") && !goesTo([], "tiktok", true), "no platforms yet: not on any");

// --- The editor filter --------------------------------------------------------------------------------------------------
const mara: Person = { id: "m1", name: "Mara Pop", avatarUrl: null, color: "#028475" };
const dan: Person = { id: "m2", name: "Dan", avatarUrl: null, color: "#6B4FD6" };
const ana: Person = { id: "m3", name: "Ana", avatarUrl: null, color: "#946F00" };
ok(editedBy([mara], "all") && editedBy([], "all"), "every editor: everything");
ok(editedBy([mara, dan], "m2") && !editedBy([mara], "m2"), "one editor: what they edit (a long video can have two)");
ok(editedBy([], "none") && !editedBy([mara], "none"), "no editor yet: what nobody edits");
const e = editorsOf([[mara], [dan], [mara], [], [ana, mara], [], [dan, dan]]);
ok(same(e.people.map((p) => p.id), ["m1", "m2", "m3"]) && e.none === 2, "the editors, busiest first (one person twice on a video counts once), and how many have nobody");
ok(same(editorsOf([[ana], [dan]]).people.map((p) => p.name), ["Ana", "Dan"]), "as busy: by name");
ok(editorPick("m2", e.people, e.none) === "m2" && editorPick("gone", e.people, e.none) === "all" && editorPick(7, e.people, e.none) === "all", "a saved editor who edits none of these any more: every editor");
ok(editorPick("none", e.people, 2) === "none" && editorPick("none", e.people, 0) === "all", "no editor yet: while some have nobody");
ok(!editorChoice([mara], 0, "all") && editorChoice([mara], 1, "all") && editorChoice([mara, dan], 0, "all") && editorChoice([mara], 0, "m1"), "the editor chips show when there's a choice (or one is picked)");
ok(nothingFor("shorts", { name: "Instagram", only: false }, mara) === "No upcoming shorts for Instagram edited by Mara Pop.", "nothing: for a platform, by an editor");
ok(nothingFor("shorts", { name: "TikTok", only: true }, "none") === "No upcoming shorts without an editor that go only to TikTok.", "nothing: only there, nobody editing");
ok(nothingFor("long videos", null, dan) === "No upcoming long videos edited by Dan." && nothingFor("shorts", null, null) === "No upcoming shorts.", "nothing: long videos, or no filter");

// --- The chips (Followers', shared) -------------------------------------------------------------------------------------
const fc = read("modules/dashboard/components/filter-chips.tsx");
ok(/role="radiogroup" aria-label=\{label\}/.test(fc) && /role="radio"\s+aria-checked=\{on\}/.test(fc), "a radio group: a click ticks (SoundSync plays a tick for role=radio)");
ok(/const at = Math\.max\(0, options\.findIndex\(\(o\) => o\.id === value\)\);/.test(fc) && /tabIndex=\{i === at \? 0 : -1\}/.test(fc), "Tab lands on the picked chip, or the first when what's saved isn't there");
ok(/on \? "bg-ink text-paper" : "text-ink-soft hover:bg-surface-2 hover:text-ink"/.test(fc) && /h-7 text-\[11\.5px\] font-semibold/.test(fc), "Followers' look: the picked one ink on paper");
ok(/\{counts && o\.count !== undefined && <span className="tabular-nums">\{o\.count\}<\/span>\}/.test(fc), "numbers when the widget is wide enough");
const sync = read("components/ui/sound-sync.tsx");
ok(/'\[role="switch"\], \[role="checkbox"\], input\[type="checkbox"\], \[role="radio"\]'/.test(sync), "SoundSync still ticks radios and checkboxes");

// --- Upcoming shorts ----------------------------------------------------------------------------------------------------
const t = read("modules/dashboard/components/team-widgets.tsx");
const up = t.slice(t.indexOf("export function UpcomingShortsWidget"), t.indexOf("export function UpcomingLongsWidget"));
ok(/const \[only, pickOnly\] = useSaved<boolean>\(settings\?\.only === true, "only", onSettings\);/.test(up) && /useSaved<EditorPick>\(typeof settings\?\.editor === "string" \? settings\.editor : "all", "editor", onSettings\)/.test(up), "the platform, only and the editor are saved with the dashboard");
ok(/const editor = editorPick\(wantEditor, people, none\);/.test(up), "a saved editor who isn't here any more: every editor");
ok(/const count = \(p: PlatformPick, e: EditorPick\) => items\.filter\(\(s\) => pass\(s, p, e\)\)\.length;/.test(up) && /options=\{editorOptions\(people, none, \(e\) => count\(platform, e\), nShorts, box\.w >= 420\)\}/.test(up), "each chip: how many you see when you pick it (with the other filter as it is)");
ok(/<FilterChips\s+label="Editor"/.test(up) && /const showEditors = room && editorChoice\(people, none, editor\);/.test(up), "the editor filter, when there's a choice");
ok(/role="checkbox"\s+aria-checked=\{only\}/.test(up) && /onClick=\{\(\) => pickOnly\(!only\)\}/.test(up), "Only: a checkbox (it ticks too)");
ok(/const showOnly = showPlatforms && platform !== "all" && \(only \|\| items\.some\(\(s\) => goesTo\(s\.platforms, platform\) && !goesTo\(s\.platforms, platform, true\)\)\);/.test(up), "Only shows when a platform is picked and it changes something (or it's on)");
ok(/onSettings\?\.\(\{ platform: "all", editor: "all" \}\);/.test(up) && !/onAll=\{\(\) => \{[^}]*onSettings[^}]*onSettings/.test(up), "Show all shorts saves both at once (two saves would each start from the old layout)");
ok(/<Nothing\s+text=\{nothingFor\(/.test(up) && /all="Show all shorts"/.test(up), "nothing left: says what, and a way back");
ok(/key=\{`\$\{platform\}\$\{only\}\$\{editor\}`\}/.test(up), "the list comes in again when a filter changes");

// --- Upcoming longs -----------------------------------------------------------------------------------------------------
const longs = t.slice(t.indexOf("export function UpcomingLongsWidget"), t.indexOf("const SHORT_STEPS"));
ok(/export function UpcomingLongsWidget\(\{ items, settings, onSettings \}/.test(longs) && /useSaved<EditorPick>\(typeof settings\?\.editor === "string" \? settings\.editor : "all", "editor", onSettings\)/.test(longs), "Upcoming longs: an editor filter, saved");
ok(/options=\{editorOptions\(people, none, count, nLongs, box\.w >= 420\)\}/.test(longs) && /editorsOf\(items\.map\(\(l\) => l\.editors\)\)/.test(longs), "its chips: whoever is on each video's Edit step");
ok(/const thumbW = box\.w >= 340 \? "w-\[68px\]" : box\.w >= 260 \? "w-\[52px\]" : "w-\[44px\]";/.test(longs) && /<img src=\{l\.thumb\}/.test(longs), "thumbnails, bigger in a wide widget");
ok(/\{narrow && \(/.test(longs) && /dueWord\(l\.date, today\)/.test(longs) && /\{!narrow && \(l\.date \? <DueChip/.test(longs), "narrow: the date under the title, so the title has room");
ok(/l\.editors\.slice\(0, 2\)\.map/.test(longs) && /const faces = box\.w >= 300;/.test(longs), "each video's editors, where there's room");
ok(!/PlatformIcon|label="Platform"|goesTo/.test(longs), "no platform filter: long videos only go to YouTube");

// --- Their data -----------------------------------------------------------------------------------------------------------
const q = read("modules/dashboard/lib/queries.ts");
ok(/editor:team_members!short_videos_editor_member_id_fkey\(id, user_id, profiles\(/.test(q) && /return \{ id: m\.id, name: displayName\(/.test(q), "a short's editor comes with their membership's id (what the filter saves)");
ok(/from\("project_assignees"\)\.select\("project_id, team_members\(id, user_id, profiles\(username, full_name, email, avatar_url\)\)"\)\.in\("project_id", longIds\)\.eq\("stage", "edit"\)/.test(q), "a long video's editors: its Edit step's people");
ok(/supabase\.from\("project_thumbnails"\)\.select\("id, project_id, position"\)\.in\("project_id", longIds\)\.order\("position"\)/.test(q), "and its sketches");
const winnerAt = q.indexOf("cover.set(w.project_id, studioThumb(w.id, 160))");
const sketchAt = q.indexOf("cover.set(s.project_id, sketchThumb(s.id, 160))");
ok(winnerAt > 0 && sketchAt > winnerAt && /if \(!cover\.has\(s\.project_id\)\)/.test(q), "its thumbnail: the winner, else the first sketch (as the long videos list)");

// --- The board ----------------------------------------------------------------------------------------------------------
ok(same(CATALOG.upcomingShorts.settings, { platform: "all", only: false, editor: "all" }) && same(CATALOG.upcomingLongs.settings, { editor: "all" }), "both start with everything");
const studio = read("modules/dashboard/components/studio.tsx");
ok(/<UpcomingLongsWidget items=\{data\.upcomingLongs\} settings=\{w\.settings\} onSettings=\{update\} \/>/.test(studio), "the board passes Upcoming longs its settings and saves the changes");
const form = studio.slice(studio.indexOf("function WidgetSettings"));
ok(/if \(w\.type === "upcomingShorts" \|\| w\.type === "upcomingLongs"\) \{/.test(form) && /Only that platform/.test(form) && /<Switch on=\{s\.only === true\} set=\{\(v\) => onChange\(\{ only: v \}\)\} \/>/.test(form), "their settings: the platform and Only (shorts)");
ok(/value=\{editorPick\(s\.editor, people, none\)\}/.test(form) && /\{ value: "all", label: "Every editor" \}, \.\.\.people\.map\(\(p\) => \(\{ value: p\.id, label: p\.name \}\)\)/.test(form), "and the editor (both), for a widget too small for its chips");

// --- Top videos ---------------------------------------------------------------------------------------------------------
const w = read("modules/dashboard/components/analytics-widgets.tsx");
const top = w.slice(w.indexOf("export function TopVideosWidget"), w.indexOf("// Audience map"));
ok(/export const TOP_SHOWN = 20;/.test(w) && /\.slice\(0, TOP_SHOWN\)/.test(top), "Top videos: the 20 best");
ok(/className="flex-1 min-h-0 widget-scroll -mx-1 motion-stagger"/.test(top) && /\{items\.map\(\(v, i\) => \(/.test(top) && !/items\.slice\(0, count\)/.test(top) && !/Math\.floor\(\(listH/.test(top), "in a list that scrolls inside the widget (not cut to what fits)");
ok(/<FilterChips\s+label="Platform"/.test(top) && /usePlatformPick\(settings, onSettings\)/.test(top), "its chips: the shared ones, the pick saved like Followers'");
const actions = read("app/(dashboard)/analytics/actions.ts");
ok(/const TOP_EACH = 20;/.test(actions) && /getContent\(teamId, w, shared, \{ limit: 200 \}\)/.test(actions) && /if \(n < TOP_EACH\) top\.push\(it\);/.test(actions), "the server sends each platform's 20 best");
ok(topVideosHref({ platform: "all" }) === "/analytics?tab=content&range=28d" && topVideosHref({ platform: "instagram" }) === "/analytics?tab=content&range=28d&platform=instagram" && topVideosHref({ platform: "x" }) === "/analytics?tab=content&range=28d" && topVideosHref() === "/analytics?tab=content&range=28d", "View all: Analytics → Content, the same 28 days, on the platform shown");
ok(/link: w\.type === "topVideos" \? \{ href: topVideosHref\(w\.settings\), label: "View all" \} : undefined,/.test(studio), "the board puts it on Top videos");
const grid = read("modules/dashboard/components/grid-board.tsx");
ok(/\{meta\.link && !editing && \(\s*<Link href=\{meta\.link\.href\}/.test(grid) && grid.indexOf("{meta.link && !editing") > grid.indexOf("{meta.name}</h2>") && grid.indexOf("{meta.link && !editing") < grid.indexOf("{hasSettings && (\n            <button"), "at the top right, after the title (not while customizing)");
const content = read("modules/analytics/components/tabs/content-tab.tsx");
ok(/const asked = useSearchParams\(\)\.get\("platform"\);/.test(content) && /useState<"all" \| P>\(\(\) => \(asked && \(ALL_P as readonly string\[\]\)\.includes\(asked\) \? \(asked as P\) : "all"\)\)/.test(content), "Content opens on the platform the link names");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("dashboard upcoming ok");
