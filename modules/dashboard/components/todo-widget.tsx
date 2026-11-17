"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DatePicker } from "@/components/ui/date-picker";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { CLEAR_DATE_CONFIRM, useConfirmSafe } from "@/components/ui/confirm-provider";
import { BellIcon, CalendarIcon, CheckIcon, ChevronDownIcon, ExternalIcon, FlagIcon, GripIcon, HomeIcon, ListBulletIcon, PlusIcon, StarIcon, SunIcon } from "@/components/ui/icons";
import { RepeatIcon } from "@/modules/todo/components/todo-icons";
import { useToast } from "@/components/ui/toast-provider";
import { sounds } from "@/lib/sounds";
import { Mascot } from "@/components/ui/mascot";
import { createTodo, deleteTodo, reorderTodos, saveTodo, setTodoDone, type TodoPatch } from "@/modules/todo/actions";
import { belongs, dayWord, isSmart, listColor, nextOccurrence, reminderWord, todoHref, type TodoBoard, type TodoItem, type ViewId } from "@/modules/todo/lib/model";
import { GONE_MS, HOLD_MS, OUT_MS, ZIP_MS } from "@/modules/todo/lib/motion";
import { DueChip, localDay } from "./tasks-widget";
import { useBox } from "./widget-box";

const PRIORITY = [
  { v: 0, label: "None", color: "transparent" },
  { v: 1, label: "Low", color: "rgb(59 130 246)" },
  { v: 2, label: "Medium", color: "rgb(234 179 8)" },
  { v: 3, label: "High", color: "rgb(239 68 68)" },
];

type Filter = "all" | "active" | "done";
const FILTER_KEY = "vp-todo-filter";
// A just-checked one's moment and its way out (1.53.3): HOLD_MS, OUT_MS, GONE_MS, the same as To Do's.

/** What the widget shows (1.53.0): every list ("all", as before), a smart list of To Do's, or one of your lists. */
type Shows = "all" | ViewId;
const SMART_NAMES: Record<string, string> = { all: "Everything", myday: "My Day", important: "Important", planned: "Planned", tasks: "Tasks" };
const showsName = (s: Shows, board: TodoBoard) => SMART_NAMES[s] ?? board.lists.find((l) => l.id === s)?.name ?? "Everything";

/**
 * Your own to-do list. Checking one off: a pop, a chime, a green shine and
 * its line struck, then it zips away (1.53.3, no question first) and, in All,
 * lands with the finished ones. A deleted one puffs away.
 *
 * 1.53.0 (To Do): it shows Everything, My Day, Important, Planned, Tasks or one of your lists (the menu at the top
 * left, kept with the widget); a star marks the important ones; a new one goes where you're looking (My Day, the
 * list…); a repeating one brings its next one; the details open the whole to-do in To Do.
 */
