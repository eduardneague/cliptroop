"use server";

/**
 * To Do (1.53.0): everything the page, the widget and the quick panel change. Each one runs as the person (their own
 * client): the database's rules (0053, 0131) let them reach only their own lists, to-dos, steps and My Day, and put a
 * to-do only into their own list. Nothing here refreshes a page: each screen keeps its own copy up to date (a new
 * visit reads everything again), so a tick doesn't cost a whole page on the server.
 */
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import {
  cleanCategories,
  cleanColor,
  cleanEmoji,
  cleanMoment,
  cleanNotes,
  cleanPrefs,
  cleanRepeat,
  cleanSort,
  cleanTitle,
  isDay,
  UUID_RX,
  type Repeat,
  type SortBy,
  type SortDir,
  type TodoBoard,
  type TodoItem,
  type TodoPrefs,
} from "./lib/model";
import { loadTodoBoard, toItem, toStep } from "./lib/queries";

type R<T = object> = ({ error?: undefined } & T) | { error: string };

const SIGNED_OUT = { error: "Your session expired. Sign in again." } as const;
const COLS = "id, title, notes, list_id, important, priority, my_day, due_date, remind_at, repeat, categories, position, done_at, created_at";
/** The database's own words for a limit (0131's triggers), shown as they are. */
const limitWords = (m?: string) => (m && /lists already|to-dos already|steps at most/.test(m) ? m.replace(/^.*?(You have|A to-do)/, "$1") : null);

async function session() {
  const user = await getCachedUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function createTodoList(input: { name: string; emoji?: string | null; color?: string }): Promise<R<{ id: string; position: number }>> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const name = cleanTitle(input.name, 100) || "Untitled list";
  const { data: last } = await s.supabase.from("todo_lists").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const position = Number(last?.position ?? 0) + 1;
  const { data, error } = await s.supabase
    .from("todo_lists")
    .insert({ name, emoji: cleanEmoji(input.emoji), color: cleanColor(input.color), position })
    .select("id")
    .single();
  if (error || !data) return { error: limitWords(error?.message) ?? "Couldn't make the list. Try again." };
  return { id: data.id as string, position };
}

export async function updateTodoList(
  id: string,
  patch: { name?: string; emoji?: string | null; color?: string; sortBy?: SortBy; sortDir?: SortDir; hideDone?: boolean }
): Promise<R> {
  if (!UUID_RX.test(id)) return { error: "That list is gone." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = cleanTitle(patch.name, 100);
    if (!n) return { error: "A list needs a name." };
    row.name = n;
  }
  if (patch.emoji !== undefined) row.emoji = cleanEmoji(patch.emoji);
  if (patch.color !== undefined) row.color = cleanColor(patch.color);
  if (patch.sortBy !== undefined || patch.sortDir !== undefined) {
    const sort = cleanSort({ by: patch.sortBy, dir: patch.sortDir });
    row.sort_by = sort.by === "custom" ? null : sort.by;
    row.sort_dir = sort.dir;
  }
  if (patch.hideDone !== undefined) row.hide_done = !!patch.hideDone;
  if (!Object.keys(row).length) return {};
  const { error } = await s.supabase.from("todo_lists").update(row).eq("id", id);
  return error ? { error: "Couldn't save the list. Try again." } : {};
}

/** The list and every to-do in it. */
export async function deleteTodoList(id: string): Promise<R> {
  if (!UUID_RX.test(id)) return { error: "That list is gone." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { error } = await s.supabase.from("todo_lists").delete().eq("id", id);
  return error ? { error: "Couldn't delete the list." } : {};
}

/** Lists in the order given. */
export async function reorderTodoLists(ids: string[]): Promise<R> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const clean = ids.filter((x) => UUID_RX.test(x)).slice(0, 100);
  const results = await Promise.all(clean.map((id, i) => s.supabase.from("todo_lists").update({ position: i + 1 }).eq("id", id)));
  return results.some((r) => r.error) ? { error: "Couldn't save the order." } : {};
}

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

export type NewTodo = {
  title: string;
  listId?: string | null;
  myDay?: string | null;
  important?: boolean;
  priority?: number;
  dueDate?: string | null;
  remindAt?: string | null;
  repeat?: Repeat | null;
  /** On top of the list (else at the bottom). */
  onTop?: boolean;
};

