// 1.55.2: the owner, Nov 19 2026 (12:07), on 1.55.1's folded header: the documents dropdown "opens on the wrong side",
// and "add these buttons from the uncollapsed menu into the collapsed menu so we can get rid of that part completely,
// make icons basically and whatever you can, the words, saved state and so on, come up with a good redesign to have as
// many of them in a smaller footprint".
//   * A bigger screen has one bar: the way back and the documents; the formatting; who's here, the save state (a
//     cloud), the words, the page's buttons (page width, side by side, paper, export) and People with the step's
//     button. As it narrows, the less used things go into menus first (lib/bar-room.ts).
//   * The documents dropdown opens toward the free side, with the video's title and the steps (sent on, who's on each).
//   * Phones keep the title and the steps above the formatting bar.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { has } from "./flat";
import { barRoom } from "../modules/scripts/lib/bar-room";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const editor = read("modules/scripts/components/script-editor.tsx");
const ws = read("modules/scripts/components/workspace.tsx");
const flow = read("modules/scripts/components/script-flow.tsx");
const css = read("app/globals.css").replace(/\s+/g, " ");

// ---- what the bar holds at its width ----------------------------------------------------------------------------------------
const ORDER = ["title", "sugLabel", "flowLabels", "words", "undo", "pageBreak", "lists", "marks", "tools", "basics", "score", "sug"] as const;
{
  // Narrower, never more: and in the order above (the title goes first, the Suggestions button last).
  let last = barRoom(4000);
  ok(ORDER.every((k) => last[k]), "on a very wide screen, everything");
  let wrong = "";
  for (let w = 4000; w >= 600; w -= 4) {
    const r = barRoom(w);
    for (const k of ORDER) if (r[k] && !last[k]) wrong ||= `${k} comes back at ${w}`;
    const on = ORDER.map((k) => r[k]);
    const firstOn = on.indexOf(true);
    if (firstOn >= 0 && on.slice(firstOn).some((x) => !x)) wrong ||= `out of order at ${w}: ${JSON.stringify(r)}`;
    last = r;
  }
  ok(!wrong, `as it narrows, things only go, in their order (${wrong})`);
  ok(ORDER.every((k) => !barRoom(600)[k]), "at its narrowest, the basics only");
}
// Real screens (a 236 px sidebar, the glass card's margins): what each gets.
const at = (window: number) => barRoom(window - 236 - 48);
ok(at(2314).title && at(2314).sugLabel, "the owner's screen (2314 px): everything, the title too");
ok(!at(1920).title && !at(1920).sugLabel && at(1920).flowLabels && at(1920).words && at(1920).undo && at(1920).marks, "1920: all but the title and the word \"Suggestions\"");
ok(!at(1600).words && !at(1600).flowLabels && !at(1600).undo && at(1600).lists && at(1600).marks && at(1600).tools, "1600: the words count, the step's words, undo / redo and page break go first");
ok(!at(1440).lists && !at(1440).marks && at(1440).tools && at(1440).basics, "1440: checklist, quote and the marks under More; the page's buttons still out");
ok(!at(1280).tools && at(1280).basics, "1280: the page's buttons in one ⋯");
ok(barRoom(1636, { faces: 74 }).words === barRoom(1562).words, "others' faces take their room");
ok(barRoom(1400, { flow: false }).undo && !barRoom(1340).undo, "no step's button (research, no steps): more room for the rest");
ok(barRoom(1520, { docs: 140 }).words === barRoom(1480).words, "a longer document name takes its room");

// ---- the header ---------------------------------------------------------------------------------------------------------------
ok(/<div className="sm:hidden">\s*<div data-head-row="" className="flex items-center gap-2 px-3 h-12 border-b border-line\/10">/.test(editor) && /\{subBar\}\s*<\/div>\s*<div ref=\{toolRef\} data-head-row=""/.test(editor), "phones keep the title and the steps above the formatting bar");
ok(editor.includes('<div ref={toolRef} data-head-row="" className={`${hasTools ? "flex" : "hidden sm:flex"} items-center min-h-12 border-b border-line/10 bg-paper`}>') && /\{barLead\}\s*\{canEdit && editor \? \(\s*<Toolbar/.test(editor) && /\) : \(\s*<span className="flex-1" \/>\s*\)\}\s*\{barTail\}/.test(editor), "a bigger screen: one bar (without the formatting for people who only read)");
ok(editor.includes("room={head.phone ? null : room}"), "the formatting knows its room (a phone: the basics, the rest under More)");
ok(editor.includes("const w = Math.round(el.offsetWidth);") && editor.includes("const docs = Math.round(docsRef.current?.offsetWidth || 100);") && editor.includes("if (docsRef.current) ro.observe(docsRef.current);"), "it measures the bar and the documents dropdown");
ok(/const room = barRoom\(head\.w, \{ faces: others \? 34 \+ 20 \* \(Math\.min\(others, 3\) - 1\) \+ \(others > 3 \? 20 : 0\) : 0, flow: !!barFlow, docs: head\.docs \}\);/.test(editor), "and counts the faces and the step's button");
ok(!/HEAD_KEY|toggleHead|PanelTopIcon|data-folded/.test(editor), "no fold any more");

