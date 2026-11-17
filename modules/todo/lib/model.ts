/**
 * To Do (1.53.0): the model shared by the page, the widget, the quick panel and the server. No React, no database:
 * the shapes, the days, how a to-do repeats, which to-dos each list shows, how they sort, and the checks every input
 * goes through (the server runs them again before saving).
 *
 * The owner (Nov 16 2026): "i want a to do list that is the same functionality as microsoft to do ... The assigned to
 * me tab will be the actual tasks that we get in the tasks widget." So the lists are Microsoft To Do's: My Day,
 * Important, Planned, Assigned to me (the team's tasks for you, from the My tasks widget), Tasks (no list) and your own.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type RepeatUnit = "day" | "week" | "month" | "year";
/** Every `every` days / weeks / months / years; weekly ones on `days` (0 = Sunday … 6 = Saturday) when given. */
export type Repeat = { every: number; unit: RepeatUnit; days?: number[] };

export type TodoStep = { id: string; todoId: string; title: string; doneAt: string | null; position: number };

export type TodoItem = {
  id: string;
  title: string;
  notes: string | null;
  /** null: the Tasks list. */
  listId: string | null;
  important: boolean;
  /** 0 none, 1 low, 2 medium, 3 high (the widget's flags, 0053). */
  priority: number;
  /** The day it was put in My Day (it leaves My Day the next day). */
  myDay: string | null;
  dueDate: string | null;
  remindAt: string | null;
  repeat: Repeat | null;
  categories: string[];
  position: number;
  doneAt: string | null;
  createdAt: string;
  steps: TodoStep[];
};

export const LIST_COLORS = ["blue", "teal", "green", "amber", "orange", "red", "pink", "violet", "slate"] as const;
export type ListColor = (typeof LIST_COLORS)[number];

export type SortBy = "custom" | "importance" | "due" | "alpha" | "created";
export type SortDir = "asc" | "desc";
export type Sort = { by: SortBy; dir: SortDir };

export type TodoList = { id: string; name: string; emoji: string | null; color: ListColor; position: number; sort: Sort; hideDone: boolean };

/** A team task (Assigned to me) put in My Day, for that day. */
export type DayPin = { taskId: string; day: string };

export type SmartId = "myday" | "important" | "planned" | "assigned" | "tasks";
export const SMART: SmartId[] = ["myday", "important", "planned", "assigned", "tasks"];
/** A smart list's id, or one of your own lists' ids. */
export type ViewId = SmartId | string;
export const isSmart = (v: string): v is SmartId => (SMART as string[]).includes(v);

export type TodoPrefs = {
  /** How each smart list is sorted (your own lists keep theirs on the list). */
  sorts: Partial<Record<SmartId, Sort>>;
  /** Smart lists whose finished to-dos are hidden. */
  hideDone: Partial<Record<SmartId, boolean>>;
  /** New ones go on top (else at the bottom). */
  addOnTop: boolean;
  /** Starred ones first in a list kept in your own order. */
  starredOnTop: boolean;
  /** To-dos due today show in My Day by themselves. */
  dueToday: boolean;
};

/**
 * 1.53.3: no more "Ask before ticking off" / "Ask before deleting" (the owner: "when you check something, i dont want the
 * confirmation ... and whne you delete something, i want the same thing"): To Do ticks off and deletes at once, with an
 * Undo for a delete. What was saved for them is left out from now on.
 */
export const DEFAULT_PREFS: TodoPrefs = { sorts: {}, hideDone: {}, addOnTop: true, starredOnTop: true, dueToday: false };

export type TodoBoard = { lists: TodoList[]; todos: TodoItem[]; pins: DayPin[]; prefs: TodoPrefs; ready: boolean };

// ---------------------------------------------------------------------------
// Days (the person's own: the browser decides what "today" is)
// ---------------------------------------------------------------------------

export const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (day: string) => new Date(`${day}T00:00:00`);
export const addDays = (day: string, n: number) => {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
};
export const addMonths = (day: string, n: number) => {
  const d = parse(day);
  const dom = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return localDay(d);
};
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (day: string) => parse(day).getDay();
/** Monday first (0 = Monday … 6 = Sunday). */
const mondayIndex = (dow: number) => (dow + 6) % 7;
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY_RX.test(v) && !Number.isNaN(parse(v).getTime()) && localDay(parse(v)) === v;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (day: string, o: Intl.DateTimeFormatOptions) => parse(day).toLocaleDateString("en-US", o);

