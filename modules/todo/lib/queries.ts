import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { cleanColor, cleanPrefs, cleanRepeat, cleanSort, DEFAULT_PREFS, type DayPin, type TodoBoard, type TodoItem, type TodoList, type TodoStep } from "./model";

type Client = Awaited<ReturnType<typeof createClient>>;

const COLS = "id, title, notes, list_id, important, priority, my_day, due_date, remind_at, repeat, categories, position, done_at, created_at";
/** Before 0131: the widget's own columns (0053), so the list still opens while the database catches up. */
const OLD_COLS = "id, title, notes, due_date, priority, position, done_at, created_at";

type Row = Record<string, unknown>;

export function toItem(r: Row, steps: TodoStep[] = []): TodoItem {
  return {
    id: r.id as string,
    title: r.title as string,
    notes: (r.notes as string | null) ?? null,
    listId: (r.list_id as string | null) ?? null,
    important: !!r.important,
    priority: Number(r.priority ?? 0) || 0,
    myDay: (r.my_day as string | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    remindAt: (r.remind_at as string | null) ?? null,
    repeat: cleanRepeat(r.repeat),
    categories: Array.isArray(r.categories) ? (r.categories as string[]) : [],
    position: Number(r.position ?? 0),
    doneAt: (r.done_at as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? new Date(0).toISOString(),
    steps,
  };
}

export const toStep = (s: Row): TodoStep => ({ id: s.id as string, todoId: s.todo_id as string, title: s.title as string, doneAt: (s.done_at as string | null) ?? null, position: Number(s.position ?? 0) });

export function toList(l: Row): TodoList {
  return {
    id: l.id as string,
    name: l.name as string,
    emoji: (l.emoji as string | null) ?? null,
    color: cleanColor(l.color),
    position: Number(l.position ?? 0),
    sort: cleanSort({ by: (l.sort_by as string | null) ?? "custom", dir: l.sort_dir }),
    hideDone: !!l.hide_done,
  };
}

/** A missing table or column (the database before 0131). */
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

/**
 * Your whole To Do: every open to-do (up to 2,000), the latest finished ones (`done`, 300 on the page), their steps,
 * your lists, the team tasks you put in My Day and your settings. `ready` false: the database is before 0131 (only the
 * widget's to-dos, nothing new can be saved there yet).
 */
export async function loadTodoBoard(o: { done?: number; client?: Client } = {}): Promise<TodoBoard> {
  const supabase = o.client ?? (await createClient());
  const user = await getCachedUser();
  const empty: TodoBoard = { lists: [], todos: [], pins: [], prefs: DEFAULT_PREFS, ready: true };
  if (!user) return empty;
  const doneLimit = o.done ?? 300;
  const [open, done, lists, steps, pins, prefs] = await Promise.all([
    supabase.from("todos").select(COLS).is("done_at", null).order("position").limit(2000),
    supabase.from("todos").select(COLS).not("done_at", "is", null).order("done_at", { ascending: false }).limit(doneLimit),
    supabase.from("todo_lists").select("id, name, emoji, color, position, sort_by, sort_dir, hide_done").order("position"),
    supabase.from("todo_steps").select("id, todo_id, title, done_at, position").order("position").limit(5000),
    supabase.from("todo_day_tasks").select("task_id, day"),
    supabase.from("profiles").select("todo_prefs").eq("id", user.id).maybeSingle(),
  ]);
  if (missing(open.error) || missing(lists.error)) return { ...empty, todos: await oldTodos(supabase, doneLimit), ready: false };

  const byTodo = new Map<string, TodoStep[]>();
  for (const s of (steps.data ?? []) as Row[]) {
    const step = toStep(s);
    byTodo.set(step.todoId, [...(byTodo.get(step.todoId) ?? []), step]);
  }
  const rows = [...((open.data ?? []) as Row[]), ...((done.data ?? []) as Row[])];
  return {
    lists: ((lists.data ?? []) as Row[]).map(toList),
    todos: rows.map((r) => toItem(r, byTodo.get(r.id as string) ?? [])),
    pins: ((pins.data ?? []) as Row[]).map((p): DayPin => ({ taskId: p.task_id as string, day: p.day as string })),
    prefs: cleanPrefs((prefs.data as { todo_prefs?: unknown } | null)?.todo_prefs),
    ready: true,
  };
}

/** The widget's to-dos as they were (0053), for a database before 0131. */
async function oldTodos(supabase: Client, doneLimit: number): Promise<TodoItem[]> {
  const [open, done] = await Promise.all([
    supabase.from("todos").select(OLD_COLS).is("done_at", null).order("position").limit(2000),
    supabase.from("todos").select(OLD_COLS).not("done_at", "is", null).order("done_at", { ascending: false }).limit(doneLimit),
  ]);
  return [...((open.data ?? []) as Row[]), ...((done.data ?? []) as Row[])].map((r) => toItem(r));
}
