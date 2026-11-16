"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { MonthCalendar } from "@/components/ui/month-calendar";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { ArrowRightIcon, BellIcon, CalendarIcon, CheckIcon, ChevronLeftIcon, CloseIcon, HomeIcon, ListBulletIcon, PlusIcon, StarIcon, SunIcon, TagIcon, TrashIcon } from "@/components/ui/icons";
import { RepeatIcon, SortIcon } from "./todo-icons";
import {
  addDays,
  cleanRepeat,
  cleanTitle,
  dayWord,
  duePicks,
  firstDue,
  localDay,
  momentOf,
  REPEAT_PICKS,
  reminderPicks,
  repeatWord,
  SORT_LABEL,
  type Repeat,
  type RepeatUnit,
  type Sort,
  type SortBy,
  type TodoItem,
  type TodoList,
} from "../lib/model";
import { categoryTone } from "./todo-bits";

export const itemCls = "w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-45";
const iconCls = "w-4 h-4 text-ink-soft flex-shrink-0";

/** One of the app's menus (AnchoredMenu: it leaves the way it came), with ↑/↓ between its items. */
export function Menu({
  open,
  onClose,
  anchor,
  width = 260,
  align = "left",
  label,
  children,
  keyboard = true,
}: {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement | null>;
  width?: number;
  align?: "left" | "right";
  label: string;
  children: React.ReactNode;
  /** Off for a menu that's mostly a form (its first field takes the focus instead). */
  keyboard?: boolean;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const boxRef = useMemo(() => ({ current: box }), [box]);
  useMenuKeyboard(open && keyboard, boxRef, anchor, onClose);
  return (
    <AnchoredMenu open={open} onClose={onClose} anchor={anchor} width={width} align={align} label={label}>
      <div ref={setBox} className="p-1">
        {children}
      </div>
    </AnchoredMenu>
  );
}

export function MenuItem({
  icon,
  label,
  hint,
  onClick,
  danger = false,
  checked,
  disabled,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="button" role={checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={checked} disabled={disabled} onClick={onClick} className={`${itemCls} ${danger ? "!text-red hover:!bg-red/10" : ""}`}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint !== undefined && <span className="text-[12px] text-ink-faint tabular-nums flex-shrink-0">{hint}</span>}
      {checked && <CheckIcon className="w-4 h-4 text-amber flex-shrink-0" />}
    </button>
  );
}

export const Divider = () => <div className="my-1 mx-2 h-px bg-line/10" role="separator" />;
const BackHead = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <div className="flex items-center gap-1 px-1 pt-0.5 pb-1.5">
    <button type="button" onClick={onBack} aria-label="Back" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink">
      <ChevronLeftIcon className="w-4 h-4" />
    </button>
    <span className="text-[12.5px] font-bold text-ink-soft">{title}</span>
  </div>
);

/** A button that opens a menu: its ref and whether it's open. */
export function useMenuButton<T extends HTMLElement = HTMLButtonElement>() {
  const ref = useRef<T>(null);
  const [open, setOpen] = useState(false);
  return { ref, open, setOpen, toggle: () => setOpen((o) => !o), close: () => setOpen(false) };
}

// ---------------------------------------------------------------------------
// Due day, reminder, repeat (Microsoft To Do's three)
// ---------------------------------------------------------------------------

