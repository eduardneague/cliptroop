// 1.53.0: To Do's model (modules/todo/lib/model.ts): the days, how a to-do repeats and when the next one is due,
// which to-dos each list shows, sorting, Planned's groups, My Day's suggestions, search, and the checks every input
// goes through before it's saved.
import {
  addDays,
  addMonths,
  belongs,
  cleanCategories,
  cleanPrefs,
  cleanRepeat,
  cleanSort,
  dayGroup,
  dayWord,
  DEFAULT_PREFS,
  firstDue,
  isDay,
  matches,
  momentOf,
  nextDue,
  nextMonday,
  nextOccurrence,
  openCounts,
  repeatWord,
  shiftReminder,
  sortTodos,
  suggestionsFor,
  todoHref,
  weekday,
  type TodoItem,
  type TodoList,
} from "../modules/todo/lib/model";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// --- Days ---------------------------------------------------------------------------------------------------------------
eq(addDays("2026-11-30", 1), "2026-12-01", "a day on, into the next month");
eq(addDays("2026-03-01", -1), "2026-02-28", "a day back, into February");
eq(addMonths("2026-01-31", 1), "2026-02-28", "a month on from the 31st: the month's last day");
eq(addMonths("2024-02-29", 12), "2025-02-28", "a year on from Feb 29");
eq(weekday("2026-11-16"), 1, "Nov 16 2026 is a Monday");
eq(nextMonday("2026-11-16"), "2026-11-23", "Next week from a Monday: the next Monday");
eq(nextMonday("2026-11-22"), "2026-11-23", "Next week from a Sunday: tomorrow");
ok(isDay("2026-11-16") && !isDay("2026-02-30") && !isDay("16/11/2026") && !isDay(null), "a day is a real yyyy-mm-dd");
eq(dayWord("2026-11-16", "2026-11-16"), "Today", "today");
eq(dayWord("2026-11-17", "2026-11-16"), "Tomorrow", "tomorrow");
eq(dayWord("2026-11-15", "2026-11-16"), "Yesterday", "yesterday");
eq(dayWord("2026-11-20", "2026-11-16"), "Fri", "this week: the weekday");
eq(dayWord("2027-01-05", "2026-11-16"), "Jan 5, 2027", "next year: with the year");
const m = momentOf("2026-11-17", "09:30");
ok(!!m && new Date(m).getHours() === 9 && new Date(m).getMinutes() === 30, "a day and a time → that moment in the person's own time");
ok(momentOf("2026-11-17", "25:00") === null && momentOf("nope", "09:00") === null, "a wrong time or day → nothing");

// --- Repeating ----------------------------------------------------------------------------------------------------------
eq(cleanRepeat({ every: 2, unit: "week", days: [3, 1, 1, 9] }), { every: 2, unit: "week", days: [1, 3] }, "weekdays cleaned: each once, Monday first, real ones only");
eq(cleanRepeat({ every: 0, unit: "day" }), null, "every 0: no repeat");
eq(cleanRepeat({ every: 1, unit: "fortnight" }), null, "an unknown unit: no repeat");
eq(cleanRepeat([1]), null, "not an object: no repeat");
eq(cleanRepeat({ every: 3, unit: "month", days: [1] }), { every: 3, unit: "month" }, "days only for weekly ones");
eq(repeatWord({ every: 1, unit: "week", days: [1, 2, 3, 4, 5] }), "Weekdays", "Weekdays by name");
eq(repeatWord({ every: 2, unit: "week", days: [1, 3] }), "Every 2 weeks on Mon, Wed", "every 2 weeks on days");
eq(repeatWord({ every: 1, unit: "month" }), "Monthly", "monthly");
eq(repeatWord({ every: 3, unit: "day" }), "Every 3 days", "every 3 days");

