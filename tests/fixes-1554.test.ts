// 1.55.4: the owner, Nov 19 2026 (13:23): "now that we have the dropdown for the review version, i want the icons to be in
// the selected dropdown too of the profile pictures and lets get rid of the versions panel on the left hand side
// completely, its redundant at this point".
//   * The documents dropdown's button shows who's on the open document's step (their faces), and ✓ once it was sent on,
//     as its rows do.
//   * The documents column on the left is gone. What only it could do moved into the dropdown: renaming a document (the
//     pencil) and deleting one of your own versions (the bin), on hover (always on a touch screen); "On the right" for
//     the one open beside it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { at, has } from "./flat";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const ws = read("modules/scripts/components/workspace.tsx");
const editor = read("modules/scripts/components/script-editor.tsx");

// ---- no documents column ------------------------------------------------------------------------------------------------------
ok(!/leftRail|RAIL_KEY|railOpen|toggleRail|PanelLeftIcon|script-rail/.test(editor), "the editor has no documents column (its block, its button, its memory)");
ok(!/function DocRail|<DocRail|leftRail=/.test(ws), "and the page gives it none");
ok(editor.includes('{/* 1.55.4: no documents column on the left any more'), "the page starts with the paper");

// ---- the dropdown's button -----------------------------------------------------------------------------------------------------
// (1.55.8: checked with tests/flat.ts, so they hold however the file is formatted: an editor wrapped it at 80 columns.)
const menu = ws.slice(ws.indexOf("function DocsMenu({"), ws.indexOf("Another document as an equal page next to the one being written."));
ok(menu.length > 3000, "the documents dropdown (DocsMenu)");
const trigger = menu.slice(menu.indexOf("ref={btn}"), menu.indexOf("<AnchoredMenu"));
ok(has(menu, "const now = stepOf(shownDoc.id);"), "the open document's step (the one on its way, once clicked)");
ok(has(trigger, '{now?.ticked && <CheckIcon className="w-3.5 h-3.5 text-green flex-shrink-0" aria-label="sent on" />}'), "✓ once it was sent on");
ok(has(trigger, '{now && now.crew.length > 0 && (<span className="pl-0.5 flex-shrink-0"><Crew people={now.crew} ring="ring-paper" />'), "who's on it: their faces, cut out against the bar");
ok(at(trigger, "<Crew") > at(trigger, "{shownDoc.name}") && at(trigger, "<ChevronDownIcon") > at(trigger, "<Crew"), "after the name, before the arrow");
ok(has(trigger, "max-w-[14rem]", 'aria-haspopup="menu"', 'title="Documents"'), "room for them (the name gives way first)");
const crew = ws.slice(ws.indexOf("function Crew("), ws.indexOf("The default documents"));
ok(has(crew, "people.slice(0, 3).map", "+{people.length - 3}"), "three faces, then how many more");
ok(has(crew, '<span className="sr-only">{names}</span>', "title={names}", "aria-hidden className={`rounded-full ring-2 ${ring}`}"), "their names read out and on hover (the initials aren't)");
ok(has(menu, '<Crew people={stepOf(d.id)?.crew ?? []} ring="ring-surface" />'), "the rows' faces are the same");
// (The bar measures the dropdown as it is, so it makes room for the wider button: fixes-1552.)
ok(editor.includes("const docs = Math.round(docsRef.current?.offsetWidth || 100);"), "the bar makes room for it");