export function DueMenu({ open, onClose, anchor, value, today, onPick }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; value: string | null; today: string; onPick: (day: string | null) => void }) {
  const [cal, setCal] = useState(false);
  useEffect(() => {
    if (!open) setCal(false);
  }, [open]);
  const pick = (d: string | null) => {
    onPick(d);
    onClose();
  };
  return (
    <Menu open={open} onClose={onClose} anchor={anchor} width={cal ? 320 : 250} label="Due date" keyboard={!cal}>
      {cal ? (
        <div className="px-1.5 pb-1.5">
          <BackHead title="Pick a date" onBack={() => setCal(false)} />
          <MonthCalendar value={value} autoFocus onPick={(d) => pick(d)} onEscape={onClose} />
        </div>
      ) : (
        <>
          <div className="px-3 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Due</div>
          {duePicks(today).map((p) => (
            <MenuItem key={p.key} icon={<CalendarIcon className={iconCls} />} label={p.label} hint={p.hint} checked={value === p.day ? true : undefined} onClick={() => pick(p.day)} />
          ))}
          <Divider />
          <MenuItem icon={<CalendarIcon className={iconCls} />} label="Pick a date" hint={value && !duePicks(today).some((p) => p.day === value) ? dayWord(value, today) : undefined} onClick={() => setCal(true)} />
          {value && (
            <>
              <Divider />
              <MenuItem danger icon={<TrashIcon className="w-4 h-4 flex-shrink-0" />} label="Remove due date" onClick={() => pick(null)} />
            </>
          )}
        </>
      )}
    </Menu>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

export function RemindMenu({ open, onClose, anchor, value, onPick }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; value: string | null; onPick: (iso: string | null) => void }) {
  const [cal, setCal] = useState(false);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("09:00");
  useEffect(() => {
    if (!open) return setCal(false);
    const base = value ? new Date(value) : new Date(Date.now() + 3_600_000);
    setDay(localDay(base));
    setTime(value ? `${pad(base.getHours())}:${pad(base.getMinutes())}` : `${pad(base.getHours())}:00`);
  }, [open, value]);
  const pick = (iso: string | null) => {
    onPick(iso);
    onClose();
  };
  const chosen = momentOf(day, time);
  const past = !!chosen && Date.parse(chosen) <= Date.now();
  return (
    <Menu open={open} onClose={onClose} anchor={anchor} width={cal ? 320 : 270} label="Remind me" keyboard={!cal}>
      {cal ? (
        <div className="px-1.5 pb-1.5">
          <BackHead title="Pick a date & time" onBack={() => setCal(false)} />
          <MonthCalendar value={day || null} onPick={(d) => setDay(d)} onEscape={onClose} />
          <div className="flex items-center gap-2 mt-2 px-1">
            <label className="flex-1 flex items-center gap-2 rounded-lg border border-line/15 px-2.5 h-9 text-[13px] focus-within:ring-2 focus-within:ring-amber">
              <BellIcon className="w-4 h-4 text-ink-faint" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" className="flex-1 bg-transparent outline-none tabular-nums" />
            </label>
            <button
              type="button"
              disabled={!chosen || past}
              onClick={() => chosen && pick(chosen)}
              className="h-9 px-4 rounded-lg bg-amber text-white text-[13px] font-bold disabled:opacity-40"
            >
              Save
            </button>
          </div>
          {past && <p className="px-1.5 pt-1.5 text-[11.5px] text-red">Pick a time that hasn&rsquo;t passed.</p>}
        </div>
      ) : (
        <>
          <div className="px-3 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Reminder</div>
          {reminderPicks().map((p) => (
            <MenuItem key={p.key} icon={<BellIcon className={iconCls} />} label={p.label} hint={p.hint} onClick={() => pick(p.iso)} />
          ))}
          <Divider />
          <MenuItem icon={<CalendarIcon className={iconCls} />} label="Pick a date & time" onClick={() => setCal(true)} />
          {value && (
            <>
              <Divider />
              <MenuItem danger icon={<TrashIcon className="w-4 h-4 flex-shrink-0" />} label="Remove reminder" onClick={() => pick(null)} />
            </>
          )}
        </>
      )}
    </Menu>
  );
}

const WEEK = [
  { d: 1, s: "M", n: "Monday" },
  { d: 2, s: "T", n: "Tuesday" },
  { d: 3, s: "W", n: "Wednesday" },
  { d: 4, s: "T", n: "Thursday" },
  { d: 5, s: "F", n: "Friday" },
  { d: 6, s: "S", n: "Saturday" },
  { d: 0, s: "S", n: "Sunday" },
];
const UNITS: { v: RepeatUnit; one: string; many: string }[] = [
  { v: "day", one: "day", many: "days" },
  { v: "week", one: "week", many: "weeks" },
  { v: "month", one: "month", many: "months" },
  { v: "year", one: "year", many: "years" },
];
const sameRepeat = (a: Repeat | null, b: Repeat) => !!a && a.every === b.every && a.unit === b.unit && (a.days ?? []).join() === (b.days ?? []).join();

export function RepeatMenu({ open, onClose, anchor, value, today, onPick }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; value: Repeat | null; today: string; onPick: (r: Repeat | null) => void }) {
  const [custom, setCustom] = useState(false);
  const [every, setEvery] = useState(1);
  const [unit, setUnit] = useState<RepeatUnit>("week");
  const [days, setDays] = useState<number[]>([]);
  useEffect(() => {
    if (!open) return setCustom(false);
    setEvery(value?.every ?? 1);
    setUnit(value?.unit ?? "week");
    setDays(value?.days ?? [new Date(`${today}T00:00:00`).getDay()]);
  }, [open, value, today]);
  const pick = (r: Repeat | null) => {
    onPick(r);
    onClose();
  };
  const draft = cleanRepeat({ every, unit, days: unit === "week" ? days : undefined });
  const isPreset = !!value && REPEAT_PICKS.some((p) => sameRepeat(value, p.repeat));
  return (
    <Menu open={open} onClose={onClose} anchor={anchor} width={custom ? 300 : 250} label="Repeat" keyboard={!custom}>
      {custom ? (
        <div className="px-1.5 pb-2">
          <BackHead title="Custom repeat" onBack={() => setCustom(false)} />
          <div className="flex items-center gap-2 px-1.5">
            <span className="text-[13px] font-semibold">Every</span>
            <input
              type="number"
              min={1}
              max={999}
              value={every}
              onChange={(e) => setEvery(Math.max(1, Math.min(999, Math.floor(Number(e.target.value)) || 1)))}
              aria-label="How many"
              className="w-16 h-9 rounded-lg border border-line/15 bg-surface px-2 text-[13px] tabular-nums outline-none focus:ring-2 focus:ring-amber"
              autoFocus
            />
            <select value={unit} onChange={(e) => setUnit(e.target.value as RepeatUnit)} aria-label="Unit" className="flex-1 h-9 rounded-lg border border-line/15 bg-surface px-2 text-[13px] outline-none focus:ring-2 focus:ring-amber">
              {UNITS.map((u) => (
                <option key={u.v} value={u.v}>
                  {every === 1 ? u.one : u.many}
                </option>
              ))}
            </select>
          </div>
          {unit === "week" && (
            <div className="flex items-center gap-1 px-1.5 mt-2.5" role="group" aria-label="On these days">
              {WEEK.map((w) => {
                const on = days.includes(w.d);
                return (
                  <button
                    key={w.d}
                    type="button"
                    aria-pressed={on}
                    aria-label={w.n}
                    title={w.n}
                    onClick={() => setDays((ds) => (on ? ds.filter((x) => x !== w.d) : [...ds, w.d]))}
                    className={`w-8 h-8 rounded-full text-[12px] font-bold transition-colors ${on ? "bg-amber text-white" : "bg-surface-2 text-ink-soft hover:text-ink"}`}
                  >
                    {w.s}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-1.5 mt-3">
            <span className="text-[11.5px] text-ink-faint truncate">{draft ? repeatWord(draft) : ""}</span>
            <button type="button" disabled={!draft} onClick={() => draft && pick(draft)} className="h-9 px-4 rounded-lg bg-amber text-white text-[13px] font-bold disabled:opacity-40">
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Repeat</div>
          {REPEAT_PICKS.map((p) => (
            <MenuItem key={p.key} icon={<RepeatIcon className={iconCls} />} label={p.label} checked={sameRepeat(value, p.repeat) ? true : undefined} onClick={() => pick(p.repeat)} />
          ))}
          <Divider />
          <MenuItem icon={<RepeatIcon className={iconCls} />} label="Custom" hint={value && !isPreset ? repeatWord(value) : undefined} onClick={() => setCustom(true)} />
          {value && (
            <>
              <Divider />
              <MenuItem danger icon={<TrashIcon className="w-4 h-4 flex-shrink-0" />} label="Never repeat" onClick={() => pick(null)} />
            </>
          )}
        </>
      )}
    </Menu>
  );
}

/** A repeat set on a to-do with no due day also sets one (Microsoft To Do does the same). */
export const dueForRepeat = (r: Repeat | null, due: string | null, today: string) => (r && !due ? firstDue(r, today) : due);

// ---------------------------------------------------------------------------
// Categories, lists, sorting
// ---------------------------------------------------------------------------

export function CategoryMenu({ open, onClose, anchor, value, known, onChange }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; value: string[]; known: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!open) setText("");
  }, [open]);
  const all = useMemo(() => [...new Set([...value, ...known])].sort((a, b) => a.localeCompare(b)), [value, known]);
  const has = (c: string) => value.some((x) => x.toLowerCase() === c.toLowerCase());
  const toggle = (c: string) => onChange(has(c) ? value.filter((x) => x.toLowerCase() !== c.toLowerCase()) : [...value, c].slice(0, 8));
  const add = () => {
    const c = cleanTitle(text, 30);
    if (!c) return;
    if (!has(c)) onChange([...value, c].slice(0, 8));
    setText("");
  };
  return (
    <Menu open={open} onClose={onClose} anchor={anchor} width={260} label="Categories" keyboard={false}>
      <div className="px-1.5 pt-1 pb-1.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-line/15 pl-2.5 pr-1 h-9 focus-within:ring-2 focus-within:ring-amber">
          <TagIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            maxLength={30}
            placeholder="New category"
            aria-label="New category"
            className="flex-1 min-w-0 bg-transparent text-[13px] outline-none"
            autoFocus
          />
          <button type="button" onClick={add} disabled={!cleanTitle(text, 30) || value.length >= 8} aria-label="Add category" className="w-7 h-7 rounded-md bg-amber text-white flex items-center justify-center disabled:opacity-35">
            <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
      {all.length > 0 ? (
        <div className="max-h-[240px] overflow-y-auto overflow-x-hidden styled-scroll">
          {all.map((c) => {
            const t = categoryTone(c);
            return (
              <button key={c} type="button" role="menuitemcheckbox" aria-checked={has(c)} onClick={() => toggle(c)} className={itemCls}>
                <span className="w-3 h-3 rounded-[4px] flex-shrink-0" style={{ background: t.fill }} aria-hidden />
                <span className="flex-1 min-w-0 truncate">{c}</span>
                {has(c) && <CheckIcon className="w-4 h-4 text-amber flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="px-3 pb-2.5 text-[12px] text-ink-faint">Categories group to-dos across lists: Filming, Errands, Ideas…</p>
      )}
      {value.length >= 8 && <p className="px-3 pb-2 text-[11.5px] text-ink-faint">Eight at most.</p>}
    </Menu>
  );
}

export function MoveMenu({ open, onClose, anchor, lists, current, onPick }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; lists: TodoList[]; current: string | null; onPick: (listId: string | null) => void }) {
  const pick = (id: string | null) => {
    onPick(id);
    onClose();
  };
  return (
    <Menu open={open} onClose={onClose} anchor={anchor} width={250} label="Move to">
      <div className="px-3 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Move to</div>
      <MenuItem icon={<HomeIcon className={iconCls} />} label="Tasks" checked={current === null ? true : undefined} onClick={() => pick(null)} />
      {lists.map((l) => (
        <MenuItem key={l.id} icon={l.emoji ? <span className="w-4 text-center flex-shrink-0">{l.emoji}</span> : <ListBulletIcon className={iconCls} />} label={l.name} checked={current === l.id ? true : undefined} onClick={() => pick(l.id)} />
      ))}
    </Menu>
  );
}

export function SortMenu({ open, onClose, anchor, sort, onSort }: { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement | null>; sort: Sort; onSort: (s: Sort) => void }) {
  const pick = (s: Sort) => {
    onSort(s);
    onClose();
  };
  const options: SortBy[] = ["importance", "due", "alpha", "created"];
  return (
    <Menu open={open} onClose={onClose} anchor={anchor} width={240} align="right" label="Sort by">
      <div className="px-3 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">Sort by</div>
      {options.map((by) => (
        <MenuItem key={by} icon={<SortIcon className={iconCls} />} label={SORT_LABEL[by]} checked={sort.by === by ? true : undefined} onClick={() => pick({ by, dir: "asc" })} />
      ))}
      {sort.by !== "custom" && (
        <>
          <Divider />
          <MenuItem icon={<SortIcon className={iconCls} />} label="Reverse the order" onClick={() => pick({ by: sort.by, dir: sort.dir === "asc" ? "desc" : "asc" })} />
          <MenuItem icon={<CloseIcon className={iconCls} />} label="Back to your order" onClick={() => pick({ by: "custom", dir: "asc" })} />
        </>
      )}
    </Menu>
  );
}

// ---------------------------------------------------------------------------
// A to-do's own menu (right-click on a row)
// ---------------------------------------------------------------------------

export type RowActions = {
  toggleMyDay: () => void;
  toggleImportant: () => void;
  toggleDone: () => void;
  setDue: (day: string | null) => void;
  move: (listId: string | null) => void;
  remove: () => void;
};

/** Where the pointer was: the menu opens there (a 1×1 box stands in for a button). */
export function PointMenu({ at, onClose, t, today, lists, act }: { at: { x: number; y: number }; onClose: () => void; t: TodoItem; today: string; lists: TodoList[]; act: RowActions }) {
  const point = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<"main" | "date" | "move">("main");
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <>
      <span ref={point} aria-hidden className="fixed w-px h-px pointer-events-none" style={{ left: at.x, top: at.y }} />
      <Menu open onClose={onClose} anchor={point} width={mode === "date" ? 320 : 260} label={t.title} keyboard={mode !== "date"}>
        {mode === "date" ? (
          <div className="px-1.5 pb-1.5">
            <BackHead title="Pick a date" onBack={() => setMode("main")} />
            <MonthCalendar value={t.dueDate} autoFocus onPick={(d) => run(() => act.setDue(d))()} onEscape={onClose} />
          </div>
        ) : mode === "move" ? (
          <>
            <BackHead title="Move to" onBack={() => setMode("main")} />
            <MenuItem icon={<HomeIcon className={iconCls} />} label="Tasks" checked={t.listId === null ? true : undefined} onClick={run(() => act.move(null))} />
            {lists.map((l) => (
              <MenuItem key={l.id} icon={l.emoji ? <span className="w-4 text-center flex-shrink-0">{l.emoji}</span> : <ListBulletIcon className={iconCls} />} label={l.name} checked={t.listId === l.id ? true : undefined} onClick={run(() => act.move(l.id))} />
            ))}
          </>
        ) : (
          <>
            <MenuItem icon={<SunIcon className={iconCls} />} label={t.myDay === today ? "Remove from My Day" : "Add to My Day"} onClick={run(act.toggleMyDay)} />
            <MenuItem icon={<StarIcon className={iconCls} filled={t.important} />} label={t.important ? "Remove importance" : "Mark as important"} onClick={run(act.toggleImportant)} />
            <MenuItem icon={<CheckIcon className={iconCls} />} label={t.doneAt ? "Mark as not completed" : "Mark as completed"} onClick={run(act.toggleDone)} />
            <Divider />
            <MenuItem icon={<CalendarIcon className={iconCls} />} label="Due today" hint={dayWord(today, today) === "Today" ? new Date(`${today}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : undefined} onClick={run(() => act.setDue(today))} />
            <MenuItem icon={<CalendarIcon className={iconCls} />} label="Due tomorrow" hint={new Date(`${addDays(today, 1)}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })} onClick={run(() => act.setDue(addDays(today, 1)))} />
            <MenuItem icon={<CalendarIcon className={iconCls} />} label="Pick a date" onClick={() => setMode("date")} />
            {t.dueDate && <MenuItem icon={<CloseIcon className={iconCls} />} label="Remove due date" onClick={run(() => act.setDue(null))} />}
            <Divider />
            <MenuItem icon={<ArrowRightIcon className={iconCls} />} label="Move to…" onClick={() => setMode("move")} />
            <Divider />
            <MenuItem danger icon={<TrashIcon className="w-4 h-4 flex-shrink-0" />} label="Delete" onClick={run(act.remove)} />
          </>
        )}
      </Menu>
    </>
  );
}
