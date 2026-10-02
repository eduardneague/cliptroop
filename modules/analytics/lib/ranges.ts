/** Date ranges for Analytics (shared by the page and the server). */

export const RANGES = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "28d", label: "28 days", days: 28 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "12 months", days: 365 },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];
export const TABS = ["production", "audience", "content", "revenue"] as const;
export type TabId = (typeof TABS)[number];

export const readRange = (v: unknown): RangeId => (RANGES.some((r) => r.id === v) ? (v as RangeId) : "28d");
export const readTab = (v: unknown): TabId => (TABS.includes(v as TabId) ? (v as TabId) : "production");

const DAY = 86_400_000;
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const dayList = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

/** "Today" in a time zone, as YYYY-MM-DD. */
export function todayIn(tz: string, at = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}
/** The day a moment falls on, in a time zone. */
export const dayIn = (iso: string, tz: string) => todayIn(tz, new Date(iso));

export type Window = { from: string; to: string; prevFrom: string; prevTo: string; days: number };

/** The range ending on `to` (inclusive), and the same length just before it. */
export function windowFor(range: RangeId, to: string): Window {
  const days = RANGES.find((r) => r.id === range)!.days;
  const from = addDays(to, -(days - 1));
  return { from, to, prevFrom: addDays(from, -days), prevTo: addDays(from, -1), days };
}

/** Buckets for charts: days up to a month, weeks (from Monday) up to ~4 months, then months. */
export type Bucket = { key: string; label: string; from: string; to: string };
export function bucketsFor(w: Window): Bucket[] {
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
  if (w.days <= 31) return dayList(w.from, w.to).map((d) => ({ key: d, label: fmt(d, { month: "short", day: "numeric" }), from: d, to: d }));
  if (w.days <= 120) {
    const out: Bucket[] = [];
    // Weeks start on Monday; the first and last weeks are cut to the range.
    let start = w.from;
    while (start <= w.to) {
      const dow = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7;
      const end = addDays(start, 6 - dow) < w.to ? addDays(start, 6 - dow) : w.to;
      out.push({ key: start, label: fmt(start, { month: "short", day: "numeric" }), from: start, to: end });
      start = addDays(end, 1);
    }
    return out;
  }
  const out: Bucket[] = [];
  let start = w.from;
  while (start <= w.to) {
    const [y, m] = start.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const end = monthEnd < w.to ? monthEnd : w.to;
    out.push({ key: start.slice(0, 7), label: `${fmt(start, { month: "short" })} ’${String(y).slice(2)}`, from: start, to: end });
    start = addDays(end, 1);
  }
  return out;
}

export const bucketOf = (buckets: Bucket[], day: string) => buckets.find((b) => day >= b.from && day <= b.to)?.key ?? null;
