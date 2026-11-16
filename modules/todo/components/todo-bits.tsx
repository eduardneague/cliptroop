"use client";

import { BellIcon, CalendarIcon, DocumentIcon, HomeIcon, ListBulletIcon, StarIcon, SunIcon, UserIcon } from "@/components/ui/icons";
import { RepeatIcon } from "./todo-icons";
import { dayWord, dayWordAfter, isSmart, listColor, plannedDay, reminderWord, repeatWord, type SmartId, type TodoItem, type TodoList, type ViewId } from "../lib/model";

/** The smart lists: name, icon, colour (Microsoft To Do's, in ClipTroop's colours). */
export const SMART_META: Record<SmartId, { name: string; tone: string; Icon: (p: { className?: string }) => React.ReactNode }> = {
  myday: { name: "My Day", tone: "rgb(var(--amber))", Icon: SunIcon },
  important: { name: "Important", tone: "rgb(var(--pink))", Icon: (p) => <StarIcon {...p} /> },
  planned: { name: "Planned", tone: "rgb(var(--teal))", Icon: (p) => <CalendarIcon {...p} /> },
  assigned: { name: "Assigned to me", tone: "rgb(var(--green))", Icon: (p) => <UserIcon {...p} /> },
  tasks: { name: "Tasks", tone: "rgb(var(--blue))", Icon: (p) => <HomeIcon {...p} /> },
};

export const viewName = (view: ViewId, lists: Map<string, TodoList>) => (isSmart(view) ? SMART_META[view].name : (lists.get(view)?.name ?? "List"));
export const viewTone = (view: ViewId, lists: Map<string, TodoList>) => (isSmart(view) ? SMART_META[view].tone : listColor(lists.get(view)?.color ?? "blue").fill);
export const viewTextTone = (view: ViewId, lists: Map<string, TodoList>) => (isSmart(view) ? SMART_META[view].tone : listColor(lists.get(view)?.color ?? "blue").text);

/** A view's icon: the smart list's, your list's emoji, or its lines in its colour. */
export function ViewGlyph({ view, lists, className = "w-[18px] h-[18px]", big = false }: { view: ViewId; lists: Map<string, TodoList>; className?: string; big?: boolean }) {
  if (isSmart(view)) {
    const { Icon, tone } = SMART_META[view];
    return (
      <span style={{ color: tone }} className="inline-flex flex-shrink-0" aria-hidden>
        <Icon className={className} />
      </span>
    );
  }
  const l = lists.get(view);
  if (l?.emoji)
    return (
      <span className={`inline-flex items-center justify-center flex-shrink-0 leading-none ${big ? "text-[28px]" : "text-[16px] w-[18px]"}`} aria-hidden>
        {l.emoji}
      </span>
    );
  return (
    <span style={{ color: listColor(l?.color ?? "blue").fill }} className="inline-flex flex-shrink-0" aria-hidden>
      <ListBulletIcon className={className} />
    </span>
  );
}

/** A button inside a draggable row: pressing it never starts a drag (mouse, touch or keyboard). */
export const HOLD_STILL = {
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
};

/**
 * The tick: a ring that pops, draws its check and throws a few sparks (globals.css .todo-check, the widget's since 1.23).
 * Round here, like Microsoft To Do's; `tone`: the ring's colour (a to-do's priority).
 */
export function TodoCheck({
  done,
  popped = false,
  onToggle,
  size = 20,
  tone,
  label,
}: {
  done: boolean;
  popped?: boolean;
  onToggle: () => void;
  size?: number;
  tone?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      {...HOLD_STILL}
      role="checkbox"
      data-round=""
      data-sound="none"
      aria-checked={done}
      aria-label={label ?? (done ? "Mark as not done" : "Mark as done")}
      className={`todo-check group/check rounded-full border-[1.75px] flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${
        done ? "border-transparent text-white" : "border-line/40 hover:border-[rgb(var(--teal))] hover:bg-[rgb(var(--teal)/0.1)] text-transparent hover:text-[rgb(var(--teal))]"
      } ${popped ? "just-checked" : ""}`}
      style={{ width: size, height: size, ...(done ? { background: "rgb(var(--teal))" } : tone ? { borderColor: tone } : {}) }}
    >
      <span className="burst" aria-hidden />
      {popped && Array.from({ length: 6 }, (_, k) => <span key={k} className="spark" aria-hidden style={{ ["--a" as string]: `${k * 60 + 30}deg`, ["--d" as string]: `${(k % 2) * 40}ms` }} />)}
      <svg viewBox="0 0 16 16" style={{ width: size * 0.55, height: size * 0.55 }} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 8.5 6.8 11.6 12.5 4.6" />
      </svg>
    </button>
  );
}

/** The star: Important. */
export function StarToggle({ on, onToggle, className = "" }: { on: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      {...HOLD_STILL}
      aria-pressed={on}
      aria-label={on ? "Remove importance" : "Mark as important"}
      title={on ? "Remove importance" : "Mark as important"}
      className={`todo-star w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${on ? "text-pink" : "text-ink-faint hover:text-pink hover:bg-pink/10"} ${className}`}
      data-on={on ? "" : undefined}
    >
      <StarIcon filled={on} className="w-[18px] h-[18px]" />
    </button>
  );
}

