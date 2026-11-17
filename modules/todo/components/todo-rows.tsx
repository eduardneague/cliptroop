"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { KindIcon } from "@/components/ui/kind-icon";
import { CalendarIcon, ChevronRightIcon, SunIcon } from "@/components/ui/icons";
import type { Done, Task } from "@/modules/dashboard/lib/queries";
import { dayWord, dayWordAfter, type TodoItem, type TodoList, type ViewId } from "../lib/model";
import { MetaLine, PRIORITY, StarToggle, TodoCheck } from "./todo-bits";

/** popped: just ticked off; out: zipping away (ticked off); gone: puffing away (deleted); entering: sliding in. */
export type RowState = { popped: boolean; out: boolean; gone: boolean; entering: boolean };

/**
 * One to-do: the tick, its title and the line under it, the star. Click it for its details; right-click for its menu;
 * drag it to reorder (in your own order) or onto a list in the side bar. `sortable` off: it still drags onto the side
 * bar, but the others don't make room. `dense`: the same row, a little tighter (the dashboard's To Do widget, 1.53.4).
 */
export function TodoRow({
  t,
  rowKey,
  today,
  view,
  lists,
  selected,
  showList,
  state,
  onSelect,
  onToggle,
  onStar,
  onMenu,
  dense = false,
}: {
  t: TodoItem;
  rowKey: string;
  today: string;
  view: ViewId;
  lists: Map<string, TodoList>;
  selected: boolean;
  showList: boolean;
  state: RowState;
  onSelect: () => void;
  onToggle: () => void;
  onStar: () => void;
  onMenu: (at: { x: number; y: number }) => void;
  dense?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rowKey, data: { type: "todo", id: t.id } });
  const done = !!t.doneAt;
  const tone = !done && t.priority > 0 ? PRIORITY[t.priority]?.color : undefined;
  return (
    <li
      ref={setNodeRef}
      data-todo={t.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`todo-fold ${state.entering ? "is-in" : ""} ${state.out ? "is-out" : ""} ${state.gone ? "is-gone" : ""} ${isDragging ? "relative z-10 opacity-40" : ""}`}
    >
      <div>
        <div
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          aria-label={`${t.title}${done ? " (done)" : ""}`}
          data-done={done}
          onClick={onSelect}
          onKeyDown={(e) => {
            // Enter opens it; Space picks it up to move with the arrow keys (dnd-kit's keyboard dragging).
            if (e.key === "Enter") {
              if (e.target === e.currentTarget) onSelect();
              return;
            }
            listeners?.onKeyDown?.(e);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onMenu({ x: e.clientX, y: e.clientY });
          }}
          className={`todo-row group relative flex items-center rounded-xl border cursor-pointer ${dense ? "gap-2.5 pl-2.5 pr-1 py-1.5 min-h-[44px]" : "gap-3 pl-3 pr-1.5 py-2 min-h-[52px]"} select-none transition-[background-color,border-color,box-shadow] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
            state.popped ? "just-checked" : ""
          } ${selected ? "bg-amber/[0.07] border-amber/45 shadow-[0_1px_0_0_rgb(var(--amber)/0.15)]" : "bg-surface border-line/10 hover:bg-surface-2/60 hover:border-line/20"}`}
        >
          <TodoCheck done={done} popped={state.popped} tone={tone} onToggle={onToggle} size={dense ? 18 : 20} />
          <span className="min-w-0 flex-1 py-0.5">
            <span className={`block leading-snug break-words ${dense ? "text-[13.5px]" : "text-[14px]"} ${done ? "" : "text-ink"}`}>
              <span className="todo-title">{t.title}</span>
            </span>
            <MetaLine t={t} today={today} view={view} lists={lists} showList={showList} />
          </span>
          <StarToggle on={t.important} onToggle={onStar} className={t.important ? "" : "opacity-60 group-hover:opacity-100"} />
        </div>
      </div>
    </li>
  );
}

/** A finished team task (Assigned to me's Completed, My Day's). */
export function TeamDoneRow({ d, today }: { d: Done; today: string }) {
  const when = dayWord(localOf(d.at), today).replace(/^(Today|Yesterday)$/, (w) => w.toLowerCase());
  return (
    <li>
      <Link href={d.href} className="todo-row group flex items-center gap-3 rounded-xl border border-line/10 bg-surface pl-3 pr-3 py-2 min-h-[52px] hover:bg-surface-2/60" data-done="true">
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: "rgb(var(--teal))" }} aria-label="Done">
          <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3.5 8.5 6.8 11.6 12.5 4.6" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug truncate">
            <span className="todo-title">{d.action}</span>
          </span>
          <span className="block text-[11.5px] text-ink-faint truncate">
            {d.kind === "meeting" ? "From " : d.number ? `#${d.number} ` : ""}
            {d.title} · done {when}
          </span>
        </span>
        <ChevronRightIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
      </Link>
    </li>
  );
}
const localOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * One of your team tasks (Assigned to me): what to do, on which video, when. Opens where the work is; the sun puts it
 * in My Day (or takes it out). They tick off by themselves when the video moves on.
 */
export function TeamRow({ t, today, inMyDay, onMyDay, showDay = true }: { t: Task; today: string; inMyDay: boolean; onMyDay: () => void; showDay?: boolean }) {
  const late = t.state === "active" && !!t.dueDate && t.dueDate < today;
  const waiting = t.state === "waiting";
  return (
    <li>
      <div className={`group relative flex items-center gap-3 rounded-xl border border-line/10 bg-surface pl-2.5 pr-1.5 py-2 min-h-[52px] transition-colors hover:bg-surface-2/60 ${waiting ? "opacity-75 hover:opacity-100" : ""}`}>
        {late && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-[2px] bg-red" aria-hidden />}
        <Link href={t.href} className="flex items-center gap-3 min-w-0 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-lg">
          {t.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.thumb} alt="" className="w-[46px] h-[26px] rounded-[5px] object-cover flex-shrink-0 bg-surface-2" />
          ) : (
            <span className={`w-[26px] h-[26px] rounded-[7px] flex items-center justify-center flex-shrink-0 ${t.kind === "short" ? "bg-short/12" : t.kind === "meeting" ? "bg-violet/12" : "bg-long/12"}`}>
              <KindIcon kind={t.kind} className="w-3.5 h-3.5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold leading-snug truncate">{t.action}</span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint min-w-0">
              <span className="truncate">
                {t.kind === "meeting" ? "From " : <span className="font-mono">#{t.number} </span>}
                {t.title}
                {waiting && t.currentStageLabel ? ` · after ${t.currentStageLabel}` : ""}
              </span>
              {showDay && t.dueDate && (
                <span className={`inline-flex items-center gap-1 flex-shrink-0 ${late ? "text-red font-semibold" : t.dueDate === today ? "text-amber font-semibold" : ""}`}>
                  · <CalendarIcon className="w-3 h-3" /> {late ? `Overdue, ${dayWordAfter(t.dueDate, today)}` : dayWord(t.dueDate, today)}
                </span>
              )}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={onMyDay}
          aria-pressed={inMyDay}
          aria-label={inMyDay ? "Remove from My Day" : "Add to My Day"}
          title={inMyDay ? "Remove from My Day" : "Add to My Day"}
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${inMyDay ? "text-amber" : "text-ink-faint opacity-60 group-hover:opacity-100 hover:text-amber hover:bg-amber/10"}`}
        >
          <SunIcon className="w-[18px] h-[18px]" />
        </button>
      </div>
    </li>
  );
}