export function TodoWidget({ board, settings, onSettings }: { board: TodoBoard; settings?: Record<string, unknown>; onSettings?: (s: Record<string, unknown>) => void }) {
  const toast = useToast();
  const [todos, setTodos] = useState(board.todos);
  const [filter, setFilterState] = useState<Filter>("all");
  const savedShows = typeof settings?.list === "string" ? (settings.list as Shows) : "all";
  const [shows, setShows] = useState<Shows>(savedShows);
  useEffect(() => setShows(savedShows), [savedShows]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(0);
  const [due, setDue] = useState<string | null>(null);
  /**
   * Just checked/unchecked: stays put (hold), then zips away (out: its place closes; zip, 1.53.3: in All, its place kept
   * while it goes, then it lands with the finished ones, `landing`).
   */
  const [settling, setSettling] = useState<Map<string, "hold" | "out" | "zip">>(new Map());
  const [landing, setLanding] = useState<Set<string>>(new Set());
  const [popped, setPopped] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const today = localDay();
  // Same id on the server and in the browser (dnd-kit's own counter differs).
  const dndId = useId();
  const box = useBox();
  const narrow = box.w < 220;
  const lists = useMemo(() => new Map(board.lists.map((l) => [l.id, l])), [board.lists]);
  // A list that's gone: Everything.
  const view: Shows = shows === "all" || isSmart(shows) || lists.has(shows) ? shows : "all";

  useEffect(() => {
    try {
      const f = localStorage.getItem(FILTER_KEY);
      if (f === "all" || f === "active" || f === "done") setFilterState(f);
    } catch {}
    const all = timers.current;
    return () => all.forEach((ts) => ts.forEach(clearTimeout));
  }, []);
  const setFilter = (f: Filter) => {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {}
  };
  const pickShows = (s: Shows) => {
    setShows(s);
    onSettings?.({ list: s });
  };

  const later = (id: string, ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    timers.current.set(id, [...(timers.current.get(id) ?? []), t]);
  };
  const clearLater = (id: string) => {
    timers.current.get(id)?.forEach(clearTimeout);
    timers.current.delete(id);
  };
  const setIn = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, v: T, on: boolean) =>
    set((s) => {
      const n = new Set(s);
      if (on) n.add(v);
      else n.delete(v);
      return n;
    });
  const settle = (id: string, phase: "hold" | "out" | "zip" | null) =>
    setSettling((s) => {
      const n = new Map(s);
      if (phase) n.set(id, phase);
      else n.delete(id);
      return n;
    });

  const patch = (id: string, p: Partial<TodoItem>) => setTodos((all) => all.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const fail = (r: { error?: string }) => r.error && toast.error(r.error);
  const save = (t: TodoItem, p: TodoPatch) => {
    patch(t.id, p as Partial<TodoItem>);
    if (!t.id.startsWith("tmp-")) void saveTodo(t.id, p).then(fail);
  };

  async function toggle(t: TodoItem) {
    if (t.id.startsWith("tmp-")) return;
    const doneAt = t.doneAt ? null : new Date().toISOString();
    clearLater(t.id);
    patch(t.id, { doneAt });
    void setTodoDone(t.id, !!doneAt, doneAt ? nextOccurrence(t, today) : null).then((r) => {
      if (r.error !== undefined) {
        fail(r);
        return patch(t.id, { doneAt: t.doneAt });
      }
      // A repeating one: its next one, in its place.
      if (r.next) setTodos((all) => [r.next!, ...all]);
    });
    if (doneAt) {
      sounds.check();
      // The last open one: a little fanfare.
      if (shown.filter((x) => !x.doneAt).length === 1) setTimeout(() => sounds.celebrate(), 420);
      setIn(setPopped, t.id, true);
      later(t.id, 700, () => setIn(setPopped, t.id, false));
    } else sounds.uncheck();
    // Stay in place for a moment. Ticked off, it zips away (1.53.3) and, in All, lands with the finished ones; opened
    // again, it moves back up among the open ones (All) or goes (Done).
    settle(t.id, "hold");
    later(t.id, doneAt ? HOLD_MS : 250, () => {
      const all = filterRef.current === "all";
      if (all && !doneAt) return settle(t.id, null);
      // In All its place stays while it zips (nothing jumps in a scrolled list); elsewhere its place closes after it.
      settle(t.id, all ? "zip" : "out");
      later(t.id, all ? ZIP_MS : OUT_MS, () => {
        if (all) {
          // Where everything is right now, so the others slide up from there; it lands where it goes (no slide of its own).
          list.current?.querySelectorAll<HTMLElement>("[data-todo]").forEach((el) => tops.current.set(el.dataset.todo!, el.offsetTop));
          tops.current.delete(t.id);
          setIn(setLanding, t.id, true);
          later(t.id, 600, () => setIn(setLanding, t.id, false));
        }
        settle(t.id, null);
      });
    });
  }

  async function add() {
    const text = title.trim();
    if (!text) return;
    if (!board.ready) return toast.error("To Do needs a database update first (App setup lists it).");
    // Where you're looking: My Day, Important, Planned (due today), or the list.
    const where = {
      listId: view !== "all" && !isSmart(view) ? view : null,
      myDay: view === "myday" ? today : null,
      important: view === "important",
      dueDate: due ?? (view === "planned" ? today : null),
    };
    const temp: TodoItem = {
      id: `tmp-${Date.now()}`,
      title: text,
      notes: null,
      ...where,
      priority,
      remindAt: null,
      repeat: null,
      categories: [],
      position: Math.min(0, ...todos.map((x) => x.position)) - 1,
      doneAt: null,
      createdAt: new Date().toISOString(),
      steps: [],
    };
    setTodos((all) => [temp, ...all]);
    setIn(setFresh, temp.id, true);
    setTitle("");
    setDue(null);
    setPriority(0);
    sounds.pop();
    if (filter === "done") setFilter("all");
    const r = await createTodo({ title: text, ...where, priority: temp.priority, onTop: true });
    if (r.error !== undefined) {
      toast.error(r.error);
      setTodos((all) => all.filter((x) => x.id !== temp.id));
    } else {
      // The real id replaces the temporary one (no second slide-in).
      setTodos((all) => all.map((x) => (x.id === temp.id ? { ...r.todo, priority: x.priority } : x)));
      setIn(setFresh, temp.id, false);
    }
  }

  function remove(t: TodoItem) {
    sounds.remove();
    setIn(setLeaving, t.id, true);
    later(t.id, GONE_MS, () => {
      setTodos((all) => all.filter((x) => x.id !== t.id));
      setIn(setLeaving, t.id, false);
    });
    if (!t.id.startsWith("tmp-")) void deleteTodo(t.id).then(fail);
  }

  // The list it shows (1.53.0), then the filter: open ones by your order, then finished ones (latest first).
  const inView = useMemo(() => (view === "all" ? todos : todos.filter((t) => belongs(t, view, today, board.prefs) || (view === "myday" && !!t.doneAt && t.myDay === today))), [todos, view, today, board.prefs]);
  const shown = useMemo(() => {
    const isDone = (t: TodoItem) => !!t.doneAt && !settling.has(t.id);
    const byPos = (a: TodoItem, b: TodoItem) => a.position - b.position;
    const open = inView.filter((t) => !isDone(t)).sort(byPos);
    const finished = inView.filter(isDone).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
    if (filter === "active") return inView.filter((t) => !t.doneAt || settling.has(t.id)).sort(byPos);
    if (filter === "done") return inView.filter((t) => !!t.doneAt || settling.has(t.id)).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
    return [...open, ...finished];
  }, [inView, filter, settling]);

  // Smooth moves when the order changes (a finished item sliding down).
  const list = useRef<HTMLUListElement>(null);
  const tops = useRef(new Map<string, number>());
  const orderKey = shown.map((t) => t.id).join(",");
  useLayoutEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const next = new Map<string, number>();
    ul.querySelectorAll<HTMLElement>("[data-todo]").forEach((el) => {
      const id = el.dataset.todo!;
      next.set(id, el.offsetTop);
      const before = tops.current.get(id);
      if (before !== undefined && before !== el.offsetTop && typeof el.animate === "function") {
        el.animate([{ transform: `translateY(${before - el.offsetTop}px)` }, { transform: "translateY(0)" }], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
    });
    tops.current = next;
  }, [orderKey]);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const order = shown.map((t) => t.id);
    const moved = arrayMove(order, order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
    const pos = new Map(moved.map((id, k) => [id, k]));
    setTodos((all) => all.map((t) => (pos.has(t.id) ? { ...t, position: pos.get(t.id)! } : t)));
    void reorderTodos(moved.filter((id) => !id.startsWith("tmp-"))).then(fail);
  }

  const total = inView.length;
  const doneCount = inView.filter((t) => t.doneAt).length;
  const openCount = total - doneCount;
  const pr = PRIORITY[priority];
  // Outside a list of yours, each row says which list it's in.
  const showList = !narrow && board.lists.length > 0 && (view === "all" || view === "myday" || view === "important" || view === "planned");

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-0.5 rounded-lg border border-line/15 bg-surface-2/30 pr-1 focus-within:border-amber/60 transition-colors flex-shrink-0">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder={view === "myday" ? "Add to My Day…" : view === "all" || isSmart(view) ? "Add a to-do…" : `Add to ${showsName(view, board)}…`}
          maxLength={300}
          aria-label="New to-do"
          className="min-w-0 flex-1 bg-transparent pl-2.5 h-8 text-[13px] outline-none"
        />
        {!narrow && <button
          type="button"
          onClick={() => setPriority((p) => (p + 1) % PRIORITY.length)}
          title={`Priority: ${pr.label} (click to change)`}
          aria-label={`Priority: ${pr.label}`}
          className="w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink flex-shrink-0"
          style={priority ? { color: pr.color } : undefined}
        >
          <FlagIcon filled={priority > 0} className="w-3.5 h-3.5" />
        </button>}
        {!narrow && <DatePicker value={due} onChange={setDue} onClear={() => setDue(null)} ariaLabel="Due date" triggerClassName={`h-6 rounded-md flex items-center justify-center flex-shrink-0 hover:bg-surface-2 ${due ? "px-1.5 text-[11px] font-bold text-ink" : "w-6 text-ink-faint hover:text-ink"}`}>
          {due ? new Date(`${due}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : <CalendarIcon className="w-3.5 h-3.5" />}
        </DatePicker>}
        <button type="button" onClick={() => void add()} disabled={!title.trim()} aria-label="Add to-do" className="w-6 h-6 rounded-md bg-amber text-white flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-35">
          <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex items-center gap-0.5 mt-1.5 flex-shrink-0 min-w-0">
        <ShowsPicker board={board} value={view} onPick={pickShows} narrow={narrow} />
        {(
          [
            ["all", "All", total],
            ["active", "Active", openCount],
            ["done", "Done", doneCount],
          ] as const
        ).map(([f, label, n]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-md px-2 h-6 text-[12px] font-semibold transition-colors flex-shrink-0 ${filter === f ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {label}
            {n > 0 && !narrow && box.w >= 300 && <span className="ml-1 text-[11px] text-ink-faint tabular-nums">{n}</span>}
          </button>
        ))}
        {total > 0 && !narrow && box.w >= 340 && (
          <span className="ml-auto text-[11px] tabular-nums text-ink-faint" title={`${doneCount} of ${total} done`}>
            {doneCount}/{total}
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="h-1 rounded-[2px] bg-line/10 mt-1 mb-1 overflow-hidden flex-shrink-0" aria-hidden>
          <div className="h-full rounded-[3px] bg-green transition-[width] duration-500 ease-out" style={{ width: `${(doneCount / total) * 100}%` }} />
        </div>
      )}

      <div className="flex-1 min-h-0 widget-scroll -mx-1">
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ul ref={list} className="relative">
              {shown.map((t) => (
                <TodoItemRow
                  key={t.id}
                  narrow={narrow}
                  t={t}
                  today={today}
                  view={view}
                  listName={showList ? (t.listId ? (lists.get(t.listId)?.name ?? null) : "Tasks") : null}
                  listColor={t.listId ? listColor(lists.get(t.listId)?.color ?? "blue").fill : null}
                  popped={popped.has(t.id)}
                  entering={fresh.has(t.id)}
                  out={settling.get(t.id) === "out" || settling.get(t.id) === "zip"}
                  keepsPlace={settling.get(t.id) === "zip"}
                  landing={landing.has(t.id)}
                  gone={leaving.has(t.id)}
                  onToggle={() => toggle(t)}
                  onSave={(p) => save(t, p)}
                  onDelete={() => remove(t)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {!shown.length &&
          (filter === "active" && total > 0 ? (
            <div className="py-3 flex flex-col items-center text-center animate-[fadein_.3s_ease]">
              <Mascot mood="celebrate" size={narrow ? 52 : 64} />
              <p className="text-[12.5px] font-semibold mt-1">All done. Nice!</p>
            </div>
          ) : (
            <p className="py-5 text-center text-[12.5px] text-ink-soft animate-[fadein_.3s_ease]">
              {filter === "done" ? "Nothing checked off yet." : view === "myday" ? "Nothing in My Day yet. Add what today needs above." : view === "important" ? "Star a to-do to see it here." : "Nothing here yet. Add your first one above."}
            </p>
          ))}
      </div>
    </div>
  );
}

/** The widget's list menu: Everything, the smart lists, your lists. */
function ShowsPicker({ board, value, onPick, narrow }: { board: TodoBoard; value: Shows; onPick: (s: Shows) => void; narrow: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const icon = (s: Shows, cls = "w-3.5 h-3.5") => {
    if (s === "myday") return <SunIcon className={`${cls} text-amber`} />;
    if (s === "important") return <StarIcon className={`${cls} text-pink`} />;
    if (s === "planned") return <CalendarIcon className={`${cls} text-teal`} />;
    if (s === "tasks") return <HomeIcon className={`${cls} text-blue`} />;
    if (s === "all") return <ListBulletIcon className={`${cls} text-ink-soft`} />;
    const l = board.lists.find((x) => x.id === s);
    return l?.emoji ? <span className="text-[12px] leading-none">{l.emoji}</span> : <span style={{ color: listColor(l?.color ?? "blue").fill }}><ListBulletIcon className={cls} /></span>;
  };
  const pick = (s: Shows) => {
    onPick(s);
    setOpen(false);
  };
  const item = (s: Shows, label: string) => (
    <button key={s} type="button" role="menuitemradio" aria-checked={value === s} onClick={() => pick(s)} className="w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2 text-[13px] hover:bg-surface-2 focus:bg-surface-2 focus:outline-none">
      <span className="w-4 flex items-center justify-center flex-shrink-0">{icon(s, "w-4 h-4")}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {value === s && <CheckIcon className="w-4 h-4 text-amber flex-shrink-0" />}
    </button>
  );
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Shows: ${showsName(value, board)}`}
        aria-label={`Shows: ${showsName(value, board)}`}
        className="inline-flex items-center gap-1 rounded-md pl-1.5 pr-1 h-6 text-[12px] font-semibold text-ink hover:bg-surface-2 min-w-0 max-w-[45%] flex-shrink"
      >
        <span className="flex-shrink-0 flex">{icon(value)}</span>
        {!narrow && <span className="truncate">{showsName(value, board)}</span>}
        <ChevronDownIcon className="w-3 h-3 text-ink-faint flex-shrink-0" />
      </button>
      <span className="w-px h-3.5 bg-line/15 mx-1 flex-shrink-0" aria-hidden />
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={230} align="left" label="Shows">
        <div className="p-1" role="none">
          {item("all", "Everything")}
          {item("myday", "My Day")}
          {item("important", "Important")}
          {item("planned", "Planned")}
          {item("tasks", "Tasks")}
          {board.lists.length > 0 && <div className="my-1 mx-2 h-px bg-line/10" role="separator" />}
          {board.lists.map((l) => item(l.id, l.name))}
          <div className="my-1 mx-2 h-px bg-line/10" role="separator" />
          <Link href={todoHref(value === "all" ? null : value)} onClick={() => setOpen(false)} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-amber hover:bg-amber/10">
            <ExternalIcon className="w-4 h-4 flex-shrink-0" /> Open To Do
          </Link>
        </div>
      </AnchoredMenu>
    </>
  );
}

/** The checkbox: pops, draws its check and throws a few sparks. */
function Check({ done, popped, color, onToggle }: { done: boolean; popped: boolean; color?: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="checkbox"
      data-sound="none"
      aria-checked={done}
      aria-label={done ? "Mark as not done" : "Mark as done"}
      className={`todo-check mt-px w-4 h-4 rounded-[5px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${
        done ? "border-transparent text-white" : "border-line/45 hover:border-[rgb(var(--teal))] hover:bg-[rgb(var(--teal)/0.1)]"
      } ${popped ? "just-checked" : ""}`}
      // Done (1.23.1): the calendar's posted tick, filled in the green of a finished step.
      style={done ? { background: "rgb(var(--teal))" } : color ? { borderColor: color } : undefined}
    >
      <span className="burst" aria-hidden />
      {popped &&
        Array.from({ length: 6 }, (_, k) => <span key={k} className="spark" aria-hidden style={{ ["--a" as string]: `${k * 60 + 30}deg`, ["--d" as string]: `${(k % 2) * 40}ms` }} />)}
      <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 8.5 6.8 11.6 12.5 4.6" />
      </svg>
    </button>
  );
}

function TodoItemRow({
  narrow,
  t,
  today,
  view,
  listName,
  listColor: dot,
  popped,
  entering,
  out,
  keepsPlace,
  landing,
  gone,
  onToggle,
  onSave,
  onDelete,
}: {
  narrow: boolean;
  t: TodoItem;
  today: string;
  view: Shows;
  listName: string | null;
  listColor: string | null;
  popped: boolean;
  entering: boolean;
  out: boolean;
  keepsPlace: boolean;
  landing: boolean;
  gone: boolean;
  onToggle: () => void;
  onSave: (p: TodoPatch) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: !!t.doneAt });
  const confirmClear = useConfirmSafe();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const pr = PRIORITY[t.priority] ?? PRIORITY[0];
  const done = !!t.doneAt;
  const inDay = t.myDay === today;
  const steps = t.steps.length ? `${t.steps.filter((s) => s.doneAt).length}/${t.steps.length}` : null;
  const extras = !open && ((t.dueDate && !done) || t.notes || listName || (inDay && view !== "myday" && !done) || steps || (t.remindAt && !done) || t.repeat);
  return (
    <li
      ref={setNodeRef}
      data-todo={t.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`todo-fold ${entering ? "is-in" : ""} ${out ? "is-out" : ""} ${keepsPlace ? "keeps-place" : ""} ${landing ? "is-landing" : ""} ${gone ? "is-gone" : ""} ${isDragging ? "relative z-10" : ""}`}
    >
      <div>
        <div
          data-done={done}
          className={`todo-row group relative rounded-md border transition-colors ${popped ? "just-checked" : ""} ${isDragging ? "border-amber/50 bg-surface shadow-xl" : "border-transparent hover:bg-surface-2/50"}`}
        >
          <div className="flex items-start gap-1.5 px-1 py-1">
            <button
              type="button"
              {...attributes}
              {...listeners}
              disabled={done}
              aria-label="Drag to reorder"
              className={`mt-px w-3.5 h-[18px] items-center justify-center flex-shrink-0 text-ink-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-grab active:cursor-grabbing touch-none disabled:invisible ${narrow ? "hidden" : "flex"}`}
            >
              <GripIcon className="w-3.5 h-3.5" />
            </button>
            <Check done={done} popped={popped} color={t.priority > 0 ? pr.color : undefined} onToggle={onToggle} />
            <div className="min-w-0 flex-1">
              {editing ? (
                <input
                  autoFocus
                  defaultValue={t.title}
                  maxLength={300}
                  onBlur={(e) => {
                    setEditing(false);
                    const v = e.target.value.trim();
                    if (v && v !== t.title) onSave({ title: v });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="w-full bg-transparent text-[13px] leading-[18px] outline-none border-b border-amber"
                />
              ) : (
                <button type="button" onClick={() => setEditing(true)} className="block w-full text-left text-[13px] leading-[18px] break-words">
                  <span className="todo-title">{t.title}</span>
                </button>
              )}
              {extras && (
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0 text-[11px] text-ink-faint">
                  {!done && <DueChip due={t.dueDate} today={today} />}
                  {inDay && view !== "myday" && !done && (
                    <span className="inline-flex items-center gap-0.5 text-amber flex-shrink-0" title="In My Day">
                      <SunIcon className="w-3 h-3" />
                    </span>
                  )}
                  {t.repeat && <RepeatIcon className="w-3 h-3 flex-shrink-0" />}
                  {t.remindAt && !done && (
                    <span className="inline-flex items-center gap-0.5 flex-shrink-0" title={`Reminder: ${reminderWord(t.remindAt, today)}`}>
                      <BellIcon className="w-3 h-3" />
                      {!narrow && <span className="tabular-nums">{reminderWord(t.remindAt, today)}</span>}
                    </span>
                  )}
                  {steps && <span className="tabular-nums flex-shrink-0">{steps}</span>}
                  {listName && (
                    <span className="inline-flex items-center gap-1 min-w-0 flex-shrink-0 max-w-[55%]">
                      <span className="w-1.5 h-1.5 rounded-[2px] flex-shrink-0" style={{ background: dot ?? "rgb(var(--blue))" }} aria-hidden />
                      <span className="truncate">{listName}</span>
                    </span>
                  )}
                  {t.notes && <span className="min-w-0 truncate">{t.notes}</span>}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSave({ important: !t.important })}
              aria-pressed={t.important}
              aria-label={t.important ? "Remove importance" : "Mark as important"}
              title={t.important ? "Remove importance" : "Mark as important"}
              className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${t.important ? "text-pink" : "text-ink-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-pink"} ${narrow && !t.important ? "hidden" : ""}`}
            >
              <StarIcon filled={t.important} className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Less" : "More"}
              aria-expanded={open}
              className="w-5 h-5 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
            >
              <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
          {open && (
            <div className={`${narrow ? "pl-1.5" : "pl-[42px]"} pr-1.5 pb-2 space-y-1.5 animate-[modalin_.12s_var(--ease-out)]`}>
              <textarea
                defaultValue={t.notes ?? ""}
                onBlur={(e) => e.target.value !== (t.notes ?? "") && onSave({ notes: e.target.value })}
                rows={2}
                placeholder="Notes…"
                className="w-full rounded-md border border-line/15 bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-amber resize-y"
              />
              <div className="flex items-center gap-1 flex-wrap">
                {PRIORITY.map((p) => (
                  <button
                    key={p.v}
                    type="button"
                    onClick={() => onSave({ priority: p.v })}
                    className={`rounded-md px-1.5 h-6 text-[11px] font-semibold border ${t.priority === p.v ? "border-amber bg-amber/10" : "border-line/15 text-ink-soft"}`}
                  >
                    {p.label}
                  </button>
                ))}
                <DatePicker value={t.dueDate} onChange={(d) => onSave({ dueDate: d })} ariaLabel="Due date" triggerClassName="rounded-md px-1.5 h-6 text-[11px] font-semibold border border-line/15 text-ink-soft">
                  {t.dueDate ? dayWord(t.dueDate, today) : "Due date"}
                </DatePicker>
                {t.dueDate && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirmClear(CLEAR_DATE_CONFIRM)) onSave({ dueDate: null });
                    }}
                    className="text-[11px] text-ink-soft hover:text-ink px-1"
                  >
                    Clear date
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => onSave({ myDay: inDay ? null : today })}
                  aria-pressed={inDay}
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 h-6 text-[11px] font-semibold border ${inDay ? "border-amber bg-amber/10 text-amber" : "border-line/15 text-ink-soft"}`}
                >
                  <SunIcon className="w-3 h-3" /> {inDay ? "In My Day" : "Add to My Day"}
                </button>
                {!t.id.startsWith("tmp-") && (
                  <Link href={todoHref(t.listId ?? "tasks", t.id)} className="inline-flex items-center gap-1 rounded-md px-1.5 h-6 text-[11px] font-semibold border border-line/15 text-ink-soft hover:text-ink">
                    <ExternalIcon className="w-3 h-3" /> Steps, reminder, repeat
                  </Link>
                )}
                <span className="flex-1" />
                <button type="button" onClick={onDelete} className="rounded-md px-1.5 h-6 text-[11px] font-semibold text-ink-soft hover:text-red hover:bg-red/10">
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
