// 1.53.3: a picture opened from a script covers the whole page (it was under the script's header and the top bar, which
// didn't go dark); To Do fits the window under a floating top bar (no page scroll) and its panes are glass on glass;
// the dashboard's widget is called To Do; the script's "Who does what" says when it's saving.
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
const flat = read("app/globals.css").replace(/\s+/g, " ");

// --- Pictures -----------------------------------------------------------------------------------------------------------
const lb = read("components/ui/image-lightbox.tsx");
ok(/return createPortal\(\s*<Leaves lock>/.test(lb) && /document\.body\s*\);/.test(lb), "drawn at the top of the page (a portal), not inside the script's page");
ok(lb.includes("useScrollLock();") && lb.includes(`role="dialog"`) && lb.includes(`aria-modal="true"`), "the page holds still behind it, and it's a dialog");
ok(/window\.addEventListener\("keydown", onKey, true\)/.test(lb) && lb.includes("e.stopPropagation();"), "Esc closes only the picture");

// --- To Do on glass -----------------------------------------------------------------------------------------------------------
const app = read("modules/todo/components/todo-app.tsx");
ok(app.includes(`<div className="todo-app flex md:h-[calc(100dvh-var(--shell-top,3.5rem))] md:overflow-hidden">`), "the page is the window under the top bar, whatever its height (glass floats it at 72 px)");
ok(!/100dvh-3\.5rem\)\] md:overflow-hidden/.test(app + read("modules/todo/components/todo-skeleton.tsx")), "and so is its loading page");
ok((app.match(/data-todo-pane=""/g) ?? []).length === 2, "the side bar and the details are panes");
ok(/@media \(min-width: 768px\) \{ html\[data-glass\] \.todo-app \{ gap: 10px; padding: 0 10px 10px; \} html\[data-glass\] \[data-todo-pane\] \{ border: 1px solid rgb\(var\(--glass-edge\)\); border-radius: 18px; background-color: rgb\(var\(--surface\) \/ var\(--glass-tint\)\); -webkit-backdrop-filter: var\(--glass-blur\); backdrop-filter: var\(--glass-blur\);/.test(flat), "on glass: panes with room around them");
ok(flat.includes(`html[data-glass-style="liquid"] [data-todo-pane] { border-radius: 22px; box-shadow: var(--liquid-rim), var(--liquid-drop); }`), "Liquid: its rim");

// --- The widget's name --------------------------------------------------------------------------------------------------------
const layout = read("modules/dashboard/layout.ts");
ok(/todo: \{ name: "To Do", description: "Your To Do on the dashboard: [^"]+", [^\n]*isNew: true \},/.test(layout), "the dashboard's To Do widget is called To Do, first in Add a widget, marked New");
ok((layout.match(/isNew: true/g) ?? []).length === 1, "and it's the only one marked New (Win streak's badge was from 1.18.0)");

// --- Who does what ------------------------------------------------------------------------------------------------------------
const flow = read("modules/scripts/components/script-flow.tsx");
ok(/mark\("write", "saving"\);[\s\S]*?mark\("write", "saved"\);/.test(flow) && /mark\(s\.step, "saving"\);[\s\S]*?mark\(s\.step, "saved"\);/.test(flow), "every change says it's saving, then saved");
ok(flow.includes("Saving…") && /aria-busy=\{state\[s\.step\] === "saving"\}/.test(flow) && flow.includes(`"opacity-60 pointer-events-none"`), "the step waits, dimmed, while it saves");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("pictures, To Do on glass, widget name, who does what: ok");
