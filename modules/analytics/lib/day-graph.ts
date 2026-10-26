/**
 * The dashboard's day graphs (1.34.5): which day is under the pointer, where
 * a day's popup goes, and the Views widget's week. Pure, so the tests can
 * check them (tests/dashboard-graphs.test.ts).
 */
import { reportedUntil, type Num } from "./trend-math";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Bars: each of `n` days has an equal slot, `gap` px apart, across `w` px.
 * The day under `x` (px from the graph's left); a gap belongs half to each
 * side, so there's no dead spot between two bars.
 */
export const slotAt = (x: number, w: number, n: number, gap = 2) => clamp(Math.floor(((x + gap / 2) * n) / (w + gap)), 0, n - 1);

/** The middle of day `i`'s slot (px from the graph's left). */
export const slotMid = (i: number, w: number, n: number, gap = 2) => ((i + 0.5) * (w + gap)) / n - gap / 2;

/** A line: a point for each of `n` days, from `pad` to `w − pad`. Where day `i`'s point is. */
export const pointX = (i: number, w: number, n: number, pad: number) => pad + (n <= 1 ? (w - 2 * pad) / 2 : (i / (n - 1)) * Math.max(1, w - 2 * pad));

/** The day whose point is nearest `x`. */
export const pointAt = (x: number, w: number, n: number, pad: number) => (n <= 1 ? 0 : clamp(Math.round(((x - pad) / Math.max(1, w - 2 * pad)) * (n - 1)), 0, n - 1));

export type ViewsWeek = {
  /** The last day every series has reported (−1: none has). */
  cut: number;
  /** Each day's views, all series together; null after `cut` and on days none has. */
  line: Num[];
  /** The last 7 days up to `cut`, and the 7 before (null when none of those has a number). */
  last7: number;
  prev7: number | null;
};

/**
 * The Views widget's numbers for one platform or several together: each day
 * up to the last day all of them have reported (YouTube's last two or three
 * days come late, and a total without them looked like views dropping to
 * almost nothing, 1.29.0), and the last 7 of those days against the 7
 * before, so the change compares two whole weeks.
 */
export function viewsWeek(series: readonly (readonly Num[])[], days: number): ViewsWeek {
  const cut = reportedUntil(series);
  const n = cut + 1;
  const line = Array.from({ length: days }, (_, i) => (i <= cut && series.some((s) => (s[i] ?? null) !== null) ? series.reduce<number>((t, s) => t + (s[i] ?? 0), 0) : null));
  const add = (xs: Num[]) => xs.reduce<number>((t, v) => t + (v ?? 0), 0);
  const before = line.slice(Math.max(0, n - 14), Math.max(0, n - 7));
  return { cut, line, last7: add(line.slice(Math.max(0, n - 7), n)), prev7: before.some((v) => v !== null) ? add(before) : null };
}