export async function createTodo(input: NewTodo): Promise<R<{ todo: TodoItem }>> {
  const title = cleanTitle(input.title);
  if (!title) return { error: "Write something first." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const onTop = input.onTop !== false;
  const { data: edge } = await s.supabase
    .from("todos")
    .select("position")
    .order("position", { ascending: onTop })
    .limit(1)
    .maybeSingle();
  const position = Number(edge?.position ?? 0) + (onTop ? -1 : 1);
  const listId = input.listId && UUID_RX.test(input.listId) ? input.listId : null;
  const repeat = cleanRepeat(input.repeat);
  const row = {
    title,
    list_id: listId,
    my_day: isDay(input.myDay) ? input.myDay : null,
    important: !!input.important,
    priority: Math.max(0, Math.min(3, Math.floor(Number(input.priority ?? 0)) || 0)),
    due_date: isDay(input.dueDate) ? input.dueDate : null,
    remind_at: cleanMoment(input.remindAt),
    repeat,
    position,
  };
  const { data, error } = await s.supabase.from("todos").insert(row).select(COLS).single();
  if (error || !data) return { error: limitWords(error?.message) ?? (error?.code === "42501" ? "That list is gone." : "Couldn't add it. Try again.") };
  return { todo: toItem(data) };
}

export type TodoPatch = {
  title?: string;
  notes?: string | null;
  listId?: string | null;
  important?: boolean;
  priority?: number;
  myDay?: string | null;
  dueDate?: string | null;
  remindAt?: string | null;
  repeat?: Repeat | null;
  categories?: string[];
};

export async function saveTodo(id: string, patch: TodoPatch): Promise<R> {
  if (!UUID_RX.test(id)) return { error: "That to-do is gone." };
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = cleanTitle(patch.title);
    if (!t) return { error: "A to-do needs a title." };
    row.title = t;
  }
  if (patch.notes !== undefined) row.notes = cleanNotes(patch.notes);
  if (patch.listId !== undefined) row.list_id = patch.listId && UUID_RX.test(patch.listId) ? patch.listId : null;
  if (patch.important !== undefined) row.important = !!patch.important;
  if (patch.priority !== undefined) row.priority = Math.max(0, Math.min(3, Math.floor(Number(patch.priority)) || 0));
  if (patch.myDay !== undefined) row.my_day = isDay(patch.myDay) ? patch.myDay : null;
  if (patch.dueDate !== undefined) row.due_date = isDay(patch.dueDate) ? patch.dueDate : null;
  if (patch.remindAt !== undefined) row.remind_at = cleanMoment(patch.remindAt);
  if (patch.repeat !== undefined) row.repeat = cleanRepeat(patch.repeat);
  if (patch.categories !== undefined) row.categories = cleanCategories(patch.categories);
  if (!Object.keys(row).length) return {};
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { error } = await s.supabase.from("todos").update(row).eq("id", id);
  if (error) return { error: error.code === "42501" ? "That list is gone." : "Couldn't save it. Try again." };
  return {};
}

/**
 * Ticked off, or opened again. A repeating one ticked off brings the next one (`next`: its due day and reminder, worked
 * out in the person's own time by the page): the same title, note, list, star, priority, categories and steps (not
 * done), in its place. Only the first tick does (a second press can't make two).
 */