// ---- renaming and deleting, in the dropdown ---------------------------------------------------------------------------------------
ok(has(menu, "canEdit: boolean;") && has(ws, "canEdit={canEdit}"), "for those who may edit");
ok(has(ws, "const deletable = (d: DocListItem) => !d.step && !DEFAULT_DOCS.includes(d.name);", 'const DEFAULT_DOCS = ["Script", "Review", "Staging", "Research"];'), "deleting: never the default documents, nor one a step is on (even renamed)");
ok(has(menu, "aria-label={`Rename ${d.name}`}", '<EditIcon className="w-3.5 h-3.5" />'), "rename: a pencil on each row");
ok(has(menu, "{deletable(d) && (", "aria-label={`Delete ${d.name}`}", '<TrashIcon className="w-3.5 h-3.5" />'), "delete: a bin on your own versions");
ok(has(menu, "opacity-0 group-hover/doc:opacity-100 group-focus-within/doc:opacity-100 [@media(hover:none)]:opacity-100"), "on hover or keyboard focus; always on a touch screen");
ok(has(menu, 'canEdit ? "transition-opacity group-hover/doc:opacity-0 group-focus-within/doc:opacity-0 [@media(hover:none)]:opacity-0" : ""'), "they take the word count's place");
ok(has(menu, '{d.id === sideId ? "On the right" : `${d.wordCount} words`}'), "the one open beside it says so");
ok(has(menu, 'd.id === shownDoc.id ? "bg-amber/10 font-bold" : "group-hover/doc:bg-surface-2"'), "the row stays lit while the pointer is on its buttons");

const box = menu.slice(menu.indexOf("ref={renameInput}"), menu.indexOf("flex-1 min-w-0 rounded-lg border border-amber"));
ok(has(box, "autoFocus", "defaultValue={d.name}", "maxLength={60}", "onFocus={(e) => e.currentTarget.select()}"), "renaming: the name in a box, ready to type over");
ok(has(box, 'data-floating-menu=""', 'if (e.key === "Escape") void finishRename(false);'), "Escape gives up the new name, the menu stays open");
ok(has(box, 'if (e.key === "Enter") void finishRename(true);', "onBlur={() => void finishRename(true)}"), "Enter, or leaving the box, keeps it");
const finish = menu.slice(menu.indexOf("const finishRename = "), menu.indexOf("const remove = "));
ok(has(finish, "const id = renamingRef.current;", "renamingRef.current = null;"), "once (Enter, then the box going, isn't twice)");
ok(has(finish, "if (!keep || !d || !name || name === d.name) return;"), "nothing sent for nothing new");
ok(has(finish, "setNames((n) => ({ ...n, [d.id]: name })); const r = await renameDoc(d.id, name);", "return void toast.error(r.error);", "router.refresh();"), "shown at once; taken back if it's turned down; the page's list fetched again");
ok(has(menu, "const close = () => { if (renamingRef.current) void finishRename(true); setOpen(false);", "<AnchoredMenu open={open} onClose={close}"), "a click outside while renaming keeps the name, as leaving the box does");
const remove = menu.slice(menu.indexOf("const remove = "), menu.indexOf("const close = "));
ok(has(remove, 'await confirm({ title: `Delete “${d.name}”?`, description: "Its text and comments are deleted.", confirmLabel: "Delete", danger: true })'), "deleting asks first");
ok(has(remove, "setGone((g) => [...g, d.id]); const r = await deleteDoc(d.id);", "setGone((g) => g.filter((x) => x !== d.id));", "onDeleted(d.id);"), "gone from the list at once (back if it's turned down), then the page moves on");
ok(has(menu, "setNames((n) => (Object.keys(n).some", "setGone((g) => (g.some((id) => !docs.some"), "what was shown at once gives way to the page's list once it has it");
const deleted = ws.slice(ws.indexOf("onDeleted={(id) => {"), ws.indexOf("renderCommentPopover="));
ok(has(deleted, 'if (id === doc.id) { const next = docs.find((d) => d.kind === "script" && d.id !== id && d.id !== beside)', "side: next.id === beside ? null : undefined"), "the open one deleted: to another version (never the one beside it)");
ok(has(deleted, "if (id === beside) { setSideOpen(false); return router.push(href({ side: null }), { scroll: false });", "router.refresh();"), "the one beside it: that side closes; any other: the list fetched again");

// ---- what stays (1.55.2) -----------------------------------------------------------------------------------------------------
ok(has(ws, 'label="Documents" align={align} width={300}', "{heading && <div"), "it opens toward the free side, the video's title at its top");
ok(has(menu, '{g.kind === "research" ? "Add research" : "Add version"}'), "adding a version or research");
ok(has(menu, "disabled={d.id === sideId}", "nav.go(href(d.id), d.id);"), "a click opens one (not the one beside it)");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("1.55.4 fixes ok");
