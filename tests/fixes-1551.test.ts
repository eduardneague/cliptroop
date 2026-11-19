// 1.55.1: the owner, Nov 19 2026 (00:11), testing 1.55.0 on staging with Liquid glass in dark mode: "the left bar is
// scrolling by itself too, the entire header for scripting looks off when its on liquid glass, not good, its like a
// rectangle, i also want to collapse the top part as well or redesign it entirely to make it more compact".
//   * The documents column: 1.54.1 wrapped its list in a box as tall as the list itself, so the list's sticking had no
//     room and it scrolled away with the script while its button stayed put. Now the button and the list are one block
//     that sticks under the header; a list longer than the room scrolls on its own, inside it. (1.55.4: the column is
//     gone, the documents dropdown has them all.)
//   * The header on glass hangs from the floating top bar as one card (it ran edge to edge and on up behind the bar).
//   * Its top part (the title and the steps) folded away, leaving the formatting bar (1.55.2 put everything in that one
//     bar instead: fixes-1552.test.ts).
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

// ---- the documents column: gone in 1.55.4 (the documents dropdown has them all: fixes-1554.test.ts) ----------------------------
ok(!editor.includes("{leftRail && (") && !editor.includes("leftRail") && !ws.includes("<DocRail"), "no documents column (the owner, 1.55.4: \"its redundant at this point\")");

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
ok(css.includes(`html[data-glass] [data-script-head] > [data-head-row]:last-child { border-bottom-color: transparent; }`), "its last row's line gives way to the card's edge (1.55.2: its one bar)");
ok(css.includes(`html[data-glass][data-glass-opaque] [data-script-head][data-paper]::before { background-color: rgb(var(--surface)); }`), "solid glass: the bar's solid pane, both halves alike");
ok(
  css.includes(`html.dark[data-glass]:not([data-glass-opaque]) [data-script-head][data-paper="light"]::before, html[data-glass]:not(.dark):not([data-glass-opaque]) [data-script-head][data-paper="dark"]::before, html.dark[data-glass]:not([data-glass-opaque]):has([data-script-head][data-paper="light"]) [data-shell="header"], html[data-glass]:not(.dark):not([data-glass-opaque]):has([data-script-head][data-paper="dark"]) [data-shell="header"] { background-color: rgb(var(--surface) / max(calc(var(--glass-tint) * 0.9), 0.95)); }`),
  "a white page in dark mode no longer shows through the card as a pale band (a rectangle on it)"
);
ok(!css.includes("[data-script-head]::before { top: calc(-1 * var(--shell-top, 72px)); }"), "1.54.1's pane run up behind the bar is gone");
ok(css.includes(`html[data-glass]:has([data-script-head]) [data-shell="edge"]::before { --edge-down: linear-gradient(#000 calc(100% - 10px), transparent); }`), "what scrolls up beside the card blurs away right down to it");

// ---- folding the top part away, and slimmer rows: replaced in 1.55.2 by one bar with everything in it (fixes-1552) ----
ok(!/HEAD_KEY|toggleHead|PanelTopIcon/.test(editor), "the fold is gone (the owner: \"so we can get rid of that part completely\")");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("1.55.1 fixes ok");