export async function setTodoDone(id: string, done: boolean, next?: { dueDate: string; remindAt: string | null } | null): Promise<R<{ next?: TodoItem }>> {
  if (!UUID_RX.test(id)) return { error: "That to-do is gone." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  if (!done) {
    const { error } = await s.supabase.from("todos").update({ done_at: null }).eq("id", id);
    return error ? { error: "Couldn't save it. Try again." } : {};
  }
  const { data: ticked, error } = await s.supabase.from("todos").update({ done_at: new Date().toISOString() }).eq("id", id).is("done_at", null).select(COLS);
  if (error) return { error: "Couldn't save it. Try again." };
  const row = ticked?.[0];
  if (!row || !row.repeat || !next || !isDay(next.dueDate)) return {};
  const { data: copy, error: copyError } = await s.supabase
    .from("todos")
    .insert({
      title: row.title,
      notes: row.notes,
      list_id: row.list_id,
      important: row.important,
      priority: row.priority,
      repeat: row.repeat,
      categories: row.categories,
      position: row.position,
      due_date: next.dueDate,
      remind_at: cleanMoment(next.remindAt),
    })
    .select(COLS)
    .single();
  if (copyError || !copy) return { error: limitWords(copyError?.message) ?? "Ticked off, but the next one couldn't be made." };
  const { data: steps } = await s.supabase.from("todo_steps").select("title, position").eq("todo_id", id).order("position");
  let copied: TodoItem["steps"] = [];
  if (steps?.length) {
    const { data: made } = await s.supabase
      .from("todo_steps")
      .insert(steps.map((st) => ({ todo_id: copy.id, title: st.title, position: st.position })))
      .select("id, todo_id, title, done_at, position");
    copied = (made ?? []).map(toStep).sort((a, b) => a.position - b.position);
  }
  return { next: toItem(copy, copied) };
}

export async function deleteTodo(id: string): Promise<R> {
  if (!UUID_RX.test(id)) return { error: "That to-do is gone." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { error } = await s.supabase.from("todos").delete().eq("id", id);
  return error ? { error: "Couldn't delete it." } : {};
}

/** Drag to reorder: positions follow the order given (the rest keep theirs). */
export async function reorderTodos(ids: string[], start = 0): Promise<R> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const clean = ids.filter((x) => UUID_RX.test(x)).slice(0, 500);
  const base = Number.isFinite(start) ? start : 0;
  const results = await Promise.all(clean.map((id, i) => s.supabase.from("todos").update({ position: base + i }).eq("id", id)));
  return results.some((r) => r.error) ? { error: "Couldn't save the order." } : {};
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export async function addTodoStep(todoId: string, title: string, position: number): Promise<R<{ id: string }>> {
  if (!UUID_RX.test(todoId)) return { error: "That to-do is gone." };
  const t = cleanTitle(title);
  if (!t) return { error: "Write the step first." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { data, error } = await s.supabase
    .from("todo_steps")
    .insert({ todo_id: todoId, title: t, position: Number.isFinite(position) ? position : 0 })
    .select("id")
    .single();
  if (error || !data) return { error: limitWords(error?.message) ?? "Couldn't add the step." };
  return { id: data.id as string };
}

export async function saveTodoStep(id: string, patch: { title?: string; done?: boolean }): Promise<R> {
  if (!UUID_RX.test(id)) return { error: "That step is gone." };
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = cleanTitle(patch.title);
    if (!t) return { error: "A step needs words." };
    row.title = t;
  }
  if (patch.done !== undefined) row.done_at = patch.done ? new Date().toISOString() : null;
  if (!Object.keys(row).length) return {};
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { error } = await s.supabase.from("todo_steps").update(row).eq("id", id);
  return error ? { error: "Couldn't save the step." } : {};
}

export async function deleteTodoStep(id: string): Promise<R> {
  if (!UUID_RX.test(id)) return { error: "That step is gone." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { error } = await s.supabase.from("todo_steps").delete().eq("id", id);
  return error ? { error: "Couldn't delete the step." } : {};
}

// ---------------------------------------------------------------------------
// Team tasks in My Day, settings, and the quick panel's copy
// ---------------------------------------------------------------------------

/** A team task of yours in My Day for `day`, or out of it (null). */
export async function pinTeamTask(taskId: string, day: string | null): Promise<R> {
  if (!UUID_RX.test(taskId)) return { error: "That task is gone." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  if (!day) {
    const { error } = await s.supabase.from("todo_day_tasks").delete().eq("task_id", taskId);
    return error ? { error: "Couldn't save it. Try again." } : {};
  }
  if (!isDay(day)) return { error: "That day isn't right." };
  const { error } = await s.supabase.from("todo_day_tasks").upsert({ user_id: s.user.id, task_id: taskId, day }, { onConflict: "user_id,task_id" });
  return error ? { error: "Couldn't add it to My Day." } : {};
}

export async function saveTodoPrefs(prefs: TodoPrefs): Promise<R> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { error } = await s.supabase.from("profiles").update({ todo_prefs: cleanPrefs(prefs) }).eq("id", s.user.id);
  return error ? { error: "Couldn't save your settings." } : {};
}

/** Everything, read now (the quick panel in the top bar opens with it). */
export async function readTodoBoard(): Promise<R<{ board: TodoBoard }>> {
  const s = await session();
  if (!s) return SIGNED_OUT;
  return { board: await loadTodoBoard({ done: 60, client: s.supabase }) };
}