const today = "2026-11-16"; // a Monday
eq(nextDue({ every: 1, unit: "day" }, "2026-11-16", today), "2026-11-17", "daily: tomorrow");
eq(nextDue({ every: 1, unit: "day" }, "2026-11-10", today), "2026-11-16", "daily, finished late: due today, not in the past");
eq(nextDue({ every: 1, unit: "week", days: [1, 2, 3, 4, 5] }, "2026-11-20", "2026-11-20"), "2026-11-23", "weekdays from a Friday: Monday");
eq(nextDue({ every: 1, unit: "week", days: [1, 3] }, "2026-11-16", today), "2026-11-18", "Mon and Wed from a Monday: Wednesday");
eq(nextDue({ every: 2, unit: "week", days: [1, 3] }, "2026-11-18", "2026-11-18"), "2026-11-30", "every 2 weeks on Mon, Wed from a Wednesday: Monday two weeks on");
eq(nextDue({ every: 1, unit: "week" }, "2026-11-16", today), "2026-11-23", "weekly: a week on");
eq(nextDue({ every: 1, unit: "month" }, "2026-01-31", "2026-01-31"), "2026-02-28", "monthly from Jan 31: Feb 28");
eq(nextDue({ every: 1, unit: "year" }, "2026-11-16", today), "2027-11-16", "yearly");
eq(firstDue({ every: 1, unit: "week", days: [1, 2, 3, 4, 5] }, "2026-11-21"), "2026-11-23", "weekdays set on a Saturday: due Monday");
eq(firstDue({ every: 1, unit: "day" }, today), today, "daily set today: due today");
const r = shiftReminder("2026-11-16T07:00:00.000Z", "2026-11-16", "2026-11-18");
ok(Date.parse(r) - Date.parse("2026-11-16T07:00:00.000Z") === 2 * 86_400_000 || Math.abs(Date.parse(r) - Date.parse("2026-11-18T07:00:00.000Z")) <= 3_600_000, "the next one's reminder: the same time, as many days on as the due day moved");

const item = (p: Partial<TodoItem>): TodoItem => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  title: "A to-do",
  notes: null,
  listId: null,
  important: false,
  priority: 0,
  myDay: null,
  dueDate: null,
  remindAt: null,
  repeat: null,
  categories: [],
  position: 0,
  doneAt: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  steps: [],
  ...p,
});
eq(nextOccurrence(item({ repeat: null }), today), null, "doesn't repeat: no next one");
eq(nextOccurrence(item({ repeat: { every: 1, unit: "day" }, dueDate: null }), today), { dueDate: "2026-11-17", remindAt: null }, "repeats with no due day: from today");

// --- Lists, counts, sorting -----------------------------------------------------------------------------------------------
const L: TodoList = { id: "list-1", name: "Shoot", emoji: null, color: "blue", position: 1, sort: { by: "custom", dir: "asc" }, hideDone: false };
const all = [
  item({ id: "a", title: "Buy tape", myDay: today, position: 3 }),
  item({ id: "b", title: "apple", important: true, listId: "list-1", position: 1, dueDate: "2026-11-20" }),
  item({ id: "c", title: "Call Ana", myDay: "2026-11-15", dueDate: "2026-11-10", position: 2, createdAt: "2026-11-15T10:00:00.000Z" }),
  item({ id: "d", title: "Done one", doneAt: "2026-11-16T09:00:00.000Z", myDay: today, position: 0 }),
  item({ id: "e", title: "Reminded", remindAt: "2026-11-18T09:00:00.000Z", priority: 3, position: 4 }),
];
const prefs = DEFAULT_PREFS;
eq(all.filter((t) => belongs(t, "myday", today, prefs)).map((t) => t.id), ["a", "d"], "My Day: put there today (finished ones too); yesterday's don't stay");
eq(all.filter((t) => belongs(t, "myday", today, { ...prefs, dueToday: true })).map((t) => t.id), ["a", "d"], "due today joins My Day only when asked (none due today here)");
eq(all.filter((t) => belongs(t, "important", today, prefs)).map((t) => t.id), ["b"], "Important: starred");
eq(all.filter((t) => belongs(t, "planned", today, prefs)).map((t) => t.id), ["b", "c", "e"], "Planned: a due day or a reminder");
eq(all.filter((t) => belongs(t, "tasks", today, prefs)).map((t) => t.id), ["a", "c", "d", "e"], "Tasks: no list");
eq(all.filter((t) => belongs(t, "list-1", today, prefs)).map((t) => t.id), ["b"], "your list: its own");
ok(!all.some((t) => belongs(t, "assigned", today, prefs)), "Assigned to me holds no to-dos (it's the team's tasks)");
const c = openCounts(all, [L], today, prefs);
eq([c.myday, c.important, c.planned, c.tasks, c["list-1"]], [1, 1, 3, 3, 1], "open counts per list");