export const PRIORITY = [
  { v: 0, label: "None", color: "" },
  { v: 1, label: "Low", color: "rgb(59 130 246)" },
  { v: 2, label: "Medium", color: "rgb(234 179 8)" },
  { v: 3, label: "High", color: "rgb(239 68 68)" },
];

/** A category's colour (the same name, the same colour everywhere). */
const CAT_TONES = ["--blue", "--teal", "--green", "--gold", "--coral", "--pink", "--violet", "--red"];
export function categoryTone(name: string) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const v = CAT_TONES[h % CAT_TONES.length];
  return { fill: `rgb(var(${v}))`, text: `rgb(var(${v}-text))`, tint: `rgb(var(${v}) / 0.13)` };
}

export function CategoryChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  const t = categoryTone(name);
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 h-[18px] text-[11px] font-bold whitespace-nowrap max-w-[140px]" style={{ background: t.tint, color: t.text }}>
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="-mr-0.5 opacity-70 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  );
}

/**
 * The line under a to-do's title, Microsoft To Do's: its list (outside it), My Day, steps, due day, reminder, repeat,
 * a note, categories. Only what it has.
 */
export function MetaLine({ t, today, view, lists, showList }: { t: TodoItem; today: string; view: ViewId; lists: Map<string, TodoList>; showList: boolean }) {
  const parts: React.ReactNode[] = [];
  if (showList) {
    const l = t.listId ? lists.get(t.listId) : null;
    parts.push(
      <span key="list" className="inline-flex items-center gap-1 min-w-0">
        {l?.emoji ? <span aria-hidden>{l.emoji}</span> : null}
        <span className="truncate">{l?.name ?? "Tasks"}</span>
      </span>
    );
  }
  if (view !== "myday" && t.myDay === today && !t.doneAt)
    parts.push(
      <span key="day" className="inline-flex items-center gap-1 text-amber font-semibold">
        <SunIcon className="w-3 h-3" /> My Day
      </span>
    );
  if (t.steps.length) {
    const done = t.steps.filter((s) => s.doneAt).length;
    parts.push(
      <span key="steps" className={done === t.steps.length ? "text-green font-semibold" : ""}>
        {done} of {t.steps.length}
      </span>
    );
  }
  const day = t.dueDate;
  if (day) {
    const late = !t.doneAt && day < today;
    parts.push(
      <span key="due" className={`inline-flex items-center gap-1 ${t.doneAt ? "" : late ? "text-red font-semibold" : day === today ? "text-amber font-semibold" : ""}`} title={`Due ${dayWord(day, today)}`}>
        <CalendarIcon className="w-3 h-3" />
        {late ? `Overdue, ${dayWordAfter(day, today)}` : `Due ${dayWordAfter(day, today)}`}
        {t.repeat && <RepeatIcon className="w-3 h-3" />}
      </span>
    );
  } else if (t.repeat)
    parts.push(
      <span key="rep" className="inline-flex items-center gap-1">
        <RepeatIcon className="w-3 h-3" /> {repeatWord(t.repeat)}
      </span>
    );
  if (t.remindAt && !t.doneAt) {
    const past = Date.parse(t.remindAt) < Date.now();
    parts.push(
      <span key="rem" className={`inline-flex items-center gap-1 ${past ? "" : "text-ink-soft"}`}>
        <BellIcon className="w-3 h-3" /> {reminderWord(t.remindAt, today)}
      </span>
    );
  }
  if (t.notes)
    parts.push(
      <span key="note" className="inline-flex items-center gap-1" title="Has a note">
        <DocumentIcon className="w-3 h-3" /> Note
      </span>
    );
  if (!parts.length && !t.categories.length) return null;
  // Each bit carries its dot in its left padding, and the row is pulled left by that much inside a box that clips: the
  // bit that starts a line (the first, or the first after a wrap on a phone) has its dot cut off, so no line begins "·".
  return (
    <span className="block overflow-hidden mt-0.5">
      <span className="flex items-center gap-y-0.5 flex-wrap -ml-3.5 text-[11.5px] text-ink-faint leading-tight min-w-0">
        {parts.map((p, i) => (
          <span key={i} className="relative inline-flex items-center min-w-0 pl-3.5">
            <span aria-hidden className="absolute left-0 w-3.5 text-center text-ink-faint/60">
              ·
            </span>
            {p}
          </span>
        ))}
        {t.categories.map((c) => (
          <span key={c} className="inline-flex min-w-0 pl-3.5">
            <CategoryChip name={c} />
          </span>
        ))}
      </span>
    </span>
  );
}

/** Planned's day for a to-do (its due day, else its reminder's). */
export const plannedOf = plannedDay;

/** A view's colour as a CSS variable's name (for tints: `rgb(var(--amber) / 0.14)`). */
const SMART_VAR: Record<SmartId, string> = { myday: "--amber", important: "--pink", planned: "--teal", assigned: "--green", tasks: "--blue" };
export function viewVar(view: ViewId, lists: Map<string, TodoList>) {
  if (isSmart(view)) return SMART_VAR[view];
  const c = lists.get(view)?.color ?? "blue";
  return c === "slate" ? "--ink-soft" : c === "orange" ? "--coral" : `--${c}`;
}
