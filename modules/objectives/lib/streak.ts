/**
 * The team's win streak (1.18.0). A win is any objective reached for one of
 * its periods (what gets the confetti). The streak counts in the shortest
 * period the team's goals use: days when there's a daily goal, else weeks,
 * then months… A period with at least one win keeps it going; one without
 * breaks it, except the current one (still running) and periods every goal
 * of that length was switched off for (a day off doesn't break it). It starts
 * with the first goal of that length. Also: the best run, the days since the
 * last win and a strip of the latest periods. Pure (tested in
 * tests/streak.test.ts): the server loads the rows (lib/board.ts).
 */
import { PERIODS, addDays, daysBetween, daysLeft, isDay, isPeriodKind, periodEnd, periodStart, shiftPeriod, type PeriodKind } from "./periods";

export type StreakObjective = { id: string; period: string; createdDay: string; paused: boolean };
/** A win, on the team's day it counts on (never after its period's last day). */
export type StreakWin = { objectiveId: string; day: string };
/** A period an objective was switched off for (its target set to 0). */
export type StreakOff = { objectiveId: string; start: string };

/**
 * won: had a win. missed: over, without one. off: every goal of this length
 * was switched off. open: the current one, no win yet. future: not here yet
 * (this week's days to come). before: before the first goal of this length.
 */
export type SlotState = "won" | "missed" | "off" | "open" | "future" | "before";
export type StreakSlot = { start: string; label: string; title: string; state: SlotState; wins: number; current: boolean };

export type WinStreak = {
  unit: PeriodKind;
  /** Periods in a row with a win (the current one counts once it has one). */
  current: number;
  best: number;
  /** The best run before the current period (a new best: current > bestBefore). */
  bestBefore: number;
  /** The current period has a win already. */
  safe: boolean;
  /** Wins in the current period. */
  thisPeriod: number;
  /** The current period's first day (a celebration is shown once per period). */
  periodStart: string;
  /** Days left in the current period, today included. */
  daysLeft: number;
  /** Days since the last win (0 = today); null: no win yet. */
  sinceLast: number | null;
  lastWinDay: string | null;
  /** The current run's first period (null without a run). */
  since: string | null;
  /** Wins in the last 30 days (today included). */
  wins30: number;
  /** Every win ever counted. */
  total: number;
  /** The latest periods, oldest first: this week's days (Monday to Sunday), the last 7 weeks, 6 months, 4 quarters or 3 years. */
  slots: StreakSlot[];
};

/** How many periods to walk back at most (about 13 years of days). */
const MAX_STEPS = 5000;

/** The streak's period: the shortest the active goals use (all of them, when every one is paused). */
export function streakUnit(objectives: Pick<StreakObjective, "period" | "paused">[]): PeriodKind | null {
  const active = objectives.filter((o) => !o.paused && isPeriodKind(o.period));
  const pool = active.length ? active : objectives.filter((o) => isPeriodKind(o.period));
  return PERIODS.find((p) => pool.some((o) => o.period === p)) ?? null;
}

const utc = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
const WEEKDAY = ["M", "T", "W", "T", "F", "S", "S"];

function slotWords(unit: PeriodKind, start: string, index: number): { label: string; title: string } {
  switch (unit) {
    case "day":
      return { label: WEEKDAY[index] ?? "", title: utc(start, { weekday: "short", month: "short", day: "numeric" }) };
    case "week":
      return { label: String(Number(start.slice(8))), title: `Week of ${utc(start, { month: "short", day: "numeric" })}` };
    case "month":
      return { label: utc(start, { month: "short" }), title: utc(start, { month: "long", year: "numeric" }) };
    case "quarter": {
      const q = `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1}`;
      return { label: q, title: `${q} ${start.slice(0, 4)}` };
    }
    case "year":
      return { label: start.slice(0, 4), title: start.slice(0, 4) };
  }
}

const SLOTS: Record<PeriodKind, number> = { day: 7, week: 7, month: 6, quarter: 4, year: 3 };