// ---- its left end ----------------------------------------------------------------------------------------------------------
const lead = editor.slice(editor.indexOf("const barLead = ("), editor.indexOf("const barTail = ("));
ok(lead.includes("<ArrowLeftIcon") && lead.includes("title={`${backLabel}: #${number} ${title}`}"), "the way back (its tooltip: which video)");
ok(lead.includes("{mobileDocs}") && lead.includes("{room.title && ("), "the documents; the title where there's room");

// ---- its right end ---------------------------------------------------------------------------------------------------------
const tail = editor.slice(editor.indexOf("const barTail = ("), editor.indexOf("return (\n    <div className=\"script-print-root"));
ok(tail.indexOf("{hereFaces}") < tail.indexOf("{saveMark}") && tail.indexOf("{saveMark}") < tail.indexOf("{room.words && ("), "who's here, the save state, the words");
ok(/<CloudCheckIcon className="w-\[18px\] h-\[18px\] text-green" \/>/.test(editor) && editor.includes('<CloudUpIcon className="w-[18px] h-[18px] text-ink-soft animate-pulse" />') && editor.includes("<CloudOffIcon"), "the save state: a cloud with a tick, one on its way, one crossed out");
ok(editor.includes('<span className="sr-only" aria-live="polite">') && /title=\{save\.text\} role="img" aria-label=\{save\.text\}/.test(editor), "its words in the tooltip, and read out");
ok(/save\.sign === "reload" \? \(\s*<button/.test(editor) && /save\.sign === "bad" \? \(/.test(editor), "in words only when something needs you (offline, not saved, reload)");
ok(tail.includes("{words.toLocaleString(\"en-US\")} words · {spokenLength(words)}"), "the words, and the time it takes to say them");
ok(/\{room\.tools && <WidthMenu value=\{width\} onChange=\{chooseWidth\} \/>\}\s*\{topBarExtra\}/.test(tail) && tail.includes("<ExportMenu onDocx={exportDocx} onPdf={exportPdf} />"), "the page's buttons: page width, side by side, paper, export");
ok(tail.includes('<MobileMenu className="" label="Page" paper={paper} onPaper={togglePaper} width={width} onWidth={chooseWidth} onDocx={exportDocx} onPdf={exportPdf} />'), "short of room: those in one ⋯, with the page width");
ok(/\{barFlow && \(\s*<>\s*<BarSep \/>\s*\{barFlow\(\{ labels: room\.flowLabels \}\)\}/.test(tail), "People and the step's button at the end");
ok(/aria-label="Page width"\s*title=\{`Page width: \$\{WIDTH_LABEL\[value\]\}`\}/.test(editor) && /aria-label="Export"\s*title="Export: Word or PDF"/.test(editor), "page width and export: just their signs");

// ---- the formatting -----------------------------------------------------------------------------------------------------------
ok(/\{room\?\.marks && \(/.test(editor) && /\{room\?\.lists && \(/.test(editor) && /\{room\?\.pageBreak && \(/.test(editor) && /\{room\?\.undo && \(/.test(editor) && /\{room\?\.basics && \(/.test(editor), "each group in the bar while there's room for it");
ok(editor.includes("const barMore = !!room && (sheet.strike || sheet.checklist || sheet.pageBreak || sheet.undo || sheet.basics);") && editor.includes('aria-label="More formatting"'), "the rest under More (only then)");
ok(editor.includes("{sheet.strike && (") && editor.includes("{sheet.colors && (") && editor.includes("{sheet.basics && ("), "More holds only what the bar has no room for");
ok(editor.includes("function AlignMenu(") && editor.includes('<AlignMenu editor={editor} at={s!.center ? "center" : s!.right ? "right" : "left"} />'), "alignment: one button showing which");
ok(editor.includes('label={!!room?.sugLabel} score={!room || room.score}') && read("modules/scripts/grammar/grammar-ui.tsx").includes("{g.live && score && ("), "Suggestions: its word and its score while there's room");
ok(editor.includes('className="sm:mx-auto sm:w-max px-2 py-1.5 flex items-center gap-0.5"'), "centred between the ends, from the left when it can't be");

// ---- the documents dropdown ---------------------------------------------------------------------------------------------------
// (1.55.8: workspace.tsx checked with tests/flat.ts, so they hold however the file is formatted.)
ok(has(ws, 'if (r) setAlign(r.left + r.width / 2 < window.innerWidth / 2 ? "left" : "right");', 'label="Documents" align={align} width={300}'), "it opens toward the free side (\"opens on the wrong side\")");
ok(has(ws, "heading={`#${number} ${title}`}", "{heading && <div"), "the video's title at its top");
ok(has(ws, "ticked: !!flow.data.done || !!st.sent", '{stepOf(d.id)?.ticked && <CheckIcon className="w-3.5 h-3.5 text-green flex-shrink-0" aria-label="sent on" />}', "<PersonAvatar name={p.name}"), "the steps on their documents: sent on, who's on each");

// ---- side by side, the steps -------------------------------------------------------------------------------------------------
ok(ws.includes('aria-label="Side by side"') && ws.includes('<ColumnsIcon className="w-4 h-4" />'), "Side by side: its sign");
ok(/barFlow=\{\s*flow\?\.data\.ready && doc\.kind === "script"\s*\? \(\{ labels \}\) => \(\s*<FlowStrip\s*variant="bar"\s*labels=\{labels\}/.test(ws), "the step's controls for the bar");
ok(flow.includes('if (variant === "bar") {') && flow.includes('aria-label="People on each step"') && flow.includes("{action(!labels)}"), "in the bar: People and the step's button");
ok(/if \(compact\) \{[\s\S]{0,200}if \(step\.sent && locked\)/.test(flow) && flow.includes("aria-label={`Ready for ${word}`}"), "the step's button, short of room: its arrow (its words in the tooltip)");
ok(flow.includes('aria-label="Staging done"'), "Staging done too");
const icons = read("components/ui/icons.tsx");
ok(["ColumnsIcon", "CloudCheckIcon", "CloudUpIcon", "CloudOffIcon"].every((n) => icons.includes(`export function ${n}(`)) && !icons.includes("PanelTopIcon"), "their icons");

// ---- glass ---------------------------------------------------------------------------------------------------------------------
ok(css.includes("html[data-glass] [data-script-head] > [data-head-row]:last-child { border-bottom-color: transparent; }"), "on glass the card's edge under the one bar");

// ---- 12:27: the To Do widget, its list menu and the team menu ------------------------------------------------------------
// ("theres some problems with this widget, not aligned properly, the menu is too round, it doesnt fit well, same for the
// team menu too")
const menu = read("components/ui/anchored-menu.tsx");
ok(menu.includes("pop-menu glass-pane styled-scroll fixed z-[125] rounded-[14px] border") && !/pop-menu glass-pane[^"]*rounded-2xl/.test(menu), "menus: 14 px corners (were 16, and 22 with Liquid)");
ok(css.includes(`html[data-glass-style="liquid"] .bg-surface.rounded-xl:not(.pop-menu) { border-radius: 16px; }`) && css.includes(`html[data-glass-style="liquid"] .bg-surface.rounded-2xl:not(.pop-menu) { border-radius: 22px; }`), "Liquid's rounder corners leave menus alone (the team menu too)");
const list = read("modules/todo/components/todo-list-view.tsx");
ok(list.includes("widget-scroll todo-widget-scroll -mx-3 px-3 pb-1") && css.includes(`html:not([data-bars="classic"]) .widget-scroll.todo-widget-scroll { padding-right: 12px; }`), "the widget's rows as far from the right edge as from the left, with floating scroll bars too (under the header's arrow)");
ok(list.includes("setMenuW(Math.round(Math.min(320, Math.max(220, pick.ref.current?.offsetWidth ?? 250))));") && list.includes("width={menuW}"), "its list menu as wide as the name it opens from");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("1.55.2 fixes ok");
