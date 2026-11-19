// 1.55.6: the owner, Nov 19 2026 (19:24):
//   * "to do and frame guides in the sidebar i dont want them to have different colors": their icons light up in the
//     amber accent like everything else (they had a teal and a green of their own), in the sidebar, the phone's bar and
//     its More list.
//   * "also update the loading skeleton for scripting now that we changed the layout": the script page's skeleton still
//     had the title row, a separate formatting row and the documents column. Now it has the page's own shape: one bar
//     (the real one's box, sizes and place, the glass card included), the phone's title row and steps above its
//     formatting bar, and the paper centred, as wide as the page is kept, light or dark.
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
const squash = (s: string) => s.replace(/\s+/g, "");

// ---- the sidebar ---------------------------------------------------------------------------------------------------------------
const nav = read("components/ui/sidebar-nav.tsx");
const accent = nav.slice(nav.indexOf("const ACCENT"), nav.indexOf("const accent ="));
ok(!/"\/todo"|"\/frame-guides"|text-teal|text-frame/.test(accent), "To Do and Frame Guides have no colour of their own");
ok(/"\/shorts": \{ on: "text-short"/.test(accent) && /"\/videos": \{ on: "text-long"/.test(accent) && /"\/meetings": \{ on: "text-violet"/.test(accent), "shorts, long videos and meetings keep theirs");
ok(/const accent = \(href: string\) => ACCENT\[href\] \?\? \{ on: "text-amber", hover: "group-hover:text-amber" \};/.test(nav), "everything else: the amber accent");
ok((nav.match(/accent\(href\)/g) ?? []).length >= 4, "the sidebar, the phone's bar and its More list all go by it");

// ---- the script page's skeleton ------------------------------------------------------------------------------------------------
const skel = read("modules/scripts/components/script-skeleton.tsx");
const sheet = read("modules/scripts/components/paper-sheet.tsx");
const editor = read("modules/scripts/components/script-editor.tsx");
ok(!/Versions|lg:w-60|SkeletonBack|backLabel/.test(skel), "no documents column, no title row with a label (1.55.4, 1.55.2)");
for (const f of ["app/(dashboard)/shorts/[id]/script/loading.tsx", "app/(dashboard)/videos/[id]/script/loading.tsx"]) ok(read(f).includes("return <ScriptSkeleton />;"), `${f}: the skeleton`);

// The header: the real one's box, in its place.
ok(/data-script-head="" data-paper=\{paper\} className="no-print isolate bg-paper relative z-\[15\] sm:sticky sm:top-\[var\(--script-head-top,var\(--shell-top,56px\)\)\]"/.test(sheet), "the header's box: marked as the script's header (the glass card), the paper under it");
const underBar = /const UNDER_BAR = `([^`]+)`;/.exec(editor)?.[1].replace("${APP_BAR}", String(/const APP_BAR = (\d+);/.exec(editor)?.[1]));
ok(!!underBar && squash(underBar) === "var(--script-head-top,var(--shell-top,56px))", `sticks where the real one does (${underBar})`);
ok(skel.includes('<div data-head-row="" className="flex items-center min-h-12 border-b border-line/10 bg-paper" aria-hidden>') && editor.includes('items-center min-h-12 border-b border-line/10 bg-paper`}>'), "the one bar: the real one's row");
ok(skel.includes('className="sm:mx-auto sm:w-max px-2 py-1.5 flex items-center gap-0.5"') && editor.includes('className="sm:mx-auto sm:w-max px-2 py-1.5 flex items-center gap-0.5"'), "the formatting: centred, the real padding (so the bar is the real height)");
ok(/<Skeleton className="h-10 w-32 sm:w-\[4\.75rem\] md:w-32 rounded-lg flex-shrink-0 mr-1" \/>/.test(skel), "the style menu: 40 px, as wide as the real one (narrower where the bar is short of room)");
ok(/\$\{small \? "w-8 h-8" : "w-9 h-9"\}/.test(skel) && /className=\{`w-9 h-9 rounded-lg flex items-center justify-center/.test(editor), "buttons the real ones' size");
ok(/hidden xl:flex/.test(skel) && /hidden lg:flex/.test(skel) && /hidden md:flex/.test(skel) && /sm:flex xl:hidden/.test(skel), "as much of the formatting as the width holds, as the real bar shows");
ok(skel.includes('<div className="hidden sm:flex items-center gap-1 flex-shrink-0 pl-2 lg:pl-3">') && skel.includes('<div className="hidden sm:flex items-center gap-0.5 flex-shrink-0 pl-1 pr-2 lg:pr-3">'), "its ends: the way back and the documents; the save state, the words, the page's buttons, the step's");
// Phones.
ok(skel.includes('<div data-head-row="" className="flex items-center gap-2 px-3 h-12 border-b border-line/10">') && editor.includes('<div data-head-row="" className="flex items-center gap-2 px-3 h-12 border-b border-line/10">'), "phones: the title row");
ok(/<div className="flex items-center gap-2 px-3 py-1\.5 flex-wrap">/.test(skel) && read("modules/scripts/components/script-flow.tsx").includes('<div className="flex items-center gap-2 px-3 sm:px-6 py-1.5 flex-wrap">'), "phones: the steps (the strip's own spacing)");

// The paper.
ok(skel.includes('<div className="flex-1 min-w-0 px-3 sm:px-8 py-6 sm:py-10" aria-hidden>') && editor.includes("relative flex-1 min-w-0 px-3 sm:px-8 py-6 sm:py-10"), "the paper: centred in the whole width, the real padding");
const strip = /const STRIP_W: Record<Width, string> = (\{[^}]+\});/.exec(editor)?.[1];
const paperW = /const PAPER_W: Record<string, string> = (\{[^}]+\});/.exec(sheet)?.[1];
ok(!!strip && strip === paperW, `as wide as the page is kept (${paperW})`);
ok(sheet.includes('read("vp:script-width")') && editor.includes('const WIDTH_KEY = "vp:script-width";') && sheet.includes('read("vp:script-paper") === "dark"') && editor.includes('const PAPER_KEY = "vp:script-paper";'), "read from where the page keeps them");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("1.55.6 fixes ok");
