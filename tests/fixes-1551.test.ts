// 1.55.1: the owner, Nov 19 2026 (00:11), testing 1.55.0 on staging with Liquid glass in dark mode: "the left bar is
// scrolling by itself too, the entire header for scripting looks off when its on liquid glass, not good, its like a
// rectangle, i also want to collapse the top part as well or redesign it entirely to make it more compact".
//   * The documents column: 1.54.1 wrapped its list in a box as tall as the list itself, so the list's sticking had no
//     room and it scrolled away with the script while its button stayed put. Now the button and the list are one block
//     that sticks under the header; a list longer than the room scrolls on its own, inside it.
//   * The header on glass hangs from the floating top bar as one card (it ran edge to edge and on up behind the bar).
//   * Its top part (the title and the steps) folds away, leaving the formatting bar; the browser remembers it. Its rows
//     are slimmer too.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const css = read("app/globals.css").replace(/\s+/g, " ");
const editor = read("modules/scripts/components/script-editor.tsx");
const ws = read("modules/scripts/components/workspace.tsx");

// ---- the documents column ---------------------------------------------------------------------------------------------------
const rail = editor.slice(editor.indexOf("{leftRail && ("), editor.indexOf("{/* Paper */}"));
ok(rail.length > 200, "the column is there");
ok(
  /<div className="lg:sticky lg:top-\[var\(--script-head-bottom,10\.5rem\)\] lg:max-h-\[calc\(100dvh-var\(--script-head-bottom,10\.5rem\)\)\] flex flex-col">/.test(rail),
  "one block sticks under the header, never taller than the room below it"
);
ok(rail.indexOf("<PanelLeftIcon") > 0 && rail.indexOf("{leftRail}") > rail.indexOf("<PanelLeftIcon"), "the button and the list are in it together (they can't come apart)");
ok(/className=\{`min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll transition-opacity/.test(rail), "a long list scrolls inside it, and only when you scroll over it");
ok((rail.match(/lg:sticky/g) ?? []).length === 1, "nothing else in the column sticks on its own");
ok(/<nav className="px-3 lg:px-4 pt-3 lg:py-6" aria-label="Documents">/.test(ws) && !/<nav className="lg:sticky/.test(ws), "the list itself no longer sticks (inside a box its own size it couldn't, so it scrolled away)");

// ---- the header: one card with the floating top bar --------------------------------------------------------------------------
ok(/const UNDER_BAR = `var\(--script-head-top, var\(--shell-top, \$\{APP_BAR\}px\)\)`;/.test(editor), "it sticks where the page says (right under the floating bar on glass)");
ok(/calc\(\$\{UNDER_BAR\} \+ \$\{h\}px\)/.test(editor), "and what sits under it (the column, the link window) goes by the same place");
ok(css.includes("html[data-glass] { --script-head-top: calc(var(--shell-top) - 10px); }"), "on glass: right against the bar's lower edge (no gap)");
ok(css.includes(`html[data-glass]:has([data-script-head]) [data-shell="header"] { border-bottom-color: transparent; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }`), "the bar's lower corners square off above it");
ok(css.includes("html[data-glass] [data-script-head] { margin: 0 20px; border: 1px solid rgb(var(--glass-edge)); border-top: 0; border-radius: 0 0 18px 18px; box-shadow: var(--glass-shadow); }"), "the header lines up with the bar's edges, its lower corners round: one card, nothing edge to edge");
ok(css.includes("@media (min-width: 1400px) { html[data-glass] [data-script-head] { margin-left: 24px; margin-right: 24px; } }"), "lined up with the bar on wide screens too (24 px)");
ok(css.includes(`html[data-glass-style="liquid"] [data-script-head] { border-radius: 0 0 20px 20px; box-shadow: var(--liquid-drop); }`) && css.includes(`html[data-glass-style="liquid"]:has([data-script-head]) [data-shell="header"] { box-shadow: var(--liquid-rim); }`), "Liquid: its radius; the card's shadow is the header's (the bar's would fall on it)");
ok(css.includes(`html[data-glass-style="liquid"]:has([data-script-head]) [data-shell="header"]::after { display: none; }`), "Liquid: the bar's pointer light doesn't draw a ring across the card");
ok(css.includes(`html[data-glass] [data-script-head]::before { border-radius: inherit; }`), "its glass layer has its corners");
ok(css.includes(`html[data-glass] [data-script-head] > :last-child > [data-head-row]:last-child, html[data-glass] [data-script-head] > :last-child > div > [data-head-row]:last-child { border-bottom-color: transparent; }`), "its last row's line gives way to the card's edge");
ok(css.includes(`html[data-glass][data-glass-opaque] [data-script-head][data-paper]::before { background-color: rgb(var(--surface)); }`), "solid glass: the bar's solid pane, both halves alike");
ok(
  css.includes(`html.dark[data-glass]:not([data-glass-opaque]) [data-script-head][data-paper="light"]::before, html[data-glass]:not(.dark):not([data-glass-opaque]) [data-script-head][data-paper="dark"]::before, html.dark[data-glass]:not([data-glass-opaque]):has([data-script-head][data-paper="light"]) [data-shell="header"], html[data-glass]:not(.dark):not([data-glass-opaque]):has([data-script-head][data-paper="dark"]) [data-shell="header"] { background-color: rgb(var(--surface) / max(calc(var(--glass-tint) * 0.9), 0.95)); }`),
  "a white page in dark mode no longer shows through the card as a pale band (a rectangle on it)"
);
ok(!css.includes("[data-script-head]::before { top: calc(-1 * var(--shell-top, 72px)); }"), "1.54.1's pane run up behind the bar is gone");
ok(css.includes(`html[data-glass]:has([data-script-head]) [data-shell="edge"]::before { --edge-down: linear-gradient(#000 calc(100% - 10px), transparent); }`), "what scrolls up beside the card blurs away right down to it");

// ---- folding the top part away ---------------------------------------------------------------------------------------------
ok(editor.includes('const HEAD_KEY = "vp:script-head";') && editor.includes('remember(HEAD_KEY, c ? "full" : "compact")') && editor.includes('localStorage.getItem(HEAD_KEY) === "compact"'), "the title and the steps fold away, and the browser remembers it");
ok(editor.includes("const folded = compact && hasTools && !head.phone;"), "only where there's a formatting bar to keep, and not on phones (theirs scrolls away by itself)");
ok(/className=\{`grid \$\{headSlides \? "transition-\[grid-template-rows\] duration-300[^"]*" : ""\} \$\{folded \? "grid-rows-\[0fr\]" : "grid-rows-\[1fr\]"\}`\}/.test(editor), "it slides shut and open (a click; as the page opens it's just as it was left)");
ok(editor.includes('<div className={`min-h-0 ${folded || headMoving ? "overflow-hidden" : ""}`} inert={folded}>'), "folded, its buttons can't be reached by Tab; open, Page width and Export hang from it unclipped");
ok(editor.includes('aria-label={folded ? "Show the title and the steps" : "Hide the title and the steps"}') && editor.includes("<PanelTopIcon"), "its button, at the formatting bar's end, where it stays either way");
ok(/lead=\{\s*folded \? \(/.test(editor) && editor.includes("{folded && saveState(true)}"), "folded: the way back and the documents on the left of the bar, the save state on the right");
ok(editor.includes("{!folded && saveState(false)}") && editor.includes("{!folded && hereFaces}"), "open: those stay in the top bar (said once)");
ok(/\{lead && <div className="hidden sm:flex items-center gap-1\.5 flex-shrink-0 pl-2 lg:pl-4">\{lead\}<\/div>\}/.test(editor) && /\{tail && <div className="hidden sm:flex items-center gap-2 flex-shrink-0 pl-1 pr-2 lg:pr-4">\{tail\}<\/div>\}/.test(editor), "the formatting bar takes them at its ends");
ok(read("components/ui/icons.tsx").includes("export function PanelTopIcon("), "its icon, like the documents column's");

// ---- slimmer rows ----------------------------------------------------------------------------------------------------------
ok(editor.includes('<div data-head-row="" className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 h-12 border-b border-line/10">'), "the title row: 48 px (was 56)");
ok(read("modules/scripts/components/script-flow.tsx").includes('<div className="flex items-center gap-2 px-3 sm:px-6 py-1.5 flex-wrap">'), "the steps: a little slimmer");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("1.55.1 fixes ok");
