"use client";

import { useState } from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast-provider";
import { addTodo, deleteTodo, reorderTodos, updateTodo } from "../actions";
import type { Todo } from "../lib/queries";
import { DueChip, localDay } from "./tasks-widget";

const PRIORITY = [
  { v: 0, label: "None", color: "transparent" },
  { v: 1, label: "Low", color: "rgb(59 130 246)" },
  { v: 2, label: "Medium", color: "rgb(234 179 8)" },
  { v: 3, label: "High", color: "rgb(239 68 68)" },
];

/** Your own to-do list: add, prioritise, date, notes, check off, drag to reorder. */
export function TodoWidget({ todos: initial }: { todos: Todo[] }) {
  const toast = useToast();
  const [todos, setTodos] = useState(initial);
  const [filter, setFilter] = useState<"active" | "done" | "all">("active");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(0);
  const [due, setDue] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const today = localDay();
  const shown = todos.filter((t) => (filter === "all" ? true : filter === "done" ? !!t.doneAt : !t.doneAt));

  const patch = (id: string, p: Partial<Todo>) => setTodos((all) => all.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const fail = (r: { error?: string }) => r.error && toast.error(r.error);

  async function add() {
    const t = title.trim();
    if (!t) return;
    const temp: Todo = { id: `tmp-${Date.now()}`, title: t, notes: null, dueDate: due, priority, position: -1e9, doneAt: null };
    setTodos((all) => [temp, ...all]);
    setTitle("");
    setDue(null);
    setPriority(0);
    const r = await addTodo({ title: t, dueDate: temp.dueDate, priority: temp.priority });
    if (r.error !== undefined) {
      toast.error(r.error);
      setTodos((all) => all.filter((x) => x.id !== temp.id));
    } else setTodos((all) => all.map((x) => (x.id === temp.id ? { ...x, id: r.id } : x)));
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = todos.findIndex((t) => t.id === e.active.id);
    const to = todos.findIndex((t) => t.id === e.over!.id);
    const next = arrayMove(todos, from, to);
    setTodos(next);
    void reorderTodos(next.map((t) => t.id)).then(fail);
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="rounded-xl border border-line/15 bg-surface-2/30 focus-within:border-amber/60 transition-colors">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="Add a to-do… (Enter)"
          maxLength={300}
          className="w-full bg-transparent px-3 h-10 text-[14px] outline-none"
        />
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          {PRIORITY.slice(1).map((p) => (
            <button
              key={p.v}
              type="button"
              onClick={() => setPriority((cur) => (cur === p.v ? 0 : p.v))}
              aria-pressed={priority === p.v}
              title={`${p.label} priority`}
              className={`rounded-md px-1.5 h-7 text-[12px] font-bold transition-colors ${priority === p.v ? "text-white" : "text-ink-soft hover:bg-surface-2"}`}
              style={priority === p.v ? { background: p.color } : undefined}
            >
              {"!".repeat(p.v)}
            </button>
          ))}
          <DatePicker value={due} onChange={setDue} ariaLabel="Due date" triggerClassName="rounded-md px-2 h-7 text-[12px] font-semibold text-ink-soft hover:bg-surface-2">
            {due ? new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Due date"}
          </DatePicker>
          <span className="flex-1" />
          <button type="button" onClick={() => void add()} disabled={!title.trim()} className="rounded-md bg-amber text-white font-bold px-2.5 h-7 text-[12px] disabled:opacity-40">
            Add
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 my-2.5">
        {(["active", "done", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 h-7 text-[12px] font-semibold capitalize ${filter === f ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {f}
            {f === "active" && ` · ${todos.filter((t) => !t.doneAt).length}`}
          </button>
        ))}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1 max-h-[360px] overflow-y-auto -mr-2 pr-2">
            {shown.map((t) => (
              <TodoItem
                key={t.id}
                t={t}
                today={today}
                onToggle={() => {
                  const doneAt = t.doneAt ? null : new Date().toISOString();
                  patch(t.id, { doneAt });
                  void updateTodo(t.id, { done: !!doneAt }).then(fail);
                }}
                onSave={(p) => {
                  patch(t.id, p);
                  void updateTodo(t.id, { title: p.title, notes: p.notes, dueDate: p.dueDate, priority: p.priority }).then(fail);
                }}
                onDelete={() => {
                  setTodos((all) => all.filter((x) => x.id !== t.id));
                  void deleteTodo(t.id).then(fail);
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {!shown.length && <p className="py-6 text-center text-[13px] text-ink-soft">{filter === "done" ? "Nothing checked off yet." : "All clear."}</p>}
    </div>
  );
}

function TodoItem({
  t,
  today,
  onToggle,
  onSave,
  onDelete,
}: {
  t: Todo;
  today: string;
  onToggle: () => void;
  onSave: (p: Partial<Todo>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const pr = PRIORITY[t.priority] ?? PRIORITY[0];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group rounded-lg border transition-colors ${isDragging ? "border-amber/50 bg-surface shadow-xl z-10 relative" : "border-transparent hover:bg-surface-2/50"}`}
    >
      <div className="flex items-start gap-2 px-1.5 py-1.5">
        <button type="button" {...attributes} {...listeners} aria-label="Drag to reorder" className="mt-1 w-4 text-ink-faint opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing touch-none">
          ⋮⋮
        </button>
        <button
          type="button"
          onClick={onToggle}
          role="checkbox"
          aria-checked={!!t.doneAt}
          className={`mt-0.5 w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center flex-shrink-0 transition-colors ${t.doneAt ? "bg-green border-green text-white" : "border-line/40 hover:border-amber"}`}
        >
          {t.doneAt && <span className="text-[11px] leading-none">✓</span>}
        </button>
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
              className="w-full bg-transparent text-[13.5px] outline-none border-b border-amber"
            />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className={`block w-full text-left text-[13.5px] leading-snug ${t.doneAt ? "line-through text-ink-faint" : ""}`}>
              {t.title}
            </button>
          )}
          {(t.dueDate || t.priority > 0 || t.notes) && !open && (
            <div className="flex items-center gap-1.5 mt-1">
              {t.priority > 0 && <span className="w-2 h-2 rounded-[2px]" style={{ background: pr.color }} title={`${pr.label} priority`} />}
              {!t.doneAt && <DueChip due={t.dueDate} today={today} />}
              {t.notes && <span className="text-[11px] text-ink-faint truncate">{t.notes}</span>}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="More" className="w-6 h-6 rounded-md text-ink-faint hover:text-ink hover:bg-surface-2 flex-shrink-0 opacity-60 group-hover:opacity-100">
          {open ? "▴" : "▾"}
        </button>
      </div>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 animate-[modalin_.12s_var(--ease-out)]">
          <textarea
            defaultValue={t.notes ?? ""}
            onBlur={(e) => e.target.value !== (t.notes ?? "") && onSave({ notes: e.target.value })}
            rows={2}
            placeholder="Notes…"
            className="w-full rounded-lg border border-line/15 bg-surface px-2.5 py-2 text-[13px] outline-none focus:ring-2 focus:ring-amber resize-y"
          />
          <div className="flex items-center gap-1 flex-wrap">
            {PRIORITY.map((p) => (
              <button
                key={p.v}
                type="button"
                onClick={() => onSave({ priority: p.v })}
                className={`rounded-md px-2 h-7 text-[11.5px] font-semibold border ${t.priority === p.v ? "border-amber bg-amber/10" : "border-line/15 text-ink-soft"}`}
              >
                {p.label}
              </button>
            ))}
            <DatePicker value={t.dueDate} onChange={(d) => onSave({ dueDate: d })} ariaLabel="Due date" triggerClassName="rounded-md px-2 h-7 text-[11.5px] font-semibold border border-line/15 text-ink-soft">
              {t.dueDate ? new Date(`${t.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Due date"}
            </DatePicker>
            {t.dueDate && (
              <button type="button" onClick={() => onSave({ dueDate: null })} className="text-[11.5px] text-ink-soft hover:text-ink px-1">
                Clear date
              </button>
            )}
            <span className="flex-1" />
            <button type="button" onClick={onDelete} className="rounded-md px-2 h-7 text-[11.5px] font-semibold text-ink-soft hover:text-red hover:bg-red/10">
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
