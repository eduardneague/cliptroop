import type { SocialPlatform } from "@/lib/social/providers";
import type { Window } from "./ranges";

/*
 * Window snapshots (migration 0081): how the numbers split over the last 7,
 * 28, 90 or 365 days, and (1.21.0) over YouTube's whole life (span 0), as
 * the platform had them on the day of the copy. Which one a range shows,
 * and what it says it covers. Pure; tests/windows.test.ts.
 */

type Row = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const niceDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The window that matches a range. YouTube: 7 / 28 / 90 / 365, and its
 * whole life (0) for Lifetime or anything longer than a year; Instagram: up
 * to 28 (all it shares).
 */
export function spanFor(platform: SocialPlatform, w: Pick<Window, "days" | "lifetime">) {
  const days = w.days;
  if (platform === "instagram") return days <= 7 ? 7 : 28;
  if (w.lifetime || days > 365) return 0;
  return days <= 7 ? 7 : days <= 28 ? 28 : days <= 90 ? 90 : 365;
}

/**
 * The stored window to show for `wanted`: that one, else the nearest by
 * how many times longer or shorter it is (a year is nearer the whole life
 * than 28 days; the whole life counts as two years), the longer on a tie;
 * for the whole life, the longest there is.
 */
export function pickSpan(spans: number[], wanted: number): number | null {
  const list = spans.filter((s) => Number.isFinite(s));
  if (!list.length) return null;
  if (list.includes(wanted)) return wanted;
  if (wanted === 0) return list.includes(0) ? 0 : Math.max(...list);
  const size = (s: number) => (s === 0 ? 730 : s);
  const far = (s: number) => Math.abs(Math.log(size(s) / wanted));
  return [...list].sort((a, b) => far(a) - far(b) || size(b) - size(a))[0];
}

const spanWords = (span: number) => (span === 365 ? "the last 12 months" : `the last ${span} days`);

/** What a window covers, in words ("The last 90 days, to Oct 12"; YouTube's whole life: "Since the channel started, to Oct 12"). */
export function windowWords(platform: SocialPlatform, span: number, day: string | null) {
  const to = day ? `, to ${niceDay(day)}` : "";
  if (span === 0) return platform === "youtube" ? `Since the channel started${to}` : "As the platform has it now";
  const words = spanWords(span);
  return `${words[0].toUpperCase()}${words.slice(1)}${to}`;
}

/**
 * Do per-day rows cover the range? They start when the account was
 * connected (a little before for some, and YouTube's history fills its own
 * in over the first copies, 1.21.0): 90% of the range's days.
 */
export const coversRange = (daysWithRows: number, w: Pick<Window, "days">) => daysWithRows >= Math.ceil(w.days * 0.9);

/**
 * YouTube's views by country for a range. The days' own countries (kept per
 * day from 28 days before the channel was connected) when they cover it;
 * otherwise (Lifetime, a year, a channel connected lately) the window
 * nearest to it, which says what it covers (`sub`; `span` null: the days').
 * `days`: analytics_countries rows (country, value, watch_minutes, day);
 * `windows`: analytics_breakdowns window rows (any dimension).
 */
export function youtubeCountries(
  days: Row[],
  windows: Row[],
  w: Pick<Window, "days" | "lifetime">
): { rows: { country: string; views: number; watch: number | null }[]; sub: string; span: number | null } {
  const covered = new Set(days.map((r) => r.day as string).filter(Boolean)).size;
  const snaps = windows.filter((r) => r.dimension === "country");
  const pick = coversRange(covered, w) ? null : pickSpan([...new Set(snaps.map((r) => Number(r.span)))], spanFor("youtube", w));
  if (pick !== null) {
    const list = snaps.filter((r) => Number(r.span) === pick);
    const day = list.map((r) => r.day as string).sort().pop() ?? null;
    const rows = list
      .filter((r) => r.day === day && typeof r.key === "string" && r.key)
      .map((r) => ({ country: r.key as string, views: n(r.views) ?? 0, watch: n(r.watch_minutes) }))
      .sort((a, b) => b.views - a.views);
    if (rows.length) return { rows, sub: windowWords("youtube", pick, day), span: pick };
  }
  const by = new Map<string, { views: number; watch: number | null }>();
  for (const c of days) {
    if (typeof c.country !== "string" || !c.country) continue;
    const cur = by.get(c.country) ?? { views: 0, watch: null };
    cur.views += n(c.value) ?? 0;
    const m = n(c.watch_minutes);
    if (m !== null) cur.watch = (cur.watch ?? 0) + m;
    by.set(c.country, cur);
  }
  return { rows: [...by.entries()].map(([country, v]) => ({ country, views: v.views, watch: v.watch })).sort((a, b) => b.views - a.views), sub: "Views in this range", span: null };
}
