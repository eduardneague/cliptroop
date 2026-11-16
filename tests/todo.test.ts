// 1.53.0: To Do. The owner (Nov 16 2026): "i want a to do list that is the same functionality as microsoft to do, i
// want a separate page for it, the to do widget to be better and a way to get to the to do faster ... The assigned to
// me tab will be the actual tasks that we get in the tasks widget." What has to stay true: everything is the person's
// own (the database's rules, no service key), Assigned to me reads the My tasks widget's tasks, reminders go out once,
// and the quick ways in (the menu, the top bar, T, search, the app icon) stay.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

// --- The database (0131) ----------------------------------------------------------------------------------------------
const sql = read("supabase/migrations/0131_todo.sql");
for (const t of ["todo_lists", "todo_steps", "todo_day_tasks"]) {
  ok(new RegExp(`create table if not exists ${t} `).test(sql) && new RegExp(`alter table ${t} enable row level security;`).test(sql), `${t}: made, with row rules`);
}
ok(/create policy "your own lists" on todo_lists for all to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\) with check \(user_id = \(select auth\.uid\(\)\)\);/.test(sql), "lists: your own");
ok(/with check \(user_id = \(select auth\.uid\(\)\) and \(list_id is null or exists \(select 1 from todo_lists l where l\.id = list_id and l\.user_id = \(select auth\.uid\(\)\)\)\)\);/.test(sql), "a to-do goes only into your own list");
ok(/with check \(user_id = \(select auth\.uid\(\)\) and exists \(select 1 from todos t where t\.id = todo_id and t\.user_id = \(select auth\.uid\(\)\)\)\);/.test(sql), "steps only on your own to-dos");
ok(/with check \(user_id = \(select auth\.uid\(\)\) and exists \(select 1 from tasks k where k\.id = task_id and k\.user_id = \(select auth\.uid\(\)\)\)\);/.test(sql), "only your own team tasks go in your My Day");
ok(/>= 100 then[\s\S]*100 lists already/.test(sql) && />= 20000 then/.test(sql) && /100 steps at most/.test(sql), "the limits: 100 lists, 20,000 to-dos, 100 steps a to-do");
ok(/and not meeting_reminders_due\(\) and not todo_reminders_due\(\) then/.test(sql), "the every-minute timer wakes the app for a due reminder");
ok(/revoke all on function todo_reminders_due\(\) from public, anon, authenticated;/.test(sql), "nobody asks the timer's question but the database");
ok(/if new\.remind_at is distinct from old\.remind_at then\s+new\.reminded_at := null;/.test(sql), "a moved reminder can go out again");
ok(/grant update \(todo_prefs\) on profiles to authenticated;/.test(sql) && /profiles_todo_prefs_ok check/.test(sql), "the page's settings: your own, and small");
ok(/foreach t in array array\['todo_lists', 'todo_steps', 'todo_day_tasks'\] loop[\s\S]*?"two-step sign-in"[\s\S]*?as restrictive/.test(sql), "two-step sign-in (0125) holds on the new tables");
ok(existsSync(join(root, "supabase/tests/todo.test.sql")), "and the database checks it for real (supabase/tests/todo.test.sql)");

