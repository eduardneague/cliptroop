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
const menu = ws.slice(ws.indexOf("function DocsMenu({"), ws.indexOf("/**\n * Another document as an equal page next to the one being written."));
ok(menu.length > 3000, "the documents dropdown (DocsMenu)");
const trigger = menu.slice(menu.indexOf("<button\n        ref={btn}"), menu.indexOf("<AnchoredMenu"));
ok(/const now = stepOf\(shownDoc\.id\);/.test(menu), "the open document's step (the one on its way, once clicked)");
ok(/\{now\?\.ticked && <CheckIcon className="w-3\.5 h-3\.5 text-green flex-shrink-0" aria-label="sent on" \/>\}/.test(trigger), "✓ once it was sent on");
ok(/\{now && now\.crew\.length > 0 && \(\s*<span className="pl-0\.5 flex-shrink-0">\s*<Crew people=\{now\.crew\} ring="ring-paper" \/>/.test(trigger), "who's on it: their faces, cut out against the bar");
ok(trigger.indexOf("<Crew") > trigger.indexOf("{shownDoc.name}") && trigger.indexOf("<ChevronDownIcon") > trigger.indexOf("<Crew"), "after the name, before the arrow");
ok(/max-w-\[14rem\]/.test(trigger) && /aria-haspopup="menu"/.test(trigger) && /title="Documents"/.test(trigger), "room for them (the name gives way first)");
const crew = ws.slice(ws.indexOf("function Crew("), ws.indexOf("/** The default documents"));
ok(/people\.slice\(0, 3\)\.map/.test(crew) && /\+\{people\.length - 3\}/.test(crew), "three faces, then how many more");
ok(/<span className="sr-only">\{names\}<\/span>/.test(crew) && /title=\{names\}/.test(crew) && /aria-hidden className=\{`rounded-full ring-2 \$\{ring\}`\}/.test(crew), "their names read out and on hover (the initials aren't)");
ok(/<Crew people=\{stepOf\(d\.id\)\?\.crew \?\? \[\]\} ring="ring-surface" \/>/.test(menu), "the rows' faces are the same");
// (The bar measures the dropdown as it is, so it makes room for the wider button: fixes-1552.)
ok(editor.includes("const docs = Math.round(docsRef.current?.offsetWidth || 100);"), "the bar makes room for it");

// ---- renaming and deleting, in the dropdown ---------------------------------------------------------------------------------------
ok(/canEdit: boolean;/.test(menu) && /canEdit=\{canEdit\}/.test(ws), "for those who may edit");
ok(/const deletable = \(d: DocListItem\) => !d\.step && !DEFAULT_DOCS\.includes\(d\.name\);/.test(ws) && /const DEFAULT_DOCS = \["Script", "Review", "Staging", "Research"\];/.test(ws), "deleting: never the default documents, nor one a step is on (even renamed)");
ok(/aria-label=\{`Rename \$\{d\.name\}`\}/.test(menu) && /<EditIcon className="w-3\.5 h-3\.5" \/>/.test(menu), "rename: a pencil on each row");
ok(/\{deletable\(d\) && \(/.test(menu) && /aria-label=\{`Delete \$\{d\.name\}`\}/.test(menu) && /<TrashIcon className="w-3\.5 h-3\.5" \/>/.test(menu), "delete: a bin on your own versions");
ok(/opacity-0 group-hover\/doc:opacity-100 group-focus-within\/doc:opacity-100 \[@media\(hover:none\)\]:opacity-100/.test(menu), "on hover or keyboard focus; always on a touch screen");
ok(/canEdit \? "transition-opacity group-hover\/doc:opacity-0 group-focus-within\/doc:opacity-0 \[@media\(hover:none\)\]:opacity-0" : ""/.test(menu), "they take the word count's place");
ok(/\{d\.id === sideId \? "On the right" : `\$\{d\.wordCount\} words`\}/.test(menu), "the one open beside it says so");
ok(/d\.id === shownDoc\.id \? "bg-amber\/10 font-bold" : "group-hover\/doc:bg-surface-2"/.test(menu), "the row stays lit while the pointer is on its buttons");

const box = menu.slice(menu.indexOf("<input\n                          ref={renameInput}"), menu.indexOf('className="flex-1 min-w-0 rounded-lg border border-amber'));
ok(/autoFocus/.test(box) && /defaultValue=\{d\.name\}/.test(box) && /maxLength=\{60\}/.test(box) && /onFocus=\{\(e\) => e\.currentTarget\.select\(\)\}/.test(box), "renaming: the name in a box, ready to type over");
ok(/data-floating-menu=""/.test(box) && /if \(e\.key === "Escape"\) void finishRename\(false\);/.test(box), "Escape gives up the new name, the menu stays open");
ok(/if \(e\.key === "Enter"\) void finishRename\(true\);/.test(box) && /onBlur=\{\(\) => void finishRename\(true\)\}/.test(box), "Enter, or leaving the box, keeps it");
const finish = menu.slice(menu.indexOf("const finishRename = "), menu.indexOf("const remove = "));
ok(/const id = renamingRef\.current;/.test(finish) && /renamingRef\.current = null;/.test(finish), "once (Enter, then the box going, isn't twice)");
ok(/if \(!keep \|\| !d \|\| !name \|\| name === d\.name\) return;/.test(finish), "nothing sent for nothing new");
ok(/setNames\(\(n\) => \(\{ \.\.\.n, \[d\.id\]: name \}\)\);\s*const r = await renameDoc\(d\.id, name\);/.test(finish) && /return void toast\.error\(r\.error\);/.test(finish) && /router\.refresh\(\);/.test(finish), "shown at once; taken back if it's turned down; the page's list fetched again");
ok(/const close = \(\) => \{\s*if \(renamingRef\.current\) void finishRename\(true\);\s*setOpen\(false\);/.test(menu) && /<AnchoredMenu open=\{open\} onClose=\{close\}/.test(menu), "a click outside while renaming keeps the name, as leaving the box does");
const remove = menu.slice(menu.indexOf("const remove = "), menu.indexOf("const close = "));
ok(/await confirm\(\{ title: `Delete “\$\{d\.name\}”\?`, description: "Its text and comments are deleted\.", confirmLabel: "Delete", danger: true \}\)/.test(remove), "deleting asks first");
ok(/setGone\(\(g\) => \[\.\.\.g, d\.id\]\);\s*const r = await deleteDoc\(d\.id\);/.test(remove) && /setGone\(\(g\) => g\.filter\(\(x\) => x !== d\.id\)\);/.test(remove) && /onDeleted\(d\.id\);/.test(remove), "gone from the list at once (back if it's turned down), then the page moves on");
ok(/setNames\(\(n\) => \(Object\.keys\(n\)\.some/.test(menu) && /setGone\(\(g\) => \(g\.some\(\(id\) => !docs\.some/.test(menu), "what was shown at once gives way to the page's list once it has it");
const deleted = ws.slice(ws.indexOf("onDeleted={(id) => {"), ws.indexOf("renderCommentPopover="));
ok(/if \(id === doc\.id\) \{\s*const next = docs\.find\(\(d\) => d\.kind === "script" && d\.id !== id && d\.id !== beside\)/.test(deleted) && /side: next\.id === beside \? null : undefined/.test(deleted), "the open one deleted: to another version (never the one beside it)");
ok(/if \(id === beside\) \{\s*setSideOpen\(false\);\s*return router\.push\(href\(\{ side: null \}\), \{ scroll: false \}\);/.test(deleted) && /router\.refresh\(\);/.test(deleted), "the one beside it: that side closes; any other: the list fetched again");

// ---- what stays (1.55.2) -----------------------------------------------------------------------------------------------------
ok(ws.includes('label="Documents" align={align} width={300}') && ws.includes("{heading && <div"), "it opens toward the free side, the video's title at its top");
ok(/\{g\.kind === "research" \? "Add research" : "Add version"\}/.test(menu), "adding a version or research");
ok(/disabled=\{d\.id === sideId\}/.test(menu) && /nav\.go\(href\(d\.id\), d\.id\);/.test(menu), "a click opens one (not the one beside it)");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("1.55.4 fixes ok");
