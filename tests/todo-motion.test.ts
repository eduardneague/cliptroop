// 1.53.3: To Do ticks off and deletes at once, and both go out with an animation. The owner (Nov 17 2026): "when you
// check something, i dont want the confirmation, and i want a cool outing animation, and whne you delete something, i
// want the same thing. give me a cool animatino for these things in the to do too." Ticked off: a pop, a green shine,
// its line struck, then it zips away; deleted: it puffs away, and Undo in the toast brings it back. In To Do, its quick
// panel and the dashboard's To Do widget. Also: the quick panel opens under the top bar with room between ("add some
// spacing for this as well from the top so it doesnt overlap with anything").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PREFS, cleanPrefs } from "../modules/todo/lib/model";
import { GONE_MS, HOLD_MS, OUT_MS, ZIP_MS } from "../modules/todo/lib/motion";
import { anchorBox, dropTop } from "../lib/menu-place";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const flat = read("app/globals.css").replace(/\s+/g, " ");

// --- No questions -------------------------------------------------------------------------------------------------------
ok(!("confirmDone" in DEFAULT_PREFS) && !("confirmDelete" in DEFAULT_PREFS) && !("confirmDone" in cleanPrefs({ confirmDone: true, confirmDelete: true })), "the ask-first settings are gone, and what was saved for them is left out");
ok(!/Ask before/.test(read("modules/todo/components/todo-sidebar.tsx")), "and To Do's settings no longer offer them");
const store = read("modules/todo/components/use-todo-store.ts");
const toggleFn = store.slice(store.indexOf("async function toggleDone("), store.indexOf("const inSet ="));
ok(!/confirm\(/.test(toggleFn) && !store.includes("markDoneConfirm"), "ticking off: at once");
const removeFn = store.slice(store.indexOf("async function remove("), store.indexOf("function undoRemove("));
ok(!/confirm\(/.test(removeFn) && !store.includes("Delete this to-do?"), "deleting: at once");
const widget = read("modules/dashboard/components/todo-widget.tsx");
ok(!/confirmDone|markDoneConfirm/.test(widget), "the dashboard widget doesn't ask either");

// --- Delete: a puff, then Undo while the toast is there ------------------------------------------------------------------
ok(/inSet\(setLeaving, id, true\);/.test(removeFn) && /setTimeout\(\(\) => \{\s*setTodos\(\(a\) => a\.filter\(\(x\) => x\.id !== id\)\);\s*inSet\(setLeaving, id, false\);\s*\}, GONE_MS\);/.test(removeFn), "it puffs away (leaving), then it's out of the lists");
ok(/toast\.success\(`Deleted “\$\{short\(t\.title\)\}”\.`, \{ sound: false, action: \{ label: "Undo", onClick: \(\) => undoRemove\(id\) \} \}\);/.test(removeFn), "the toast says what was deleted, with Undo");
ok(/const UNDO_MS = 7000;/.test(store) && /setTimeout\(\(\) => void deleteNow\(id\), UNDO_MS\)/.test(removeFn), "deleted for good only once Undo's time is up (the toast with Undo stays 6.5 s)");
ok(/clearTimeout\(d\.commit\);[\s\S]*?setTodos\(\(a\) => \(a\.some\(\(x\) => x\.id === id\) \? a : \[d\.t, \.\.\.a\]\)\);[\s\S]*?inSet\(setReturning, id, true\);/.test(store), "Undo: it comes back, sliding in, and isn't deleted");
ok(/window\.addEventListener\("pagehide", flush\);/.test(store) && /return \(\) => \{\s*window\.removeEventListener\("pagehide", flush\);\s*flush\(\);/.test(store), "leaving To Do or closing the tab deletes what's waiting at once");
ok(/if \(fail\(await A\.deleteTodo\(rid\)\)\) setTodos/.test(store), "a delete that fails puts it back");

// --- The rows ------------------------------------------------------------------------------------------------------------
const view = read("modules/todo/components/todo-list-view.tsx");
ok(/gone: store\.leaving\.has\(t\.id\),\s*entering: arrived\.has\(t\.id\) \|\| store\.returning\.has\(t\.id\),/.test(view), "To Do's rows puff away when deleted and slide back in on Undo");
ok(/\$\{state\.gone \? "is-gone" : ""\}/.test(read("modules/todo/components/todo-rows.tsx")), "a deleted row: .is-gone");
ok(/import \{ HOLD_MS, OUT_MS \} from "\.\.\/lib\/motion";/.test(view) && /later\(HOLD_MS, \(\) => \{\s*settle\(t\.id, "out"\);\s*later\(OUT_MS,/.test(view), "ticked off: it stays a moment, zips away, then lands in Completed");
ok(/onToggle=\{\(\) => \(rowsInfo\.current\.toggle \? rowsInfo\.current\.toggle\(selected\.id\) : void store\.toggleDone\(selected\.id\)\)\}/.test(read("modules/todo/components/todo-app.tsx")), "ticking it off in its details goes out the same way");
const quick = read("modules/todo/components/quick-todo-panel.tsx");
ok(/setTimeout\(\(\) => phase\(t\.id, "out"\), HOLD_MS\);\s*setTimeout\(\(\) => phase\(t\.id, null\), HOLD_MS \+ OUT_MS\);/.test(quick) && quick.includes('className={`todo-fold ${ticked.get(t.id) === "out" ? "is-out" : ""}`}'), "the quick panel: the same");
ok(/settle\(t\.id, all \? "zip" : "out"\);/.test(widget) && /later\(t\.id, all \? ZIP_MS : OUT_MS,/.test(widget) && /\$\{keepsPlace \? "keeps-place" : ""\} \$\{landing \? "is-landing" : ""\} \$\{gone \? "is-gone" : ""\}/.test(widget), "the widget: in All its place stays while it zips (no jump in a scrolled list), then it lands with the finished ones");
ok(/sounds\.remove\(\);\s*setIn\(setLeaving, t\.id, true\);\s*later\(t\.id, GONE_MS,/.test(widget), "the widget's delete puffs away too");
ok((read("modules/todo/components/todo-rows.tsx") + widget + quick).match(/todo-row group relative/g)?.length === 3, "every row holds its shine (position: relative)");

// --- The animations ------------------------------------------------------------------------------------------------------
for (const k of ["todo-zip", "todo-puff", "todo-shine", "todo-close", "todo-land"]) ok(flat.includes(`@keyframes ${k} {`), `@keyframes ${k}`);
ok(flat.includes(".todo-row.just-checked::after { content: \"\"; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;"), "a green shine across a just-ticked one");
ok(flat.includes(".todo-fold.is-out, .todo-fold.is-gone { grid-template-rows: 0fr; pointer-events: none; transition: none; animation: todo-close 0.3s var(--ease-out) var(--close-after) both; }"), "its place closes after it's mostly gone (an animation: with motion off it's simply gone)");
ok(flat.includes(".todo-fold.is-out .todo-row { transform-origin: left center; animation: todo-zip 0.42s both; }") && flat.includes(".todo-fold.is-gone .todo-row { animation: todo-puff 0.42s var(--ease-out) both; }"), "zip and puff");
ok(/100% \{ transform: translateX\(14%\) scale\(0\.86\); opacity: 0;/.test(flat), "the zip's right edge never passes its place's (14% + 86%): nothing scrolls sideways");
ok(flat.includes(".todo-fold:is(.is-out, .is-gone) > * { clip-path: inset(0 -32px); }") && flat.includes(".todo-fold.is-in > * { overflow: hidden; }"), "clipped top and bottom only while it goes (the wind-up reaches a little left)");
ok(flat.includes(".todo-fold { display: grid; grid-template-rows: 1fr; grid-template-columns: minmax(0, 1fr);"), "a long title still ends in … inside its row");
ok(flat.includes(".todo-fold.is-out.keeps-place { grid-template-rows: 1fr; animation: none; }"), "the widget's All keeps the place");
const sec = (re: RegExp) => Number((flat.match(re) ?? [])[1] ?? NaN) * 1000;
const outClose = sec(/\.todo-fold\.is-out \{ --close-after: ([\d.]+)s; \}/);
const goneClose = sec(/\.todo-fold\.is-gone \{ --close-after: ([\d.]+)s; \}/);
ok(OUT_MS >= outClose + 300 && GONE_MS >= goneClose + 300 && ZIP_MS >= 420, `the timings cover the animations (out ${OUT_MS} ≥ ${outClose}+300, gone ${GONE_MS} ≥ ${goneClose}+300, zip ${ZIP_MS} ≥ 420)`);
ok(HOLD_MS >= 400 && HOLD_MS <= 500, "a moment for the pop and the struck line, not a wait");

// --- Under the top bar ---------------------------------------------------------------------------------------------------
const rect = (top: number, bottom: number, left = 900, right = 936) => ({ top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const inBar = { getBoundingClientRect: () => rect(18, 54), closest: () => ({ getBoundingClientRect: () => rect(10, 62, 0, 1200) }) } as unknown as Element;
const loose = { getBoundingClientRect: () => rect(300, 336), closest: () => null } as unknown as Element;
ok(dropTop(inBar) === 72 && anchorBox(inBar).bottom === 66, "from the floating top bar (bottom at 62): it opens at 72, 10px under the bar");
ok(dropTop(loose) === 342 && anchorBox(loose).bottom === 336, "anywhere else: right under its button, as before");
ok(/const r = anchor\.current \? anchorBox\(anchor\.current\) : null;/.test(read("components/ui/anchored-menu.tsx")), "every dropdown from the top bar (the quick To Do among them)");
ok(/const bellPlace = \(bell: Element\) => \(\{ top: dropTop\(bell\),/.test(read("components/ui/notification-bell.tsx")), "and the bell's panel");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("to do motion, no questions, under the bar: ok");
