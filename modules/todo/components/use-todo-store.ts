"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirmSafe } from "@/components/ui/confirm-provider";
import { sounds } from "@/lib/sounds";
import * as A from "../actions";
import {
  cleanTitle,
  dayWord,
  DEFAULT_SORT,
  isSmart,
  LIST_COLORS,
  localDay,
  nextOccurrence,
  type ListColor,
  type Sort,
  type TodoBoard,
  type TodoItem,
  type TodoList,
  type TodoPrefs,
  type TodoStep,
  type ViewId,
} from "../lib/model";
import { GONE_MS } from "../lib/motion";

/** Today in the person's own time, moving on at midnight (and when the tab comes back after a night away). */
export function useToday() {
  const [today, setToday] = useState(() => localDay());
  useEffect(() => {
    const tick = () => setToday(localDay());
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const t = window.setTimeout(tick, next.getTime() - now.getTime());
    const onShow = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [today]);
  return today;
}

const NEEDS_UPDATE = "To Do needs a database update first (App setup lists it).";
type Res = { error?: string };

/** How long Undo can bring a deleted one back: a little longer than its toast stays (6.5 s with Undo). */
const UNDO_MS = 7000;
const short = (s: string) => (s.length > 60 ? `${s.slice(0, 59)}…` : s);

/**
 * The page's (and the quick panel's) copy of your To Do, changed at once on screen and saved behind it. A new to-do,
 * step or list has a stand-in id until the server answers; anything done to it meanwhile waits for the real one.
 * Ids that change are announced (`onRenamed`), so a selection or an address can follow.
 */
export function useTodoStore(initial: TodoBoard) {
  const toast = useToast();
  const confirm = useConfirmSafe();
  const today = useToday();
  const [lists, setLists] = useState<TodoList[]>(initial.lists);
  const [todos, setTodos] = useState<TodoItem[]>(initial.todos);
  const [pins, setPins] = useState(initial.pins);
  const [prefs, setPrefsState] = useState<TodoPrefs>(initial.prefs);
  const ready = initial.ready;

  const todosRef = useRef(todos);
  todosRef.current = todos;
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  /**
   * Deleted, Undo still possible (1.53.3): out of the lists after their puff (`leaving`), deleted for good when Undo's
   * time is up, or at once when you leave (the page closes, To Do goes). `returning`: brought back by Undo, sliding in.
   */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const [returning, setReturning] = useState<ReadonlySet<string>>(() => new Set());
  const doomed = useRef(new Map<string, { t: TodoItem; out: ReturnType<typeof setTimeout>; commit: ReturnType<typeof setTimeout> }>());
  const pending = useRef(new Map<string, Promise<string | null>>());
  /** A real id → the stand-in it replaced (rows keep their key, so nothing slides in twice). */
  const aliases = useRef(new Map<string, string>());
  const renamedFns = useRef(new Set<(from: string, to: string) => void>());
  const n = useRef(0);
  const tmp = (kind: string) => `tmp-${kind}-${++n.current}`;
  const real = useCallback(async (id: string | null) => (id && id.startsWith("tmp-") ? ((await pending.current.get(id)) ?? null) : id), []);
  const renamed = (from: string, to: string) => {
    aliases.current.set(to, aliases.current.get(from) ?? from);
    renamedFns.current.forEach((f) => f(from, to));
  };
  const fail = (r: Res) => {
    if (r.error) toast.error(r.error);
    return !!r.error;
  };

  const local = useCallback((id: string, p: Partial<TodoItem>) => setTodos((all) => all.map((t) => (t.id === id ? { ...t, ...p } : t))), []);
  const localStep = useCallback(
    (todoId: string, stepId: string, p: Partial<TodoStep> | null) =>
      setTodos((all) =>
        all.map((t) => (t.id === todoId ? { ...t, steps: p ? t.steps.map((s) => (s.id === stepId ? { ...s, ...p } : s)) : t.steps.filter((s) => s.id !== stepId) } : t))
      ),
    []
  );

  // ---- to-dos -----------------------------------------------------------------------------------------------------

  async function add(input: Omit<A.NewTodo, "onTop">): Promise<string | null> {
    const title = cleanTitle(input.title);
    if (!title) return null;
    if (!ready) {
      toast.error(NEEDS_UPDATE);
      return null;
    }
    const id = tmp("todo");
    const all = todosRef.current;
    const onTop = prefsRef.current.addOnTop;
    const position = onTop ? Math.min(0, ...all.map((t) => t.position)) - 1 : Math.max(0, ...all.map((t) => t.position)) + 1;
    const item: TodoItem = {
      id,
      title,
      notes: null,
      listId: input.listId ?? null,
      important: !!input.important,
      priority: input.priority ?? 0,
      myDay: input.myDay ?? null,
      dueDate: input.dueDate ?? null,
      remindAt: input.remindAt ?? null,
      repeat: input.repeat ?? null,
      categories: [],
      position,
      doneAt: null,
      createdAt: new Date().toISOString(),
      steps: [],
    };
    setTodos((a) => [item, ...a]);
    sounds.pop();
    const p = (async () => {
      const listId = await real(input.listId ?? null);
      const r = await A.createTodo({ ...input, title, listId, onTop });
      if (r.error !== undefined) {
        toast.error(r.error);
        setTodos((a) => a.filter((t) => t.id !== id));
        return null;
      }
      setTodos((a) => a.map((t) => (t.id === id ? { ...t, id: r.todo.id, position: r.todo.position, createdAt: r.todo.createdAt } : t)));
      renamed(id, r.todo.id);
      return r.todo.id;
    })();
    pending.current.set(id, p);
    return id;
  }

  /** Changes to one to-do: on screen at once, then saved (put back if saving fails). */
  async function patch(id: string, p: A.TodoPatch) {
    const before = todosRef.current.find((t) => t.id === id);
    if (!before) return;
    local(id, p as Partial<TodoItem>);
    const rid = await real(id);
    if (!rid) return;
    const listId = p.listId !== undefined ? await real(p.listId) : undefined;
    const r = await A.saveTodo(rid, listId !== undefined ? { ...p, listId } : p);
    if (fail(r)) {
      const back: Partial<TodoItem> = {};
      for (const k of Object.keys(p) as (keyof A.TodoPatch)[]) (back as Record<string, unknown>)[k] = before[k as keyof TodoItem];
      local(rid, back);
    }
  }

  /**
   * Ticks a to-do off or opens it again, at once (1.53.3: no question first; the owner: "when you check something, i
   * dont want the confirmation"). A repeating one brings its next one at once. Returns whether it changed.
   */
  async function toggleDone(id: string): Promise<boolean> {
    const t = todosRef.current.find((x) => x.id === id);
    if (!t || doomed.current.has(id)) return false;
    const done = !t.doneAt;
    local(id, { doneAt: done ? new Date().toISOString() : null });
    if (done) sounds.check();
    else sounds.uncheck();
    void (async () => {
      const rid = await real(id);
      if (!rid) return;
      const r = await A.setTodoDone(rid, done, done ? nextOccurrence(t, today) : null);
      if (r.error !== undefined) {
        toast.error(r.error);
        local(rid, { doneAt: t.doneAt });
        return;
      }
      if (r.next) {
        const next = r.next;
        setTodos((a) => [next, ...a]);
        if (next.dueDate) toast.success(`It repeats: the next one is due ${dayWord(next.dueDate, today).replace(/^(Today|Tomorrow)$/, (w) => w.toLowerCase())}.`, { sound: false });
      }
    })();
    return true;
  }

  const inSet = (set: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>, id: string, on: boolean) =>
    set((a) => {
      if (a.has(id) === on) return a;
      const n = new Set(a);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  /**
   * Deletes a to-do (1.53.3: no question first; the owner, of ticking off: "i dont want the confirmation, and i want a
   * cool outing animation, and whne you delete something, i want the same thing"). It puffs away in every list it's in,
   * and the toast's Undo brings it back: it's deleted for good only when Undo's time is up (or when you leave).
   */
  async function remove(id: string): Promise<boolean> {
    const t = todosRef.current.find((x) => x.id === id);
    if (!t || doomed.current.has(id)) return false;
    sounds.remove();
    inSet(setLeaving, id, true);
    const out = setTimeout(() => {
      setTodos((a) => a.filter((x) => x.id !== id));
      inSet(setLeaving, id, false);
    }, GONE_MS);
    const commit = setTimeout(() => void deleteNow(id), UNDO_MS);
    doomed.current.set(id, { t, out, commit });
    toast.success(`Deleted “${short(t.title)}”.`, { sound: false, action: { label: "Undo", onClick: () => undoRemove(id) } });
    return true;
  }

  /** Undo: back where it was, sliding in. Too late once it's deleted for good (the toast has gone by then). */
  function undoRemove(id: string) {
    const d = doomed.current.get(id);
    if (!d) return;
    clearTimeout(d.out);
    clearTimeout(d.commit);
    doomed.current.delete(id);
    inSet(setLeaving, id, false);
    setTodos((a) => (a.some((x) => x.id === id) ? a : [d.t, ...a]));
    inSet(setReturning, id, true);
    setTimeout(() => inSet(setReturning, id, false), 450);
    sounds.pop();
  }

  async function deleteNow(id: string) {
    const d = doomed.current.get(id);
    if (!d) return;
    clearTimeout(d.commit);
    doomed.current.delete(id);
    const rid = await real(id);
    if (!rid) return;
    if (fail(await A.deleteTodo(rid))) setTodos((a) => (a.some((x) => x.id === d.t.id) ? a : [d.t, ...a]));
  }

  // Leaving (the tab closes, or To Do or the quick panel goes): what's waiting for Undo is deleted now.
  const deleteNowRef = useRef(deleteNow);
  deleteNowRef.current = deleteNow;
  useEffect(() => {
    const flush = () => [...doomed.current.keys()].forEach((id) => void deleteNowRef.current(id));
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  /** Your order after a drag: these to-dos take the positions they had among themselves, in the new order. */
  async function reorder(ids: string[]) {
    const items = ids.map((id) => todosRef.current.find((t) => t.id === id)).filter((t): t is TodoItem => !!t);
    const start = Math.min(...items.map((t) => t.position));
    const pos = new Map(ids.map((id, i) => [id, start + i]));
    setTodos((a) => a.map((t) => (pos.has(t.id) ? { ...t, position: pos.get(t.id)! } : t)));
    const realIds = (await Promise.all(ids.map((id) => real(id)))).filter((x): x is string => !!x);
    fail(await A.reorderTodos(realIds, start));
  }

  // ---- steps ------------------------------------------------------------------------------------------------------

  async function addStep(todoId: string, title: string) {
    const t = todosRef.current.find((x) => x.id === todoId);
    const text = cleanTitle(title);
    if (!t || !text) return;
    const id = tmp("step");
    const position = Math.max(0, ...t.steps.map((s) => s.position)) + 1;
    setTodos((all) => all.map((x) => (x.id === todoId ? { ...x, steps: [...x.steps, { id, todoId, title: text, doneAt: null, position }] } : x)));
    sounds.pop();
    const p = (async () => {
      const rid = await real(todoId);
      if (!rid) return null;
      const r = await A.addTodoStep(rid, text, position);
      if (r.error !== undefined) {
        toast.error(r.error);
        localStep(rid, id, null);
        return null;
      }
      localStep(rid, id, { id: r.id, todoId: rid });
      return r.id;
    })();
    pending.current.set(id, p);
  }

  async function patchStep(todoId: string, stepId: string, p: { title?: string; done?: boolean }) {
    const t = todosRef.current.find((x) => x.id === todoId);
    const before = t?.steps.find((s) => s.id === stepId);
    if (!t || !before) return;
    const change: Partial<TodoStep> = {};
    if (p.title !== undefined) change.title = cleanTitle(p.title) || before.title;
    if (p.done !== undefined) change.doneAt = p.done ? new Date().toISOString() : null;
    localStep(todoId, stepId, change);
    if (p.done) sounds.check();
    else if (p.done === false) sounds.uncheck();
    const rid = await real(stepId);
    if (!rid) return;
    if (fail(await A.saveTodoStep(rid, p))) localStep((await real(todoId)) ?? todoId, rid, before);
  }

  async function removeStep(todoId: string, stepId: string) {
    localStep(todoId, stepId, null);
    const rid = await real(stepId);
    if (rid) fail(await A.deleteTodoStep(rid));
  }

  /** A step becomes a to-do of its own, in the same list. */
  async function promoteStep(todoId: string, stepId: string) {
    const t = todosRef.current.find((x) => x.id === todoId);
    const s = t?.steps.find((x) => x.id === stepId);
    if (!t || !s) return;
    const id = await add({ title: s.title, listId: t.listId });
    if (id) void removeStep(todoId, stepId);
  }

  // ---- lists ------------------------------------------------------------------------------------------------------

  async function addList(name = "Untitled list"): Promise<string> {
    const id = tmp("list");
    const used = new Set(listsRef.current.map((l) => l.color));
    const color: ListColor = LIST_COLORS.find((c) => !used.has(c) && c !== "slate") ?? LIST_COLORS[listsRef.current.length % LIST_COLORS.length];
    const position = Math.max(0, ...listsRef.current.map((l) => l.position)) + 1;
    setLists((a) => [...a, { id, name, emoji: null, color, position, sort: DEFAULT_SORT, hideDone: false }]);
    if (!ready) {
      toast.error(NEEDS_UPDATE);
      setLists((a) => a.filter((l) => l.id !== id));
      return id;
    }
    const p = (async () => {
      const r = await A.createTodoList({ name, color });
      if (r.error !== undefined) {
        toast.error(r.error);
        setLists((a) => a.filter((l) => l.id !== id));
        return null;
      }
      setLists((a) => a.map((l) => (l.id === id ? { ...l, id: r.id, position: r.position } : l)));
      setTodos((a) => a.map((t) => (t.listId === id ? { ...t, listId: r.id } : t)));
      renamed(id, r.id);
      return r.id;
    })();
    pending.current.set(id, p);
    return id;
  }

  async function patchList(id: string, p: { name?: string; emoji?: string | null; color?: ListColor; sort?: Sort; hideDone?: boolean }) {
    const before = listsRef.current.find((l) => l.id === id);
    if (!before) return;
    setLists((a) => a.map((l) => (l.id === id ? { ...l, ...p } : l)));
    const rid = await real(id);
    if (!rid) return;
    const r = await A.updateTodoList(rid, { name: p.name, emoji: p.emoji, color: p.color, sortBy: p.sort?.by, sortDir: p.sort?.dir, hideDone: p.hideDone });
    if (fail(r)) setLists((a) => a.map((l) => (l.id === rid ? before : l)));
  }

  async function removeList(id: string): Promise<boolean> {
    const l = listsRef.current.find((x) => x.id === id);
    if (!l) return false;
    const count = todosRef.current.filter((t) => t.listId === id).length;
    const ok = await confirm({
      title: `Delete “${l.name}”?`,
      description: count ? `The list and its ${count} to-do${count === 1 ? "" : "s"} are deleted for good.` : "The list is deleted for good.",
      confirmLabel: "Delete list",
      danger: true,
    });
    if (!ok) return false;
    const gone = todosRef.current.filter((t) => t.listId === id);
    setLists((a) => a.filter((x) => x.id !== id));
    setTodos((a) => a.filter((t) => t.listId !== id));
    sounds.remove();
    const rid = await real(id);
    if (rid && fail(await A.deleteTodoList(rid))) {
      setLists((a) => [...a, l].sort((x, y) => x.position - y.position));
      setTodos((a) => [...a, ...gone]);
    }
    return true;
  }

  async function reorderLists(ids: string[]) {
    const pos = new Map(ids.map((id, i) => [id, i + 1]));
    setLists((a) => [...a].map((l) => (pos.has(l.id) ? { ...l, position: pos.get(l.id)! } : l)).sort((x, y) => x.position - y.position));
    const realIds = (await Promise.all(ids.map((id) => real(id)))).filter((x): x is string => !!x);
    fail(await A.reorderTodoLists(realIds));
  }

  // ---- My Day's team tasks, settings ------------------------------------------------------------------------------

  async function pin(taskId: string, on: boolean) {
    setPins((a) => [...a.filter((p) => p.taskId !== taskId), ...(on ? [{ taskId, day: today }] : [])]);
    if (on) sounds.pop();
    if (fail(await A.pinTeamTask(taskId, on ? today : null))) setPins((a) => a.filter((p) => p.taskId !== taskId || !on));
  }

  async function setPrefs(p: Partial<TodoPrefs>) {
    const next = { ...prefsRef.current, ...p };
    setPrefsState(next);
    fail(await A.saveTodoPrefs(next));
  }

  const sortOf = useCallback(
    (view: ViewId): Sort => (isSmart(view) ? (prefs.sorts[view] ?? DEFAULT_SORT) : (lists.find((l) => l.id === view)?.sort ?? DEFAULT_SORT)),
    [prefs, lists]
  );
  const hideDoneOf = useCallback((view: ViewId) => (isSmart(view) ? !!prefs.hideDone[view] : !!lists.find((l) => l.id === view)?.hideDone), [prefs, lists]);
  function setSort(view: ViewId, sort: Sort) {
    if (isSmart(view)) void setPrefs({ sorts: { ...prefsRef.current.sorts, [view]: sort } });
    else void patchList(view, { sort });
  }
  function setHideDone(view: ViewId, hide: boolean) {
    if (isSmart(view)) void setPrefs({ hideDone: { ...prefsRef.current.hideDone, [view]: hide } });
    else void patchList(view, { hideDone: hide });
  }

  const onRenamed = useCallback((f: (from: string, to: string) => void) => {
    renamedFns.current.add(f);
    return () => void renamedFns.current.delete(f);
  }, []);
  const keyOf = useCallback((id: string) => aliases.current.get(id) ?? id, []);

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);

  return {
    ready,
    today,
    lists,
    listById,
    todos,
    pins,
    prefs,
    add,
    patch,
    toggleDone,
    remove,
    leaving,
    returning,
    reorder,
    addStep,
    patchStep,
    removeStep,
    promoteStep,
    addList,
    patchList,
    removeList,
    reorderLists,
    pin,
    setPrefs,
    sortOf,
    hideDoneOf,
    setSort,
    setHideDone,
    onRenamed,
    keyOf,
  };
}

export type TodoStore = ReturnType<typeof useTodoStore>;
