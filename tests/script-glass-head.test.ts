// 1.53.1: with the glass look on, the script page's header (its bar, the steps and the formatting bar) is one pane of
// glass like a page's own bar (it was solid paper). Its blur is a layer behind it, so the menus hanging from it keep
// their own glass; over the other paper (a white page in dark mode) it and the app's top bar keep enough of their pane.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const flat = read("app/globals.css").replace(/\s+/g, " ");
const editor = read("modules/scripts/components/script-editor.tsx");

// --- The header ---------------------------------------------------------------------------------------------------------------
ok(editor.includes(`<div ref={headRef} data-script-head="" data-paper={paper} className="no-print sticky isolate bg-paper" style={headStyle}>`), "the header says it's the script's header and which paper is under it");
ok(editor.includes(`      : { position: "relative" }`) && !editor.includes(`{ position: "static" }`), "when it scrolls away on a phone it's still the frame of its glass layer");
ok(editor.includes('<div ref={toolRef} data-head-row="" className={`${hasTools ? "flex" : "hidden sm:flex"} items-center min-h-12 border-b border-line/10 bg-paper`}>') && editor.includes('<div role="toolbar" aria-label="Formatting"'), "the formatting bar is one of its rows (1.55.2: the one bar)");
ok(read("modules/scripts/components/script-flow.tsx").includes(`<div data-head-row="" className="no-print border-b border-line/10 bg-paper/60">`), "so are the steps");

// --- The glass ------------------------------------------------------------------------------------------------------------------
ok(flat.includes("html[data-glass] [data-script-head] { background-color: transparent; }"), "the paper colour goes");
ok(flat.includes(`html[data-glass] [data-script-head]::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; background-color: rgb(var(--surface) / calc(var(--glass-tint) * 0.9)); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); }`), "a page bar's tint and blur, on a layer behind it");
ok(!/\[data-script-head\] \{[^}]*backdrop-filter/.test(flat), "never a blur on the header itself (Page width and Export hang from it, and would lose their own glass)");
ok(flat.includes(`html.dark[data-glass] [data-script-head][data-paper="light"]::before, html[data-glass]:not(.dark) [data-script-head][data-paper="dark"]::before { background-color: rgb(var(--surface) / max(calc(var(--glass-tint) * 0.9), 0.82)); }`), "over the other paper it keeps at least 82 % of its pane");
const floor = flat.indexOf(`[data-script-head][data-paper="light"]::before`);
const opaque = flat.indexOf(`html[data-glass][data-glass-opaque] [data-script-head][data-paper]::before { background-color: rgb(var(--paper)); }`);
ok(opaque > floor && floor > 0, "solid glass: the paper, solid (after the floor, as specific, so it wins)");
ok(flat.includes("html[data-glass] [data-script-head] [data-head-row] { background-color: transparent; }"), "its rows lose their own paper");
ok(flat.includes(`html.dark[data-glass]:not([data-glass-opaque]):has([data-script-head][data-paper="light"]) [data-shell="header"], html[data-glass]:not(.dark):not([data-glass-opaque]):has([data-script-head][data-paper="dark"]) [data-shell="header"] { background-color: rgb(var(--surface) / max(calc(var(--glass-tint) * 0.75), 0.82)); }`), "the app's top bar above it does the same over that paper (its search read as a white band)");
ok(/html\[data-glass-style="liquid"\]:has\(\[data-script-head\]\) \[data-shell="header"\]::before \{ inset: 0; -webkit-mask-image: none; mask-image: none;/.test(flat), "Liquid: the top bar's soft band stops at its edge above it");

// --- 1.53.2: the buttons in the corner -----------------------------------------------------------------------------------------
ok(flat.includes("html[data-glass] .glass-fab.bg-surface-2 { background-color: rgb(var(--surface) / max(var(--glass-pop), 0.82)); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur); }"), "Suggestions and Comments float as a pane of their own (the inset colour all but vanished over a white page)");
ok(read("modules/scripts/components/workspace.tsx").includes(`className="no-print glass-fab fixed z-30 right-4`), "Comments is one");
ok(read("modules/scripts/grammar/grammar-ui.tsx").includes(`className="no-print glass-fab fixed z-30 right-4`), "Suggestions is one");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("script glass header ok");
