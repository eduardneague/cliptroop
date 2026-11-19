// 1.54.1: the owner's list of Nov 18 2026 (15:40–15:56), testing staging with the team. Comments that flickered and
// opened nothing, writing suggestions that couldn't be turned off completely, the documents column that couldn't be
// closed, the gap above a script on glass, To Do not lined up and loading twice, the search window coming in twice,
// pictures in scripts (left, a Remove button, never dragged, copied on to the next step), and Frame Guides redone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { commentAt, findQuote } from "../modules/scripts/lib/anchors";
import { ScriptImage } from "../modules/scripts/components/script-image";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const css = read("app/globals.css").replace(/\s+/g, " ");

// --- Comments: a click finds its comment by where it landed; a saved one is on the page at once -------------------------
const schema = getSchema([StarterKit, ScriptImage]);
const doc = schema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Cadru perpendicular de sus pe masa, eventual prezentare generala;" }] }] });
const marks = [{ id: "c1", quote: "perpendicular de sus", occurrence: 0, resolved: false }, { id: "c2", quote: "masa", occurrence: 0, resolved: true }];
const r = findQuote(doc, "perpendicular de sus", 0)!;
ok(commentAt(doc, marks, r.from + 3) === "c1" && commentAt(doc, marks, r.to + 2) === null, "a click inside a comment's words finds it; outside, nothing");
ok(commentAt(doc, marks, findQuote(doc, "masa", 0)!.from + 1) === null, "a resolved comment isn't opened from the text");
const editor = read("modules/scripts/components/script-editor.tsx");
ok(editor.includes("editor.view.posAtCoords({ left: e.clientX, top: e.clientY })") && editor.includes("commentAt(editor.state.doc, commentStateRef.current.comments, hit.pos)"), "the paper's click falls back to where it landed");
ok(editor.includes('if (target.closest("[data-comment-pop]")) return;') && editor.includes('data-comment-pop=""'), "a click inside the open comment never closes it");
ok(editor.includes('label: posting.id ? "Posted" : "Posting…", done: !!posting.id'), "saved: \"Posted\" on its words, not \"Posting…\"");
ok(css.includes(".script-comment.gr-mark, .script-comment.gr-mark:hover { background-image: none; }"), "on a comment's words the suggestion line steps aside");
const live = read("modules/scripts/components/use-live-cursors.ts");
ok(live.includes('event: "comments"') && live.includes("window.addEventListener(COMMENTS_EVENT, onLocalComments)") && live.includes("onCommentsRef.current?.()"), "comments changed here: the others in the script hear about it and fetch them again");
const card = read("modules/scripts/components/comment-card.tsx");
ok((card.match(/commentsChanged\(/g) ?? []).length === 3 && card.includes("commentsChanged({ deleted: c.id })"), "edit, resolve and delete say so");

// --- Writing suggestions: off completely ------------------------------------------------------------------------------------
const gui = read("modules/scripts/grammar/grammar-ui.tsx");
ok(gui.includes('role="switch"') && gui.includes("<OnOff on={g.settings.on} onChange={(on) => g.setSettings({ on })} />"), "a switch in the panel's header");
ok(gui.includes("if (!g.settings.on) return null;") && gui.includes('{g.settings.on ? "Suggestions" : "Suggestions off"}'), "off: no corner button; the bar says so");
ok(editor.includes("const browserSpell = !grammar.live && grammar.settings.on;"), "off means no red lines at all, the browser's own spell check included");

// --- The script page: the documents column closes, no gap on glass ------------------------------------------------------------
ok(editor.includes('const RAIL_KEY = "vp:script-rail";') && editor.includes('remember(RAIL_KEY, open ? "closed" : "open")') && editor.includes('localStorage.getItem(RAIL_KEY) === "closed"'), "the documents column closes, and the browser remembers it");
ok(editor.includes('aria-label={railOpen ? "Close the documents column" : "Open the documents column"}') && editor.includes("lg:overflow-x-clip"), "its button; closed, it's a thin strip (clip, not hidden: its list still sticks)");
ok(editor.includes('${leftRail && !railOpen ? "" : "lg:hidden"}'), "closed: the documents dropdown is by the title on a computer too");
// (1.55.1: still nothing between them, now by the header hanging from the floating bar as one card: fixes-1551.)
ok(css.includes("html[data-glass] { --script-head-top: calc(var(--shell-top) - 10px); }") && css.includes(`html[data-glass]:has([data-script-head]) [data-shell="header"] { border-bottom-color: transparent; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }`), "on glass nothing shows between the floating bar and the header");

// --- Pictures in scripts ---------------------------------------------------------------------------------------------------
const img = read("modules/scripts/components/script-image.tsx");
ok(img.includes('default: "left",') && img.includes('|| "left"') && read("modules/scripts/components/use-script-images.ts").includes('align: "left", width: 60'), "a picture goes on the left");
ok(img.includes("draggable: false") && !img.includes("data-drag-handle") && img.includes("onDragStart={(e) => e.preventDefault()}"), "never dragged (a copy of it was dropped)");
ok(img.includes('aria-label="Remove image"'), "Remove on its bar");
const flow = read("modules/scripts/components/script-flow.tsx");
ok(flow.includes("if (!(await saveScriptNow(step.docId)))") && flow.indexOf("saveScriptNow(step.docId)") < flow.indexOf("await handOffScript("), "handed on: what's on the page is saved first, so the copy has the last words and pictures");
ok(editor.includes("window.addEventListener(SAVE_NOW_EVENT, onSaveNow)") && editor.includes("!imagesRef.current.pending()"), "the editor answers once it's saved (pictures still uploading waited for)");

// --- To Do -----------------------------------------------------------------------------------------------------------------------
ok(css.includes("@media (min-width: 900px) { html[data-glass] .todo-app { padding: 10px 20px 0; } }") && css.includes("@media (min-width: 1400px) { html[data-glass] .todo-app { padding: 10px 24px 0; } }"), "To Do's panes line up with the floating bar");
const todoPage = read("modules/todo/components/todo-page.tsx");
ok(!todoPage.includes("dynamic(") && todoPage.includes('<div className="contents">') && read("modules/todo/components/todo-skeleton.tsx").includes("useEffect(() => void loadTodoApp(), [])"), "one loading screen: the app comes in the skeleton's box, fetched while it shows");

// --- The search window --------------------------------------------------------------------------------------------------------
const gs = read("components/search/global-search.tsx");
ok(!gs.includes("lazy(") && gs.includes("instant={cameIn}") && read("components/search/search-palette.tsx").includes('instant ? " pop-instant" : ""') && css.includes(".pop-instant .pop-dim, .pop-instant .pop-modal { animation: none; }"), "the search window comes in once");

// --- Frame Guides -----------------------------------------------------------------------------------------------------------------
const fg = ["frame-guides-app", "frame-details", "frame-picker", "frame-bits"].map((f) => read(`modules/frames/components/${f}.tsx`)).join("\n");
ok(!/(^|[\s"`:])(bg|text|border|ring)-frame\b/.test(fg), "Frame Guides' buttons follow the theme (no teal)");
const app = read("modules/frames/components/frame-guides-app.tsx");
ok(app.includes("<CollectionPicker") && app.includes("<ShotFilter") && app.includes('ariaLabel="A-roll or B-roll"') && !app.includes("<aside"), "the filters on top, the frames the whole width");
ok(!/inset 4px 0 0/.test(app), "no coloured left edges");
ok(!/createCategory|CategoriesDialog|Your team's/.test(fg + read("modules/frames/actions.ts")), "a team's own categories are gone");
ok(read("modules/frames/components/frame-bits.tsx").includes('<span className="relative w-3 h-3 flex-shrink-0 flex items-center justify-center" aria-hidden>'), "a chip keeps its size on and off");
ok(read("modules/frames/components/frame-details.tsx").includes('<SaveTag s={fieldSave} field="categories" />') && css.includes(".fg-kw-new { animation: fg-kw-in"), "saving shows by the choice; keywords pop in and shrink away");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("1.54.1 fixes ok");
