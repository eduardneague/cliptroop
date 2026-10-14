/** Date ranges for Analytics (shared by the page and the server). */

/**
 * The ranges (1.20.0). 48 hours only where there are counts within minutes
 * (the Overview: hour by hour from the live job); lifetime runs from the
 * first day with numbers; custom from / to are picked (`?from=&to=`).
 */
export const RANGES = [
  { id: "48h", label: "48 hours", days: 2 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "28d", label: "28 days", days: 28 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "365 days", days: 365 },
  { id: "lifetime", label: "Lifetime", days: 0 },
  { id: "custom", label: "Custom", days: 0 },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];
export const TABS = ["overview", "content", "audience", "realtime", "revenue", "insights", "advanced", "production"] as const;
export type TabId = (typeof TABS)[number];

/** The ranges each tab offers (Realtime has its own 48 hours; 48 hours is the Overview's). */
export function rangesFor(tab: TabId): RangeId[] {
  if (tab === "realtime") return [];
  return RANGES.map((r) => r.id).filter((id) => id !== "48h" || tab === "overview");
}
export const rangeLabel = (id: RangeId) => RANGES.find((r) => r.id === id)!.label;

export const readRange = (v: unknown, tab?: TabId): RangeId => {
  const id = RANGES.some((r) => r.id === v) ? (v as RangeId) : "28d";
  return tab && !rangesFor(tab).includes(id) && tab !== "realtime" ? (id === "48h" ? "7d" : "28d") : id;
};
export const readTab = (v: unknown): TabId => (TABS.includes(v as TabId) ? (v as TabId) : "overview");

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: unknown): d is string => typeof d === "string" && ISO.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
/** Custom dates from the address: both real days, from ≤ to ≤ `latest`, at most 10 years. Null otherwise. */
export function readCustom(from: unknown, to: unknown, latest: string): { from: string; to: string } | null {
  if (!validDay(from) || !validDay(to)) return null;
  const end = to > latest ? latest : to;
  if (from > end || daysBetween(from, end) > 3660) return null;
  return { from, to: end };
}
/** Advanced: which platform (none = the first with numbers) and which videos. */
export const ADV_PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;
export type AdvPlatform = (typeof ADV_PLATFORMS)[number];
export const readAdvPlatform = (v: unknown): AdvPlatform | null => (ADV_PLATFORMS.includes(v as AdvPlatform) ? (v as AdvPlatform) : null);
export const readAdvContent = (v: unknown): "all" | "shorts" | "long" => (v === "shorts" || v === "long" ? v : "all");

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

/** `lifetime`: the Lifetime range (from the first day with numbers): splits then use the platforms' whole-life snapshots. */
export type Window = { from: string; to: string; prevFrom: string; prevTo: string; days: number; lifetime?: boolean };

/**
 * The range ending on `to` (inclusive), and the same length just before it.
 * Lifetime and custom start on `start` (the first day with numbers / the
 * picked day); without one, lifetime is the last 365 days and custom 28.
 */
export function windowFor(range: RangeId, to: string, start?: string | null): Window {
  const fixed = RANGES.find((r) => r.id === range)!.days;
  const days = fixed || (start && start <= to ? daysBetween(start, to) + 1 : range === "lifetime" ? 365 : 28);
  const from = addDays(to, -(days - 1));
  return { from, to, prevFrom: addDays(from, -days), prevTo: addDays(from, -1), days, ...(range === "lifetime" ? { lifetime: true } : {}) };
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