// --- Actions: the person's own client only ------------------------------------------------------------------------------
const actions = read("modules/todo/actions.ts");
ok(/^"use server";/.test(actions), "server actions");
ok(!/createAdminClient/.test(actions), "no service key: the database's rules decide");
const exported = [...actions.matchAll(/^export async function ([A-Za-z]+)\(/gm)].map((m) => m[1]);
ok(exported.length >= 14, `every change has its action (${exported.length})`);
for (const fn of exported) {
  const body = actions.slice(actions.indexOf(`export async function ${fn}(`));
  const end = body.indexOf("\nexport ");
  ok(/await session\(\)/.test(end > 0 ? body.slice(0, end) : body), `${fn}: signed in first`);
}
ok(/async function session\(\) \{\s*const user = await getCachedUser\(\);/.test(actions), "session(): the signed-in person");
ok(/\.update\(\{ done_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", id\)\.is\("done_at", null\)/.test(actions), "a repeating to-do makes its next one only on the first tick");
ok(!/revalidatePath/.test(actions), "no page refresh after each change (each screen keeps its own copy)");

// --- Reminders --------------------------------------------------------------------------------------------------------
const rem = read("modules/todo/lib/reminders.ts");
ok(/\.update\(\{ reminded_at: stamp \}\)[\s\S]*?\.is\("reminded_at", null\)/.test(rem), "a reminder is claimed before it's sent (never twice)");
ok(/kind: "todo_reminder"/.test(rem) && /sendNotifications\(/.test(rem), "it goes to the bell and as a push");
ok(/\.gt\("remind_at", new Date\(now - 86_400_000\)\.toISOString\(\)\)/.test(rem), "one more than a day late stays quiet");
ok(/const todos = await runTodoReminders\(\);/.test(read("app/api/cron/posting/route.ts")), "the every-minute timer's call sends them");
ok(/case "todo_reminder":/.test(read("components/ui/notification-cards.tsx")), "the bell draws them");

// --- The page ---------------------------------------------------------------------------------------------------------
const page = read("app/(dashboard)/todo/page.tsx");
ok(/listMyTasks\(currentTeam\.id\)/.test(page), "Assigned to me: the My tasks widget's own tasks");
ok(/loadTodoBoard\(/.test(page) && existsSync(join(root, "app/(dashboard)/todo/loading.tsx")), "the page loads your To Do, with a loading screen");
const app = read("modules/todo/components/todo-app.tsx");
ok(/todoHref\(/.test(app) && /popstate/.test(app), "the address follows what's open (and Back works)");
ok(/MouseSensor[\s\S]*TouchSensor[\s\S]*KeyboardSensor/.test(app), "drag with a mouse, a finger (press and hold) or the keyboard");
const list = read("modules/todo/components/todo-list-view.tsx");
for (const s of ['view === "assigned"', 'view === "planned"', "Suggestions", "Completed"]) ok(list.includes(s), `the list view handles ${s}`);

// --- Faster ways in -----------------------------------------------------------------------------------------------------
ok(/const TODO = \{ href: "\/todo", label: "To Do"/.test(read("lib/nav-items.ts")) && /items: \[DASHBOARD, TODO\]/.test(read("lib/nav-items.ts")), "the menu: To Do under Dashboard");
ok(/MORE_ITEMS: NavItem\[\] = \[TODO,/.test(read("lib/nav-items.ts")), "phones: first in More");
ok(/<QuickTodo \/>/.test(read("app/(dashboard)/layout.tsx")), "the top bar's To Do button, on every page");
const quick = read("modules/todo/components/quick-todo.tsx");
ok(/e\.key\.toLowerCase\(\) !== "t" \|\| typing\(e\.target\)/.test(quick), "T opens it (not while typing)");
ok(/queueMicrotask\(\(\) => \{\s*if \(!e\.defaultPrevented\) setOpen/.test(quick) && /else if \(\(e\.key === "t" \|\| e\.key === "T"\) && variants\.length\) toggleCompare\("titles"\);/.test(read("modules/studio/components/studio.tsx")), "a page that uses T itself keeps it (Thumbnail Studio's titles)");
ok(/dynamic\(\(\) => import\("\.\/quick-todo-panel"\)/.test(quick) && /readTodoBoard\(\)/.test(read("modules/todo/components/quick-todo-panel.tsx")), "it reads To Do when it opens (its inside loads then too), not with every page");
const cat = read("lib/search/catalog.ts");
ok(/id: "todo", kind: "page", title: "To Do"/.test(cat) && /id: "new-todo", kind: "action", title: "Add a to-do"/.test(cat), "search: To Do and Add a to-do");
ok(/name: "To Do", url: "\/todo\?list=myday&source=app"/.test(read("app/manifest.ts")), "the installed app's icon: To Do");

// --- The widget ---------------------------------------------------------------------------------------------------------
const widget = read("modules/dashboard/components/todo-widget.tsx");
ok(/from "@\/modules\/todo\/actions"/.test(widget) && /function ShowsPicker/.test(widget), "the widget saves through To Do and picks which list it shows");
ok(/onSettings\?\.\(\{ list: s \}\)/.test(widget), "its list is kept with the widget");
ok(/\.\.\.\(w\.type === "todo" \? \{ link: \{ href: todoWidgetHref\(w\.settings\), label: "Open" \} \} : \{\}\)/.test(read("modules/dashboard/components/studio.tsx")), "its Open goes to To Do");
ok(!/export async function (addTodo|updateTodo|deleteTodo|reorderTodos)/.test(read("modules/dashboard/actions.ts")), "the widget's old actions are gone (one way to save a to-do)");
ok(/return loadTodoBoard\(\{ done: 50 \}\);/.test(read("modules/dashboard/lib/queries.ts")), "the dashboard reads open to-dos and the 50 finished last (not every one ever)");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("todo: ok");