export function winStreak(input: { today: string; objectives: StreakObjective[]; wins: StreakWin[]; off: StreakOff[] }): WinStreak | null {
  const { today } = input;
  if (!isDay(today)) return null;
  const unit = streakUnit(input.objectives);
  if (!unit) return null;
  const cur = periodStart(unit, today);

  // The goals of this length (the active ones, unless every goal is paused):
  // the streak starts with the first of them.
  const anyActive = input.objectives.some((o) => !o.paused && isPeriodKind(o.period));
  const own = input.objectives.filter((o) => o.period === unit && (!anyActive || !o.paused) && isDay(o.createdDay));
  const created = own.map((o) => periodStart(unit, o.createdDay)).sort();
  // (Wins from before it, a weekly goal's say, still count for "days since the last win".)
  let first = created[0] && created[0] < cur ? created[0] : cur;

  // Wins per period (a win "in the future", from a wrong clock, counts today).
  const winsIn = new Map<string, number>();
  let last: string | null = null;
  let wins30 = 0;
  let total = 0;
  const monthAgo = addDays(today, -29);
  for (const w of input.wins) {
    if (!isDay(w.day)) continue;
    const day = w.day > today ? today : w.day;
    const s = periodStart(unit, day);
    winsIn.set(s, (winsIn.get(s) ?? 0) + 1);
    if (!last || day > last) last = day;
    if (day >= monthAgo) wins30++;
    total++;
  }

  // Periods every goal of this length (that existed then) was switched off for.
  const offBy = new Map<string, Set<string>>();
  for (const f of input.off) if (isDay(f.start)) offBy.set(f.start, (offBy.get(f.start) ?? new Set()).add(f.objectiveId));
  const isOff = (start: string) => {
    const there = own.filter((o) => periodStart(unit, o.createdDay) <= start);
    const offs = offBy.get(start);
    return there.length > 0 && !!offs && there.every((o) => offs.has(o.id));
  };

  // Never walk back more than MAX_STEPS periods.
  const earliest = shiftPeriod(unit, cur, -MAX_STEPS);
  if (first < earliest) first = earliest;

  const states = new Map<string, SlotState>();
  let run = 0;
  let runStart: string | null = null;
  let best = 0;
  for (let s = first, i = 0; s <= cur && i <= MAX_STEPS + 1; s = shiftPeriod(unit, s, 1), i++) {
    const won = (winsIn.get(s) ?? 0) > 0;
    const state: SlotState = won ? "won" : isOff(s) ? "off" : s === cur ? "open" : "missed";
    states.set(s, state);
    if (s === cur) break;
    if (state === "won") {
      if (run === 0) runStart = s;
      run++;
      best = Math.max(best, run);
    } else if (state === "missed") {
      run = 0;
      runStart = null;
    }
  }
  const bestBefore = best;
  const safe = states.get(cur) === "won";
  const current = run + (safe ? 1 : 0);
  if (safe && run === 0) runStart = cur;
  best = Math.max(best, current);

  // The strip.
  const n = SLOTS[unit];
  const starts = unit === "day" ? Array.from({ length: 7 }, (_, i) => addDays(periodStart("week", today), i)) : Array.from({ length: n }, (_, i) => shiftPeriod(unit, cur, i - n + 1));
  const slots: StreakSlot[] = starts.map((start, i) => ({
    start,
    ...slotWords(unit, start, i),
    state: start > cur ? "future" : start < first ? "before" : states.get(start) ?? "missed",
    wins: winsIn.get(start) ?? 0,
    current: start === cur,
  }));

  return {
    unit,
    current,
    best,
    bestBefore,
    safe,
    thisPeriod: winsIn.get(cur) ?? 0,
    periodStart: cur,
    daysLeft: daysLeft(unit, cur, today),
    sinceLast: last ? Math.max(0, daysBetween(last, today)) : null,
    lastWinDay: last,
    since: current > 0 ? runStart : null,
    wins30,
    total,
    slots,
  };
}

/** The day a recorded win counts on: the day it was reached, kept inside its period (late numbers count for the period they're about). */
export function winDay(reachedDay: string, periodStartDay: string, periodEndDay: string): string {
  if (reachedDay > periodEndDay) return periodEndDay;
  if (reachedDay < periodStartDay) return periodStartDay;
  return reachedDay;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const UNIT: Record<PeriodKind, [string, string]> = { day: ["day", "days"], week: ["week", "weeks"], month: ["month", "months"], quarter: ["quarter", "quarters"], year: ["year", "years"] };
/** "day" / "days", "week" / "weeks"… */
export const unitWord = (unit: PeriodKind, n: number) => UNIT[unit][n === 1 ? 0 : 1];
const THIS_ONE: Record<PeriodKind, string> = { day: "today", week: "this week", month: "this month", quarter: "this quarter", year: "this year" };
export const thisPeriod = (unit: PeriodKind) => THIS_ONE[unit];

/** "5 days in a row", "1 week in a row". */
export const inARow = (s: Pick<WinStreak, "unit" | "current">) => `${s.current} ${unitWord(s.unit, s.current)} in a row`;

/** What to do next, in one line: "Won today: 3 days in a row.", "Win this week to keep it going: 4 days left." */
export function streakLine(s: WinStreak): string {
  const left = s.unit === "day" ? "until midnight" : s.daysLeft <= 1 ? "last day" : `${s.daysLeft} days left`;
  const off = s.slots.find((x) => x.current)?.state === "off";
  if (s.safe) return s.thisPeriod > 1 ? `${s.thisPeriod} wins ${thisPeriod(s.unit)}.` : `Won ${thisPeriod(s.unit)}.`;
  if (off) return `Off ${thisPeriod(s.unit)}: the streak waits.`;
  if (s.current > 0) return `Win ${thisPeriod(s.unit)} to keep it going (${left}).`;
  if (s.total > 0) return `Win ${thisPeriod(s.unit)} to start a new one (${left}).`;
  return "The first goal reached starts it.";
}
