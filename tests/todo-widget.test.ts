// 1.53.4: the dashboard's To Do widget is To Do itself. The owner (Nov 17 2026): "the to do widget has to be the same as
// the to do that we just implemented. basically the same as that, not the old to do". So the widget is To Do's own list
// (ListView, compact): the same rows, add box, Completed, right-click menu, stars, order, animations and Undo, a click
// opens the to-do's details; its own top picks the list. The To Do page itself is unchanged.
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

// --- The widget: To Do's own pieces ---------------------------------------------------------------------------------------
const widget = read("modules/dashboard/components/todo-widget.tsx");
ok(/import \{ useTodoStore \} from "@\/modules\/todo\/components\/use-todo-store";/.test(widget) && /const store = useTodoStore\(board\);/.test(widget), "To Do's store: the same saving, order, settings, tick and delete (with Undo)");
ok(/import \{ ListView, type RowsInfo, type TeamData \} from "@\/modules\/todo\/components\/todo-list-view";/.test(widget) && /<ListView\s+compact=\{\{ counts, onView: pick \}\}/.test(widget), "To Do's list, in its compact way");
ok(/<Sheet onClose=\{\(\) => setSelectedId\(null\)\}>\s*<TodoDetails/.test(widget), "a click opens the to-do's details (To Do's), over the dashboard");
ok(/rowsInfo\.current\.toggle \? rowsInfo\.current\.toggle\(selected\.id\)/.test(widget), "ticking it off in its details goes out like a row's");
ok(/void store\.reorder\(arrayMove\(ids, from, to\)\);/.test(widget) && /!rowsInfo\.current\.sortable\) return;/.test(widget) && /<DraggedTodo title=\{dragged\?\.title\} \/>/.test(widget), "your order by dragging, where To Do allows it, with To Do's dragged card");
ok(/const saved = typeof settings\?\.list === "string" \? settings\.list : "myday";/.test(widget) && /\|\| listById\.has\(view\) \? view : "myday";/.test(widget), "the list it shows is kept with the widget; the old Everything, or a list that's gone: My Day");
ok(/c\.myday \+= team\.tasks\.filter/.test(widget) && /c\.assigned = team\.tasks\.filter\(\(t\) => t\.state === "active"\)\.length;/.test(widget), "its list menu counts as To Do's side bar does");
ok(/d\.kind !== "word" && d\.teamId === teamId && Date\.parse\(d\.at\) >= since/.test(widget), "the team's finished work: the last two weeks, as To Do reads it");
ok(!/createTodo|saveTodo|setTodoDone|deleteTodo|ShowsPicker|PRIORITY|FILTER_KEY/.test(widget), "nothing of the old widget's own (its saving, filters, priority flag)");
const studio = read("modules/dashboard/components/studio.tsx");
ok(/<TodoWidget board=\{data\.todo\} tasks=\{data\.tasks\} done=\{data\.done\} teamId=\{data\.teamId\} teamName=\{data\.teams\.find\(\(t\) => t\.id === data\.teamId\)\?\.name \?\? null\}/.test(studio), "the dashboard hands it the team's work it already has (no new reads)");
ok(/todo: \{ name: "To Do",[^\n]*bare: true,/.test(read("modules/dashboard/layout.ts")), "it draws its own top (bare): the list's name, not the card's");

// --- The compact list --------------------------------------------------------------------------------------------------------
const view = read("modules/todo/components/todo-list-view.tsx");
ok(/export type Compact = \{ counts: Record<string, number>; onView: \(v: ViewId\) => void \};/.test(view), "compact: the counts and the list picker");
ok(/\{compact \? \(\s*<CompactHeader /.test(view) && /function CompactHeader\(/.test(view), "its own top");
const head = view.slice(view.indexOf("function CompactHeader("), view.indexOf('// "Add a to-do"'));
ok(/<ViewGlyph view=\{view\} lists=\{listById\}/.test(head) && /style=\{\{ color: viewTextTone\(view, listById\) \}\}/.test(head) && /radial-gradient\(130% 150% at 0% 0%, rgb\(var\(\$\{viewVar\(view, listById\)\}\) \/ 0\.16\), transparent 62%\)/.test(head), "To Do's header: the list's icon, its name in its colour, its tint");
ok(/longDay\(today\)/.test(head) && /`\$\{openCount\} to do`/.test(head), "My Day's date, a list's count, as in To Do");
ok(/\["myday", "important", "planned", \.\.\.\(hasTeam \? \(\["assigned"\] as const\) : \[\]\), "tasks"\]/.test(head) && /lists\.map\(\(l\) =>/.test(head), "the picker: the smart lists (Assigned to me with a team) and your lists");
ok(/<Link href=\{todoHref\(view\)\} title="Open in To Do"/.test(head), "Open: To Do, on that list");
ok(/className=\{tight \? "flex-1 min-h-0 overflow-y-auto overflow-x-hidden widget-scroll todo-widget-scroll -mx-3 px-3 pb-1" :/.test(view), "its own scroll inside the widget (1.55.2: lined up on the right with floating scroll bars too)");
ok(/<AddBox key=\{view\} store=\{store\} view=\{view\} inputRef=\{addInput\} compact=\{tight\} \/>/.test(view) && /\$\{compact \? "top-0 pt-0\.5" : "top-14 md:top-0 pt-1"\}/.test(view), "the same add box, sticking at the top of the widget");
ok(/dense=\{tight\}/.test(view) && /\$\{dense \? "gap-2\.5 pl-2\.5 pr-1 py-1\.5 min-h-\[44px\]" : "gap-3 pl-3 pr-1\.5 py-2 min-h-\[52px\]"\}/.test(read("modules/todo/components/todo-rows.tsx")), "the same rows, a little tighter");
ok(/action=\{tight \? undefined : \{ label: "Suggestions", onClick: onSuggestions \}\}/.test(view) && /<AllDoneToday compact=\{tight\} \/>/.test(view), "smaller empty states, no Suggestions button (that's To Do's side panel)");

// --- The page: as it was -------------------------------------------------------------------------------------------------------
ok(/"md:flex-1 md:min-h-0 md:overflow-y-auto md:overflow-x-hidden styled-scroll px-3 sm:px-6 pb-8 md:pb-10"/.test(view) && /"flex flex-col md:h-full md:min-h-0"/.test(view), "the page keeps its own frame");
ok(/const rowsGap = tight \? "space-y-1" : "space-y-1\.5";/.test(view) && /const groupsGap = tight \? "space-y-3" : "space-y-5";/.test(view), "and its spacing");
const app = read("modules/todo/components/todo-app.tsx");
ok(/import \{ DraggedTodo, Sheet \} from "\.\/todo-overlays";/.test(app) && !/function Sheet\(/.test(app) && !/const underPointer/.test(app), "the page's details sheet and dragged card are shared, not copied");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("to do widget: ok");
