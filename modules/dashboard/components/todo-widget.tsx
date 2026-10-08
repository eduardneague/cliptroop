"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DatePicker } from "@/components/ui/date-picker";
import { CLEAR_DATE_CONFIRM, markDoneConfirm, useConfirmSafe } from "@/components/ui/confirm-provider";
import { CalendarIcon, ChevronDownIcon, FlagIcon, GripIcon, PlusIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { sounds } from "@/lib/sounds";
import { Mascot } from "@/components/ui/mascot";
import { addTodo, deleteTodo, reorderTodos, updateTodo } from "../actions";
import type { Todo } from "../lib/queries";
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
/** How long a just-checked item stays where it was before moving or folding away. */
const HOLD_MS = 750;
const FOLD_MS = 280;

/**
 * Your own to-do list. Checking one off: a pop, a chime, it turns green and
 * stays (All), then slides down to the finished ones. In Active it folds
 * away after a moment instead of vanishing.
 */
export function TodoWidget({ todos: initial }: { todos: Todo[] }) {
  const toast = useToast();
  const confirmDone = useConfirmSafe();
  const [todos, setTodos] = useState(initial);
  const [filter, setFilterState] = useState<Filter>("all");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(0);
  const [due, setDue] = useState<string | null>(null);
  /** Just checked/unchecked: stays put (hold), then folds out of filtered views (out). */
  const [settling, setSettling] = useState<Map<string, "hold" | "out">>(new Map());
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
  const narrow = useBox().w < 220;

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
  const settle = (id: string, phase: "hold" | "out" | null) =>
    setSettling((s) => {
      const n = new Map(s);
      if (phase) n.set(id, phase);
      else n.delete(id);
      return n;
    });

  const patch = (id: string, p: Partial<Todo>) => setTodos((all) => all.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const fail = (r: { error?: string }) => r.error && toast.error(r.error);

  async function toggle(t: Todo) {
    if (!t.doneAt && !(await confirmDone(markDoneConfirm(t.title)))) return;
    const doneAt = t.doneAt ? null : new Date().toISOString();
    clearLater(t.id);
    patch(t.id, { doneAt });
    void updateTodo(t.id, { done: !!doneAt }).then(fail);
    if (doneAt) {
      sounds.check();
      // The last open one: a little fanfare.
      if (todos.filter((x) => !x.doneAt).length === 1) setTimeout(() => sounds.celebrate(), 420);
      setIn(setPopped, t.id, true);
      later(t.id, 700, () => setIn(setPopped, t.id, false));
    } else sounds.uncheck();
    // Stay in place for a moment, then move (All) or fold away (Active / Done).
    settle(t.id, "hold");
    later(t.id, doneAt ? HOLD_MS : 250, () => {
      if (filterRef.current === "all") return settle(t.id, null);
      settle(t.id, "out");
      later(t.id, FOLD_MS, () => settle(t.id, null));
    });
  }

  async function add() {
    const text = title.trim();
    if (!text) return;
    const temp: Todo = { id: `tmp-${Date.now()}`, title: text, notes: null, dueDate: due, priority, position: Math.min(0, ...todos.map((x) => x.position)) - 1, doneAt: null };
    setTodos((all) => [temp, ...all]);
    setIn(setFresh, temp.id, true);
    setTitle("");
    setDue(null);
    setPriority(0);
    sounds.pop();
    if (filter === "done") setFilter("all");
    const r = await addTodo({ title: text, dueDate: temp.dueDate, priority: temp.priority });
    if (r.error !== undefined) {
      toast.error(r.error);
      setTodos((all) => all.filter((x) => x.id !== temp.id));
    } else {
      // The real id replaces the temporary one (no second slide-in).
      setTodos((all) => all.map((x) => (x.id === temp.id ? { ...x, id: r.id } : x)));
      setIn(setFresh, temp.id, false);
    }
  }

  function remove(t: Todo) {
    setIn(setLeaving, t.id, true);
    later(t.id, FOLD_MS, () => {
      setTodos((all) => all.filter((x) => x.id !== t.id));
      setIn(setLeaving, t.id, false);
    });
    void deleteTodo(t.id).then(fail);
  }

  // What's shown: open ones by your order, then finished ones (latest first).
  const shown = useMemo(() => {
    const isDone = (t: Todo) => !!t.doneAt && !settling.has(t.id);
    const byPos = (a: Todo, b: Todo) => a.position - b.position;
    const open = todos.filter((t) => !isDone(t)).sort(byPos);
    const finished = todos.filter(isDone).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
    if (filter === "active") return todos.filter((t) => !t.doneAt || settling.has(t.id)).sort(byPos);
    if (filter === "done") return todos.filter((t) => !!t.doneAt || settling.has(t.id)).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
    return [...open, ...finished];
  }, [todos, filter, settling]);

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

  const total = todos.length;
  const doneCount = todos.filter((t) => t.doneAt).length;
  const openCount = total - doneCount;
  const pr = PRIORITY[priority];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-0.5 rounded-lg border border-line/15 bg-surface-2/30 pr-1 focus-within:border-amber/60 transition-colors flex-shrink-0">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="Add a to-do…"
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

      <div className="flex items-center gap-0.5 mt-1.5 flex-shrink-0">
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
            className={`rounded-md px-2 h-6 text-[12px] font-semibold transition-colors ${filter === f ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {label}
            {n > 0 && !narrow && <span className="ml-1 text-[11px] text-ink-faint tabular-nums">{n}</span>}
          </button>
        ))}
        {total > 0 && !narrow && (
          <span className="ml-auto text-[11px] tabular-nums text-ink-faint" title={`${doneCount} of ${total} done`}>
            {doneCount}/{total}
          </span>
        )}
      </div>
      {total > 0 && (
        <div className="h-1 rounded-full bg-line/10 mt-1 mb-1 overflow-hidden flex-shrink-0" aria-hidden>
          <div className="h-full rounded-full bg-green transition-[width] duration-500 ease-out" style={{ width: `${(doneCount / total) * 100}%` }} />
        </div>
      )}

      <div className="flex-1 min-h-0 widget-scroll -mx-1">
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ul ref={list} className="relative">
              {shown.map((t) => (
                <TodoItem
                  key={t.id}
                  narrow={narrow}
                  t={t}
                  today={today}
                  popped={popped.has(t.id)}
                  entering={fresh.has(t.id)}
                  out={settling.get(t.id) === "out" || leaving.has(t.id)}
                  onToggle={() => toggle(t)}
                  onSave={(p) => {
                    patch(t.id, p);
                    void updateTodo(t.id, { title: p.title, notes: p.notes, dueDate: p.dueDate, priority: p.priority }).then(fail);
                  }}
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
            <p className="py-5 text-center text-[12.5px] text-ink-soft animate-[fadein_.3s_ease]">{filter === "done" ? "Nothing checked off yet." : "Nothing here yet. Add your first one above."}</p>
          ))}
      </div>
    </div>
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
        done ? "bg-green border-green text-white" : "border-line/45 hover:border-green hover:bg-green/10"
      } ${popped ? "just-checked" : ""}`}
      style={!done && color ? { borderColor: color } : undefined}
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

function TodoItem({
  narrow,
  t,
  today,
  popped,
  entering,
  out,
  onToggle,
  onSave,
  onDelete,
}: {
  narrow: boolean;
  t: Todo;
  today: string;
  popped: boolean;
  entering: boolean;
  out: boolean;
  onToggle: () => void;
  onSave: (p: Partial<Todo>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: !!t.doneAt });
  const confirmClear = useConfirmSafe();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const pr = PRIORITY[t.priority] ?? PRIORITY[0];
  const done = !!t.doneAt;
  return (
    <li
      ref={setNodeRef}
      data-todo={t.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`todo-fold ${entering ? "is-in" : ""} ${out ? "is-out" : ""} ${isDragging ? "relative z-10" : ""}`}
    >
      <div>
        <div
          data-done={done}
          className={`todo-row group rounded-md border transition-colors ${popped ? "just-checked" : ""} ${isDragging ? "border-amber/50 bg-surface shadow-xl" : "border-transparent hover:bg-surface-2/50"}`}
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
              {!open && ((t.dueDate && !done) || t.notes) && (
                <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                  {!done && <DueChip due={t.dueDate} today={today} />}
                  {t.notes && <span className="text-[11px] text-ink-faint truncate">{t.notes}</span>}
                </div>
              )}
            </div>
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
                  {t.dueDate ? new Date(`${t.dueDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Due date"}
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
