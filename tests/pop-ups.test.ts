// 1.34.0: every pop-up leaves the way it came in (a still copy plays its way in backwards and can't be pressed), and
// the phone's tab bar has one lens that slides to the tab you press. A new pop-up with a one-way animation fails here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { longestMs, POP_PARTS } from "../lib/pop-ghost";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const walk = (d: string, out: string[] = []) => {
  for (const n of readdirSync(join(root, d))) {
    const p = join(d, n);
    if (statSync(join(root, p)).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
};

// --- The durations -----------------------------------------------------------------------------------------------------
ok(longestMs("0.22s") === 220 && longestMs("180ms") === 180 && longestMs("0.22s, 0.32s") === 320 && longestMs("1e-05s") < 1, "durations read as the browser gives them");
ok(longestMs("") === 0 && longestMs("auto") === 0, "nothing readable: no time");

// --- The styles: each part has a way in and the same way back, for as long ------------------------------------------------
const css = read("app/globals.css");
const parts = POP_PARTS.split(",").map((s) => s.trim().slice(1));
ok(parts.length === 8, `eight kinds of moving part (${parts.join(" ")})`);
for (const part of parts) {
  const enter = new RegExp(`\\.${part}\\b[^{]*\\{[^}]*animation: (pop-[a-z]+) var\\((--pop[a-z-]*)\\) var\\(--ease-out\\) backwards`).exec(css);
  const leave = new RegExp(`\\[data-leaving\\] \\.${part}\\b[^{]*\\{[^}]*animation: (pop-[a-z]+-out) var\\((--pop[a-z-]*)\\) var\\(--ease-leave\\) forwards !important`).exec(css);
  ok(!!enter, `.${part}: comes in (backwards: no transform left behind once in)`);
  ok(!!leave, `.${part}: leaves, speeding up as it goes`);
  if (enter && leave) {
    ok(leave[1] === `${enter[1]}-out`, `.${part}: the way out is the way in's own keyframes reversed (${enter[1]} → ${leave[1]})`);
    ok(leave[2] === enter[2], `.${part}: and takes as long (${enter[2]})`);
    const inKf = new RegExp(`@keyframes ${enter[1]} \\{ from \\{ ([^}]*) \\} \\}`).exec(css)?.[1];
    const outKf = new RegExp(`@keyframes ${leave[1]} \\{ to \\{ ([^}]*) \\} \\}`).exec(css)?.[1];
    ok(!!inKf && inKf === outKf, `.${part}: where it starts coming in is where it ends going out (${inKf} / ${outKf})`);
  }
}
ok(/\[data-leaving\], \[data-leaving\] \* \{ pointer-events: none !important; \}/.test(css), "nothing in a leaving pop-up can be pressed");
ok(/\[data-leaving\] \* \{ animation: none !important; \}/.test(css), "nothing else in it moves again");
ok(/--ease-leave: cubic-bezier\(0\.4, 0, 1, 1\)/.test(css), "the way out starts at once");

// --- The copy ------------------------------------------------------------------------------------------------------------
const ghost = read("lib/pop-ghost.ts");
ok(/copy\.inert = true/.test(ghost) && /copy\.setAttribute\("aria-hidden", "true"\)/.test(ghost) && /copy\.setAttribute\("data-leaving", ""\)/.test(ghost), "the copy: inert, hidden from screen readers, leaving");
ok(/const STRIP = \["role", "aria-modal", "data-confirm", "data-floating-menu", "data-tour", "data-tour-active"/.test(ghost), "never taken for an open window, menu, prompt or tour");
ok(/queueMicrotask\(\(\) => \{\s*if \(root\.isConnected \|\| !parent\.isConnected\) return;/.test(ghost), "only once React has really removed it (not Strict Mode's pretend), and not when the place around it went too");
ok(/b\.value = a\.value;/.test(ghost) && /scrolled\.push\(\[b, a\.scrollTop, a\.scrollLeft\]\)/.test(ghost) && /drawImage\(a, 0, 0\)/.test(ghost), "it keeps what was typed, scrolled and drawn");
ok(/HTMLVideoElement \|\| a instanceof HTMLAudioElement \|\| a instanceof HTMLIFrameElement/.test(ghost) && /b\.replaceWith\(box\)/.test(ghost), "never a second video, sound or embedded page");
ok(/const release = lock \? lockScroll\(\) : null;/.test(ghost) && /copy\.remove\(\);\s*release\?\.\(\);/.test(ghost), "a pop-up that held the page still goes on holding it while it leaves");
ok(/if \(ms < 20\) return;/.test(ghost), "animations off: no copy (its parts take no time)");
const leaves = read("components/ui/leaves.tsx");
ok(/useLayoutEffect\(\(\) => \{\s*const el = ref\.current;[\s\S]*?return \(\) => \{\s*if \(el\) leaveCopy\(el, \{ lock: locks\.current \}\);/.test(leaves), "<Leaves> copies its pop-up as React takes it away (a layout effect's clean-up, while it's still there)");
ok(/className="contents"/.test(leaves), "and adds no box of its own");

// --- Every pop-up -------------------------------------------------------------------------------------------------------
const POPUPS = [
  "components/ui/dialog.tsx",
  "components/ui/confirm-provider.tsx",
  "components/ui/anchored-menu.tsx",
  "components/ui/select.tsx",
  "components/ui/date-picker.tsx",
  "components/ui/color-picker.tsx",
  "components/ui/role-pills.tsx",
  "components/ui/mention-input.tsx",
  "components/ui/emoji-picker.tsx",
  "components/ui/workspace-switcher.tsx",
  "components/ui/lightbox.tsx",
  "components/ui/image-lightbox.tsx",
  "components/ui/whats-new.tsx",
  "components/ui/notification-bell.tsx",
  "components/ui/sidebar-nav.tsx",
  "components/ui/month-calendar.tsx",
  "components/search/search-palette.tsx",
  "components/tutorial/tour.tsx",
  "modules/outliers/components/panel.tsx",
  "modules/outliers/components/tabs/audience-tab.tsx",
  "modules/analytics/components/charts.tsx",
  "modules/short-videos/components/filters-menu.tsx",
  "modules/short-videos/components/row-menu.tsx",
  "modules/short-videos/components/keep-shorts-dialog.tsx",
  "app/(dashboard)/shorts/[id]/workflow-actions.tsx",
  "app/(dashboard)/team/delete-team-button.tsx",
  "app/(dashboard)/team/invite-search.tsx",
  "app/(dashboard)/team/transfer-ownership.tsx",
  "app/(dashboard)/videos/[id]/notes-panel.tsx",
  "modules/review/components/workspace.tsx",
  "modules/scripts/components/workspace.tsx",
  "modules/scripts/components/script-editor.tsx",
  "modules/scripts/components/comment-composer.tsx",
  "modules/scripts/components/link-ui.tsx",
  "modules/scripts/grammar/grammar-ui.tsx",
  "modules/scripts/sketch/sketch-studio.tsx",
];
for (const f of POPUPS) {
  const s = read(f);
  ok(/<Leaves[\s>]/.test(s) && /import \{ Leaves \} from "(\.\/leaves|@\/components\/ui\/leaves)";/.test(s), `${f}: leaves the way it came (<Leaves>)`);
  ok(new RegExp(`\\b(${parts.join("|")})\\b`).test(s), `${f}: its moving parts say how they move`);
}
// The way in and out live in the pop-* classes only: the old one-way entrances stay on what grows inside a page
// (a panel opening in place, a note appearing), never on something that floats over it.
const IN_PAGE: Record<string, string> = {
  "app/(dashboard)/calendar/calendar-view.tsx": "the month and a day's list appearing in place",
  "app/(dashboard)/shorts/[id]/page.tsx": "a banner in the page",
  "app/(dashboard)/shorts/[id]/schedule-panel.tsx": "a hint and a banner in the panel",
  "app/(dashboard)/team/invite-toggle.tsx": "the invite form opening in place",
  "app/(dashboard)/team/member-manager.tsx": "a member's settings opening in place",
  "app/(dashboard)/videos/[id]/page.tsx": "a banner in the page",
  "app/(dashboard)/videos/[id]/step-panels.tsx": "a step's panel appearing in place",
  "components/search/invite-panel.tsx": "a view inside the search window",
  "components/ui/not-found-content.tsx": "the page itself",
  "modules/dashboard/components/studio.tsx": "the dashboard's edit bar in place",
  "modules/dashboard/components/todo-widget.tsx": "a to-do's details opening in place",
  "modules/profile/components/profile-view.tsx": "the profile's edit bar in place",
  "modules/review/components/compare.tsx": "the compare view in place",
  "modules/review/components/player.tsx": "the player's own button",
  "modules/review/components/workspace.tsx": "a new note and a reply in the list",
  "modules/scripts/components/script-editor.tsx": "the suggestion line under the editor",
  "modules/scripts/grammar/grammar-ui.tsx": "a suggestion opening in its list",
};
const files = ["app", "components", "modules"].flatMap((d) => walk(d));
for (const f of files) {
  const s = read(f);
  if (/animate-\[(modalin|sheetup|sheetdown)/.test(s)) ok(!!IN_PAGE[f], `${f}: a one-way entrance. A pop-up: <Leaves> and a pop-* class; something growing inside the page: list it here with why`);
}
for (const f of Object.keys(IN_PAGE)) ok(/animate-\[(modalin|sheetup|sheetdown)/.test(read(f)), `${f}: still listed but has no one-way entrance any more: take it off the list`);

// --- The phone's tab bar ------------------------------------------------------------------------------------------------
const nav = read("components/ui/sidebar-nav.tsx");
ok(/<span aria-hidden className="nav-lens" data-hidden=\{at < 0 \? "" : undefined\} style=\{\{ \["--i" as string\]: Math\.max\(0, at\), \["--n" as string\]: MORE \+ 1 \}\}>/.test(nav), "one lens, in the slot of the tab you're on");
ok(/const at = more \? MORE : pressedAt >= 0 \? pressedAt : routeAt >= 0 \? routeAt : moreActive \? MORE : -1;/.test(nav), "it goes to the tab you press at once, More while its sheet is open, else where you are");
ok(/onClick=\{\(\) => press\(href\)\}/.test(nav) && /setPressed\(null\);/.test(nav), "a press moves it; the page arriving takes over");
ok(/aria-current=\{active \? "page" : undefined\}/.test(nav), "screen readers still hear the page you're really on");
ok(/\.nav-lens \{[\s\S]*?transform: translateX\(calc\(var\(--i\) \* 100%\)\);\s*transition: transform 0\.55s var\(--ease-spring\)/.test(css), "it slides with a little overshoot");
ok(/\.nav-lens-blob\[data-moved\] \{ animation: nav-stretch/.test(css) && /\.nav-hop \{ animation: nav-hop/.test(css), "stretching on the way, and the icon hops");
ok(/html\[data-glass-style="liquid"\] \.nav-lens-blob \{ inset: 0;/.test(css), "Liquid: a soft pill around the tab");
ok(!/nav-tick/.test(nav + css), "the old per-tab markers are gone");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("pop-ups ok");
