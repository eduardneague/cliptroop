import { wordsOf } from "./text";

/**
 * Dates you can type in the search bar (1.26.0), for the calendar: today,
 * tomorrow, yesterday, a weekday ("friday", "next fri", "last monday"),
 * "in 3 days", "2 weeks ago", "oct 20", "20th october", "jan 5 2027",
 * "2026-10-20", a month ("november"), "this / next / last week" and
 * "this / next / last month". Words around them ("calendar", "shorts on",
 * "what's due") are fine. Days are YYYY-MM-DD in your own time.
 */

export type DateHit =
  | { kind: "day"; day: string; label: string }
  | { kind: "week"; day: string; label: string }
  | { kind: "month"; day: string; label: string };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
const FULL_MONTHS = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]);
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
/** Words that may sit around a date without changing it. */
const AROUND = new Set(["calendar", "cal", "on", "for", "the", "what", "whats", "due", "planned", "plan", "schedule", "scheduled", "shorts", "short", "videos", "video", "posts", "posting", "happening", "is", "at", "of", "go", "to", "open", "show", "me"]);

const DAY = 86_400_000;
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(toUtc(d) + n * DAY);
const weekday = (d: string) => new Date(toUtc(d)).getUTCDay();
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** This computer's today, YYYY-MM-DD. */
export function localToday(at = new Date()) {
  return ymd(at.getFullYear(), at.getMonth() + 1, at.getDate());
}

export function dayLabel(day: string, today: string) {
  const d = new Date(toUtc(day));
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}
const monthLabel = (day: string) => new Date(toUtc(day)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const mondayOf = (d: string) => addDays(d, -((weekday(d) + 6) % 7));

/** The one of last year's, this year's and next year's that's closest to today. */
function nearest(m: number, d: number, today: string): string | null {
  const y = Number(today.slice(0, 4));
  let best: string | null = null;
  for (const year of [y - 1, y, y + 1]) {
    if (d > daysIn(year, m)) continue;
    const c = ymd(year, m, d);
    if (!best || Math.abs(toUtc(c) - toUtc(today)) < Math.abs(toUtc(best) - toUtc(today))) best = c;
  }
  return best;
}

function dayNumber(w: string): number | null {
  const m = /^(\d{1,2})(st|nd|rd|th)?$/.exec(w);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 31 ? n : null;
}

function hit(kind: DateHit["kind"], day: string, today: string): DateHit {
  if (kind === "month") return { kind, day, label: monthLabel(day) };
  if (kind === "week") return { kind, day, label: `Week of ${dayLabel(day, today).replace(/^\w+, /, "")}` };
  return { kind, day, label: dayLabel(day, today) };
}

export function parseDate(q: string, today: string): DateHit | null {
  const all = wordsOf(q);
  const w = all.filter((x) => !AROUND.has(x));
  if (!w.length || w.length > 4) return null;
  const s = w.join(" ");

  if (s === "today" || s === "tonight" || s === "now") return hit("day", today, today);
  if (s === "tomorrow" || s === "tmr" || s === "tmrw" || s === "tomorow") return hit("day", addDays(today, 1), today);
  if (s === "yesterday") return hit("day", addDays(today, -1), today);
  if (s === "day after tomorrow") return hit("day", addDays(today, 2), today);

  // This / next / last week or month.
  const rel = /^(this|next|last|previous) (week|month)$/.exec(s);
  if (rel) {
    const step = rel[1] === "this" ? 0 : rel[1] === "next" ? 1 : -1;
    if (rel[2] === "week") return hit("week", addDays(mondayOf(today), 7 * step), today);
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7)) - 1 + step;
    const first = ymd(y + Math.floor(m / 12), (((m % 12) + 12) % 12) + 1, 1);
    return hit("month", first, today);
  }

  // A weekday: the coming one (today if it's today), "next" (after today), "last" (before today).
  const wd = /^(?:(this|next|last|previous) )?([a-z]+)$/.exec(s);
  // Alone, only the whole name ("fri" or "sun" could be the start of anything).
  if (wd && wd[2] in WEEKDAYS && (wd[1] || wd[2].length >= 6)) {
    const target = WEEKDAYS[wd[2]];
    const now = weekday(today);
    if (wd[1] === "last" || wd[1] === "previous") return hit("day", addDays(today, -(((now - target + 6) % 7) + 1)), today);
    const ahead = (target - now + 7) % 7;
    return hit("day", addDays(today, wd[1] === "next" && ahead === 0 ? 7 : ahead), today);
  }

  // "in 3 days", "in two weeks", "3 days ago".
  const span = /^(?:in )?([a-z0-9]+) (day|days|week|weeks)( ago)?$/.exec(s);
  if (span) {
    const n = /^\d+$/.test(span[1]) ? Number(span[1]) : NUMBERS[span[1]];
    if (n !== undefined && n <= 3660) {
      const days = n * (span[2].startsWith("week") ? 7 : 1) * (span[3] ? -1 : 1);
      if (span[3] || s.startsWith("in ")) return hit("day", addDays(today, days), today);
    }
  }

  // 2026-10-20 (or 2026 10 20 once the dashes are gone).
  const isoHit = /^(\d{4}) (\d{1,2}) (\d{1,2})$/.exec(s);
  if (isoHit) {
    const [y, m, d] = [Number(isoHit[1]), Number(isoHit[2]), Number(isoHit[3])];
    if (m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m) && y >= 2000 && y <= 2100) return hit("day", ymd(y, m, d), today);
    return null;
  }

  // "oct 20", "20 oct", "20th of october", optionally with a year; or a month alone.
  const parts = w.filter((x) => x !== "of");
  let month: number | null = null;
  let dayN: number | null = null;
  let year: number | null = null;
  for (const p of parts) {
    if (p in MONTHS && month === null) month = MONTHS[p];
    else if (/^\d{4}$/.test(p) && year === null) year = Number(p);
    else if (dayNumber(p) !== null && dayN === null) dayN = dayNumber(p);
    else return null;
  }
  if (month === null) return null;
  if (year !== null && (year < 2000 || year > 2100)) return null;
  if (dayN === null) {
    // A month alone: its whole name ("mar" could be the start of "Mara").
    if (year === null && !parts.some((p) => FULL_MONTHS.has(p))) return null;
    // That year's, else the one closest to today.
    const first = year !== null ? ymd(year, month, 1) : nearest(month, 1, today);
    return first ? hit("month", first, today) : null;
  }
  if (year !== null) return dayN <= daysIn(year, month) ? hit("day", ymd(year, month, dayN), today) : null;
  const d = nearest(month, dayN, today);
  return d ? hit("day", d, today) : null;
}
