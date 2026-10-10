/**
 * Periods for objectives: a day, a week (Monday to Sunday), a month, a
 * quarter or a year, in the team's time zone. Every date is a plain
 * YYYY-MM-DD string (worked out with UTC arithmetic, so the same on the
 * server and in any browser). Pure: shared by the server and the browser.
 */

export const PERIODS = ["day", "week", "month", "quarter", "year"] as const;
export type PeriodKind = (typeof PERIODS)[number];
export const isPeriodKind = (v: unknown): v is PeriodKind => typeof v === "string" && (PERIODS as readonly string[]).includes(v);

/** "every week" */
export const EVERY: Record<PeriodKind, string> = { day: "every day", week: "every week", month: "every month", quarter: "every quarter", year: "every year" };
/** "Week", for pickers. */
export const PERIOD_NAME: Record<PeriodKind, string> = { day: "Day", week: "Week", month: "Month", quarter: "Quarter", year: "Year" };
/** "Weekly", for lists. */
export const CADENCE: Record<PeriodKind, string> = { day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" };
/** "this week" */
export const THIS: Record<PeriodKind, string> = { day: "today", week: "this week", month: "this month", quarter: "this quarter", year: "this year" };
/** How many periods the history shows (the current one included). */
export const HISTORY: Record<PeriodKind, number> = { day: 14, week: 12, month: 12, quarter: 8, year: 3 };

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => day(ms(d) + n * DAY_MS);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY_MS);

function addMonths(start: string, n: number) {
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy).padStart(4, "0")}-${String(mm + 1).padStart(2, "0")}-01`;
}

/** The first day of the period `d` falls in. */
export function periodStart(kind: PeriodKind, d: string): string {
  switch (kind) {
    case "day":
      return d;
    case "week": {
      const dow = (new Date(ms(d)).getUTCDay() + 6) % 7; // Monday = 0
      return addDays(d, -dow);
    }
    case "month":
      return `${d.slice(0, 7)}-01`;
    case "quarter": {
      const m = Number(d.slice(5, 7));
      return `${d.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
    }
    case "year":
      return `${d.slice(0, 4)}-01-01`;
  }
}

/** True when `d` is where one of this kind's periods starts (a Monday for weeks, the 1st for months…). */
export const isPeriodStart = (kind: PeriodKind, d: string) => isDay(d) && periodStart(kind, d) === d;

/** The start of the period `n` periods after (or before, negative) the one starting at `start`. */
export function shiftPeriod(kind: PeriodKind, start: string, n: number): string {
  switch (kind) {
    case "day":
      return addDays(start, n);
    case "week":
      return addDays(start, 7 * n);
    case "month":
      return addMonths(start, n);
    case "quarter":
      return addMonths(start, 3 * n);
    case "year":
      return addMonths(start, 12 * n);
  }
}

/** The period's last day. */
export const periodEnd = (kind: PeriodKind, start: string) => addDays(shiftPeriod(kind, start, 1), -1);
/** How many days it has. */
export const periodDays = (kind: PeriodKind, start: string) => daysBetween(start, periodEnd(kind, start)) + 1;

/** The last `count` periods up to the one containing `today`, oldest first. */
export function recentPeriods(kind: PeriodKind, today: string, count: number): string[] {
  const cur = periodStart(kind, today);
  return Array.from({ length: Math.max(1, count) }, (_, i) => shiftPeriod(kind, cur, i - Math.max(1, count) + 1));
}

/** The next `count` periods from the one containing `today` (that one first). */
export function upcomingPeriods(kind: PeriodKind, today: string, count: number): string[] {
  const cur = periodStart(kind, today);
  return Array.from({ length: Math.max(1, count) }, (_, i) => shiftPeriod(kind, cur, i));
}

// ---------------------------------------------------------------------------
// Words (always the app's English, in UTC on the plain date: identical on the
// server and in every browser, so nothing changes when the page comes alive)
// ---------------------------------------------------------------------------

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(ms(d)).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });

/** "This week", "Last week", "Week of Sep 28"; "October", "October 2025"; "Q3 2026"; "2025"; "Today", "Mon, Oct 5". */
export function periodLabel(kind: PeriodKind, start: string, today: string): string {
  const cur = periodStart(kind, today);
  const prev = shiftPeriod(kind, cur, -1);
  const next = shiftPeriod(kind, cur, 1);
  const sameYear = start.slice(0, 4) === today.slice(0, 4);
  switch (kind) {
    case "day":
      if (start === cur) return "Today";
      if (start === prev) return "Yesterday";
      if (start === next) return "Tomorrow";
      return fmt(start, { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
    case "week":
      if (start === cur) return "This week";
      if (start === prev) return "Last week";
      if (start === next) return "Next week";
      return `Week of ${fmt(start, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })}`;
    case "month":
      if (start === cur) return "This month";
      if (start === prev) return "Last month";
      if (start === next) return "Next month";
      return fmt(start, { month: "long", ...(sameYear ? {} : { year: "numeric" }) });
    case "quarter": {
      if (start === cur) return "This quarter";
      if (start === prev) return "Last quarter";
      if (start === next) return "Next quarter";
      return `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1} ${start.slice(0, 4)}`;
    }
    case "year":
      if (start === cur) return "This year";
      if (start === prev) return "Last year";
      if (start === next) return "Next year";
      return start.slice(0, 4);
  }
}

/** The dates it covers: "Oct 5 to 11", "Sep 28 to Oct 4", "October 2026", "Jul to Sep 2026", "2026", "Mon, Oct 5". */
export function periodRange(kind: PeriodKind, start: string): string {
  const end = periodEnd(kind, start);
  switch (kind) {
    case "day":
      return fmt(start, { weekday: "short", month: "short", day: "numeric" });
    case "week":
      return start.slice(0, 7) === end.slice(0, 7)
        ? `${fmt(start, { month: "short", day: "numeric" })} to ${fmt(end, { day: "numeric" })}`
        : `${fmt(start, { month: "short", day: "numeric" })} to ${fmt(end, { month: "short", day: "numeric" })}`;
    case "month":
      return fmt(start, { month: "long", year: "numeric" });
    case "quarter":
      return `${fmt(start, { month: "short" })} to ${fmt(end, { month: "short" })} ${start.slice(0, 4)}`;
    case "year":
      return start.slice(0, 4);
  }
}

/** A short tick for charts: "Oct 5" (days and weeks), "Oct", "Q4", "2026". */
export function periodTick(kind: PeriodKind, start: string): string {
  switch (kind) {
    case "day":
      return fmt(start, { month: "short", day: "numeric" });
    case "week":
      return fmt(start, { month: "short", day: "numeric" });
    case "month":
      return fmt(start, { month: "short" });
    case "quarter":
      return `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1}`;
    case "year":
      return start.slice(0, 4);
  }
}

// ---------------------------------------------------------------------------
// Where we are in a period (the team's time zone)
// ---------------------------------------------------------------------------

export type LocalNow = { day: string; minutes: number };

/** Today's date and the minute of the day in a time zone. */
export function localNow(tz: string, at: number = Date.now()): LocalNow {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return { day: `${get("year")}-${get("month")}-${get("day")}`, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
  } catch {
    const d = new Date(at);
    return { day: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }
}

/** The day a moment falls on in a time zone. */
export const dayInZone = (iso: string, tz: string) => localNow(tz, Date.parse(iso)).day;

/**
 * How much of the period has gone by, 0 to 1. `lagDays`: numbers that arrive
 * late (platform stats, copied each morning for the day before) only cover
 * the period up to that many days ago.
 */
export function elapsed(kind: PeriodKind, start: string, now: LocalNow, lagDays = 0): number {
  const total = periodDays(kind, start);
  const done = daysBetween(start, now.day) + now.minutes / 1440 - lagDays;
  return Math.max(0, Math.min(1, done / total));
}

/**
 * A period's label inside a sentence: "this week", "yesterday", "for the week
 * of Sep 21", "for October", "on Thu, Oct 8", "for Q2 2026".
 */
export function periodPhrase(label: string): string {
  const l = label.toLowerCase();
  if (/^(this|last|next) /.test(l) || l === "today" || l === "yesterday" || l === "tomorrow") return l;
  if (l.startsWith("week of ")) return `for the week of ${label.slice(8)}`;
  if (/^(mon|tue|wed|thu|fri|sat|sun),/.test(l)) return `on ${label}`;
  return `for ${label}`;
}

/** "until midnight" (a day), "last day", "3 days left". */
export function timeLeft(kind: PeriodKind, days: number): string {
  if (kind === "day") return "until midnight";
  return days <= 1 ? "last day" : `${days} days left`;
}

/** Days left in the period, today included (0 once it's over). */
export function daysLeft(kind: PeriodKind, start: string, today: string): number {
  const end = periodEnd(kind, start);
  if (today > end) return 0;
  return daysBetween(today < start ? start : today, end) + 1;
}