/** "Today" · "Tomorrow" · "Yesterday" · "Fri" (this week) · "Mon, Nov 9" (the past) · "Nov 30". */
export function dayWord(day: string, today: string) {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  if (day > today && day <= addDays(today, 6)) return fmt(day, { weekday: "short" });
  if (day < today) return fmt(day, { weekday: "short", month: "short", day: "numeric" });
  return fmt(day, day.slice(0, 4) === today.slice(0, 4) ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
/** The same, after another word: "Due today", "Overdue, yesterday", "Due Fri". */
export const dayWordAfter = (day: string, today: string) => dayWord(day, today).replace(/^(Today|Tomorrow|Yesterday)$/, (w) => w.toLowerCase());
/** "Monday, November 16" (My Day's heading, a tooltip). */
export const longDay = (day: string) => fmt(day, { weekday: "long", month: "long", day: "numeric" });

/** "9:00 AM" in the person's own time. */
export const timeWord = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
/** A reminder in a few words: "9:00 AM" (today), "Tomorrow, 9:00 AM", "Tue, Nov 17, 9:00 AM". */
export function reminderWord(iso: string, today: string) {
  const day = localDay(new Date(iso));
  const t = timeWord(iso);
  if (day === today) return t;
  if (day === addDays(today, 1)) return `Tomorrow, ${t}`;
  return `${fmt(day, { weekday: "short", month: "short", day: "numeric" })}, ${t}`;
}

// ---------------------------------------------------------------------------
// Quick picks (Microsoft To Do's menus)
// ---------------------------------------------------------------------------

/** The next Monday after today (Next week). */
export const nextMonday = (today: string) => addDays(today, 7 - mondayIndex(weekday(today)));

export function duePicks(today: string) {
  return [
    { key: "today", label: "Today", day: today, hint: fmt(today, { weekday: "short" }) },
    { key: "tomorrow", label: "Tomorrow", day: addDays(today, 1), hint: fmt(addDays(today, 1), { weekday: "short" }) },
    { key: "next-week", label: "Next week", day: nextMonday(today), hint: fmt(nextMonday(today), { weekday: "short" }) },
  ];
}

const at = (day: string, hour: number, minute = 0) => {
  const d = parse(day);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/** Later today (3 hours on, on the hour; only before 9 PM), Tomorrow 9 AM, Next week (Monday 9 AM). */
export function reminderPicks(now = new Date()) {
  const today = localDay(now);
  const later = new Date(now.getTime() + 3 * 3_600_000);
  later.setMinutes(0, 0, 0);
  const picks: { key: string; label: string; iso: string; hint: string }[] = [];
  if (localDay(later) === today && later.getHours() <= 21) picks.push({ key: "later", label: "Later today", iso: later.toISOString(), hint: timeWord(later.toISOString()) });
  const tomorrow = at(addDays(today, 1), 9);
  picks.push({ key: "tomorrow", label: "Tomorrow", iso: tomorrow.toISOString(), hint: `${fmt(localDay(tomorrow), { weekday: "short" })}, ${timeWord(tomorrow.toISOString())}` });
  const week = at(nextMonday(today), 9);
  picks.push({ key: "next-week", label: "Next week", iso: week.toISOString(), hint: `${fmt(localDay(week), { weekday: "short" })}, ${timeWord(week.toISOString())}` });
  return picks;
}

/** A day and "HH:MM" (the person's own time) → the moment. null when either is wrong. */
export function momentOf(day: string, time: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!isDay(day) || !m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return at(day, Number(m[1]), Number(m[2])).toISOString();
}

// ---------------------------------------------------------------------------
// Repeating
// ---------------------------------------------------------------------------

export const REPEAT_PICKS: { key: string; label: string; repeat: Repeat }[] = [
  { key: "daily", label: "Daily", repeat: { every: 1, unit: "day" } },
  { key: "weekdays", label: "Weekdays", repeat: { every: 1, unit: "week", days: [1, 2, 3, 4, 5] } },
  { key: "weekly", label: "Weekly", repeat: { every: 1, unit: "week" } },
  { key: "monthly", label: "Monthly", repeat: { every: 1, unit: "month" } },
  { key: "yearly", label: "Yearly", repeat: { every: 1, unit: "year" } },
];

/** A repeat from anywhere (a form, the database) → a clean one, or null. */
export function cleanRepeat(v: unknown): Repeat | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as { every?: unknown; unit?: unknown; days?: unknown };
  const unit = r.unit;
  if (unit !== "day" && unit !== "week" && unit !== "month" && unit !== "year") return null;
  const every = Math.floor(Number(r.every));
  if (!Number.isFinite(every) || every < 1 || every > 999) return null;
  if (unit !== "week" || !Array.isArray(r.days)) return { every, unit };
  const days = [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => mondayIndex(a) - mondayIndex(b));
  return days.length ? { every, unit, days } : { every, unit };
}

const sameDays = (a: number[] | undefined, b: number[]) => !!a && a.length === b.length && b.every((d) => a.includes(d));

/** "Daily" · "Weekdays" · "Weekly" · "Every 2 weeks on Mon, Wed" · "Monthly" · "Every 3 days". */
export function repeatWord(r: Repeat) {
  const unit = r.unit;
  if (unit === "week" && r.every === 1 && sameDays(r.days, [1, 2, 3, 4, 5])) return "Weekdays";
  const base = r.every === 1 ? { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[unit] : `Every ${r.every} ${unit}s`;
  if (unit === "week" && r.days?.length) return `${base} on ${r.days.map((d) => WEEKDAY_SHORT[d]).join(", ")}`;
  return base;
}

/** The first occurrence after `from` (exclusive). */
function nextOnce(r: Repeat, from: string): string {
  switch (r.unit) {
    case "day":
      return addDays(from, r.every);
    case "month":
      return addMonths(from, r.every);
    case "year":
      return addMonths(from, 12 * r.every);
    case "week": {
      if (!r.days?.length) return addDays(from, 7 * r.every);
      const fromM = mondayIndex(weekday(from));
      const marks = r.days.map(mondayIndex).sort((a, b) => a - b);
      const later = marks.find((m) => m > fromM);
      if (later !== undefined) return addDays(from, later - fromM);
      // On to the first day of the week `every` weeks on.
      return addDays(addDays(from, -fromM), 7 * r.every + marks[0]);
    }
  }
}

/**
 * When a repeating to-do is ticked off, the next one is due on the next occurrence after its due day, and never in the
 * past (a daily one finished three days late comes back due today, not three days ago).
 */
export function nextDue(r: Repeat, due: string, today: string): string {
  let n = nextOnce(r, due);
  for (let guard = 0; n < today && guard < 2000; guard++) n = nextOnce(r, n);
  return n;
}

/** Setting a repeat on a to-do with no due day: due today, or on the first day it repeats on (Weekdays on a Saturday: Monday). */
export function firstDue(r: Repeat, today: string): string {
  if (r.unit === "week" && r.days?.length && !r.days.includes(weekday(today))) return nextOnce(r, today);
  return today;
}

/** The reminder of the next one: the same time of day, as many days on as the due day moved. */
export function shiftReminder(iso: string, fromDay: string, toDay: string): string {
  const days = Math.round((parse(toDay).getTime() - parse(fromDay).getTime()) / 86_400_000);
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** What the next one of a repeating to-do gets when this one is ticked off (null: it doesn't repeat). */
export function nextOccurrence(t: Pick<TodoItem, "repeat" | "dueDate" | "remindAt">, today: string): { dueDate: string; remindAt: string | null } | null {
  if (!t.repeat) return null;
  const due = t.dueDate ?? today;
  const next = nextDue(t.repeat, due, today);
  return { dueDate: next, remindAt: t.remindAt ? shiftReminder(t.remindAt, due, next) : null };
}

// ---------------------------------------------------------------------------
// Which to-dos a list shows
// ---------------------------------------------------------------------------

export const inMyDay = (t: TodoItem, today: string, prefs: TodoPrefs) => t.myDay === today || (prefs.dueToday && !t.doneAt && t.dueDate === today);
/** Planned: a due day or a reminder. Its day: the due day, else the reminder's. */
export const plannedDay = (t: TodoItem): string | null => t.dueDate ?? (t.remindAt ? localDay(new Date(t.remindAt)) : null);

export function belongs(t: TodoItem, view: ViewId, today: string, prefs: TodoPrefs) {
  switch (view) {
    case "myday":
      return inMyDay(t, today, prefs);
    case "important":
      return t.important;
    case "planned":
      return !!plannedDay(t);
    case "assigned":
      return false;
    case "tasks":
      return t.listId === null;
    default:
      return t.listId === view;
  }
}

/** Open to-dos in each list (the sidebar's numbers). Team tasks are counted by the page. */
export function openCounts(todos: TodoItem[], lists: TodoList[], today: string, prefs: TodoPrefs) {
  const c: Record<string, number> = { myday: 0, important: 0, planned: 0, tasks: 0 };
  for (const l of lists) c[l.id] = 0;
  for (const t of todos) {
    if (t.doneAt) continue;
    if (inMyDay(t, today, prefs)) c.myday++;
    if (t.important) c.important++;
    if (plannedDay(t)) c.planned++;
    const k = t.listId ?? "tasks";
    if (k in c) c[k]++;
  }
  return c;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export const SORT_LABEL: Record<SortBy, string> = { custom: "Your order", importance: "Importance", due: "Due date", alpha: "Alphabetically", created: "Creation date" };
export const DEFAULT_SORT: Sort = { by: "custom", dir: "asc" };

/**
 * The order a list shows its open to-dos in. Your order: positions (starred first when you asked for that).
 * Importance: starred, then by priority. Due date: soonest first, none last. Creation date: newest first.
 */
export function sortTodos(items: TodoItem[], sort: Sort, starredOnTop: boolean): TodoItem[] {
  const by = (a: TodoItem, b: TodoItem) => a.position - b.position || a.createdAt.localeCompare(b.createdAt);
  const flip = sort.dir === "desc" ? -1 : 1;
  const list = [...items];
  switch (sort.by) {
    case "custom":
      return list.sort((a, b) => (starredOnTop ? Number(b.important) - Number(a.important) : 0) || by(a, b));
    case "importance":
      return list.sort((a, b) => flip * (Number(b.important) - Number(a.important) || b.priority - a.priority) || by(a, b));
    case "due":
      return list.sort((a, b) => {
        const x = plannedDay(a);
        const y = plannedDay(b);
        if (x === y) return by(a, b);
        if (!x) return 1;
        if (!y) return -1;
        return flip * x.localeCompare(y);
      });
    case "alpha":
      return list.sort((a, b) => flip * a.title.localeCompare(b.title, "en", { sensitivity: "base", numeric: true }) || by(a, b));
    case "created":
      return list.sort((a, b) => flip * b.createdAt.localeCompare(a.createdAt) || by(a, b));
  }
}

/** Finished ones: the latest first. */
export const sortDone = (items: TodoItem[]) => [...items].sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));

// ---------------------------------------------------------------------------
// Planned's groups and My Day's suggestions
// ---------------------------------------------------------------------------

export type DayGroup = "earlier" | "today" | "tomorrow" | "week" | "later";
export const DAY_GROUP_LABEL: Record<DayGroup, string> = { earlier: "Earlier", today: "Today", tomorrow: "Tomorrow", week: "This week", later: "Later" };
export function dayGroup(day: string, today: string): DayGroup {
  if (day < today) return "earlier";
  if (day === today) return "today";
  if (day === addDays(today, 1)) return "tomorrow";
  if (day <= addDays(today, 7)) return "week";
  return "later";
}

export type Suggestions = { earlier: TodoItem[]; overdue: TodoItem[]; today: TodoItem[]; upcoming: TodoItem[]; recent: TodoItem[] };

/**
 * My Day's suggestions (Microsoft To Do's lightbulb), each to-do once: left in an earlier My Day; overdue; due today;
 * due in the next week; added in the last two days.
 */
export function suggestionsFor(todos: TodoItem[], today: string, prefs: TodoPrefs, now = Date.now()): Suggestions {
  const open = todos.filter((t) => !t.doneAt && !inMyDay(t, today, prefs));
  const used = new Set<string>();
  const take = (pick: (t: TodoItem) => boolean, order: (a: TodoItem, b: TodoItem) => number, max = 12) => {
    const out = open.filter((t) => !used.has(t.id) && pick(t)).sort(order).slice(0, max);
    out.forEach((t) => used.add(t.id));
    return out;
  };
  const byDue = (a: TodoItem, b: TodoItem) => (plannedDay(a) ?? "").localeCompare(plannedDay(b) ?? "");
  const newest = (a: TodoItem, b: TodoItem) => b.createdAt.localeCompare(a.createdAt);
  const earlier = take((t) => !!t.myDay && t.myDay < today, (a, b) => (b.myDay ?? "").localeCompare(a.myDay ?? ""));
  const overdue = take((t) => !!t.dueDate && t.dueDate < today, byDue);
  const dueToday = take((t) => t.dueDate === today || (!!t.remindAt && localDay(new Date(t.remindAt)) === today), byDue);
  const upcoming = take((t) => !!plannedDay(t) && plannedDay(t)! > today && plannedDay(t)! <= addDays(today, 7), byDue, 8);
  const recent = take((t) => now - Date.parse(t.createdAt) < 2 * 86_400_000, newest, 8);
  return { earlier, overdue, today: dueToday, upcoming, recent };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Lowercase, without accents (so "cafe" finds "Café"). */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Every word of the search in the title, the note, a step or a category. */
export function matches(t: TodoItem, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const hay = fold([t.title, t.notes ?? "", ...t.steps.map((s) => s.title), ...t.categories].join("\n"));
  return words.every((w) => hay.includes(w));
}

// ---------------------------------------------------------------------------
// Checks (the page before sending, the server before saving)
// ---------------------------------------------------------------------------

export const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const cleanTitle = (v: unknown, max = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
export const cleanNotes = (v: unknown) => {
  const s = String(v ?? "").replace(/\r\n?/g, "\n");
  return s.trim() ? s.slice(0, 4000) : null;
};
export const cleanColor = (v: unknown): ListColor => ((LIST_COLORS as readonly string[]).includes(String(v)) ? (v as ListColor) : "blue");
export const cleanEmoji = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s && s.length <= 16 && !/\s/.test(s) ? s : null;
};
export const cleanMoment = (v: unknown): string | null => {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
/** Up to 8 categories, 30 characters each, each once (whatever the capitals). */
export function cleanCategories(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    const c = cleanTitle(raw, 30);
    if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
    if (out.length === 8) break;
  }
  return out;
}
export const cleanSort = (v: unknown): Sort => {
  const s = (v ?? {}) as { by?: unknown; dir?: unknown };
  const by = (["custom", "importance", "due", "alpha", "created"] as const).find((x) => x === s.by) ?? "custom";
  return { by, dir: s.dir === "desc" ? "desc" : "asc" };
};
export function cleanPrefs(v: unknown): TodoPrefs {
  const p = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const sorts: TodoPrefs["sorts"] = {};
  const hideDone: TodoPrefs["hideDone"] = {};
  const rawSorts = (p.sorts ?? {}) as Record<string, unknown>;
  const rawHide = (p.hideDone ?? {}) as Record<string, unknown>;
  for (const k of SMART) {
    if (rawSorts && typeof rawSorts === "object" && rawSorts[k]) {
      const s = cleanSort(rawSorts[k]);
      if (s.by !== "custom" || s.dir !== "asc") sorts[k] = s;
    }
    if (rawHide && typeof rawHide === "object" && rawHide[k] === true) hideDone[k] = true;
  }
  const flag = (k: keyof TodoPrefs) => (typeof p[k] === "boolean" ? (p[k] as boolean) : (DEFAULT_PREFS[k] as boolean));
  return { sorts, hideDone, addOnTop: flag("addOnTop"), starredOnTop: flag("starredOnTop"), dueToday: flag("dueToday") };
}

/** A list's colour as CSS: fills, borders and icons (`fill`), words (`text`, the shade that reads on cards). */
export function listColor(c: ListColor) {
  if (c === "slate") return { fill: "rgb(var(--ink-soft))", text: "rgb(var(--ink-soft))", tint: "rgb(var(--ink-soft) / 0.1)" };
  const v = c === "orange" ? "coral" : c;
  return { fill: `rgb(var(--${v}))`, text: `rgb(var(--${v}-text))`, tint: `rgb(var(--${v}) / 0.12)` };
}

/** Where a view lives: /todo?list=… (and a to-do's details: &task=…). */
export function todoHref(view?: ViewId | null, task?: string | null) {
  const q = new URLSearchParams();
  if (view) q.set("list", view);
  if (task) q.set("task", task);
  const s = q.toString();
  return s ? `/todo?${s}` : "/todo";
}