const open = all.filter((t) => !t.doneAt);
eq(sortTodos(open, { by: "custom", dir: "asc" }, true).map((t) => t.id), ["b", "c", "a", "e"], "your order, starred first");
eq(sortTodos(open, { by: "custom", dir: "asc" }, false).map((t) => t.id), ["b", "c", "a", "e"].sort((x, y) => open.find((t) => t.id === x)!.position - open.find((t) => t.id === y)!.position), "your order: positions");
eq(sortTodos(open, { by: "alpha", dir: "asc" }, true).map((t) => t.title), ["apple", "Buy tape", "Call Ana", "Reminded"], "alphabetically, whatever the capitals");
eq(sortTodos(open, { by: "due", dir: "asc" }, true).map((t) => t.id), ["c", "e", "b", "a"], "due date: soonest first (a reminder's day counts), none last");
eq(sortTodos(open, { by: "importance", dir: "asc" }, true).map((t) => t.id), ["b", "e", "c", "a"], "importance: starred, then priority");
eq(sortTodos(open, { by: "created", dir: "asc" }, true)[0].id, "c", "creation date: newest first");
eq(cleanSort({ by: "nonsense", dir: "up" }), { by: "custom", dir: "asc" }, "an unknown sort: your order");

eq([dayGroup("2026-11-10", today), dayGroup(today, today), dayGroup("2026-11-17", today), dayGroup("2026-11-22", today), dayGroup("2026-12-30", today)], ["earlier", "today", "tomorrow", "week", "later"], "Planned's groups");

const sug = suggestionsFor(all, today, prefs, Date.parse("2026-11-16T12:00:00.000Z"));
eq(sug.earlier.map((t) => t.id), ["c"], "suggested: left in yesterday's My Day");
ok(!sug.overdue.some((t) => t.id === "c"), "each suggested once (overdue too, but already in From earlier days)");
eq(sug.upcoming.map((t) => t.id), ["e", "b"], "suggested: coming up in the next week, soonest first");
ok(![...sug.earlier, ...sug.overdue, ...sug.today, ...sug.upcoming, ...sug.recent].some((t) => t.id === "a" || t.id === "d"), "nothing already in My Day, nothing finished");

ok(matches(item({ title: "Café run" }), "cafe"), "search ignores accents");
ok(matches(item({ title: "Gear", steps: [{ id: "s", todoId: "x", title: "Charge batteries", doneAt: null, position: 1 }] }), "gear batteries"), "search: every word, in the title or a step");
ok(!matches(item({ title: "Gear" }), "lens"), "search: no match");
ok(matches(item({ title: "x", categories: ["Filming"] }), "film"), "search finds categories");

// --- Checks ------------------------------------------------------------------------------------------------------------
eq(cleanCategories([" Filming ", "filming", "", "A".repeat(40), 3, "x", "y", "z", "w", "v", "u", "t"]), ["Filming", "A".repeat(30), "3", "x", "y", "z", "w", "v"], "categories: trimmed, each once, 30 characters, 8 at most");
const p = cleanPrefs({ sorts: { myday: { by: "due", dir: "desc" }, tasks: { by: "custom" }, nope: { by: "alpha" } }, hideDone: { planned: true, myday: "yes" }, confirmDone: true, starredOnTop: false, addOnTop: "no" });
eq(p.sorts, { myday: { by: "due", dir: "desc" } }, "settings: real sorts only (your order is the default, not stored)");
eq(p.hideDone, { planned: true }, "settings: hide finished only when true");
ok(p.starredOnTop === false && p.addOnTop === true && !("confirmDone" in p) && !("confirmDelete" in p), "settings: flags, or the defaults; the old ask-first ones are left out (1.53.3)");
eq(cleanPrefs("junk"), DEFAULT_PREFS, "settings that aren't settings: the defaults");
eq(todoHref("myday", "abc"), "/todo?list=myday&task=abc", "an address for a list and a to-do");
eq(todoHref(null), "/todo", "To Do itself");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("todo model: ok");
