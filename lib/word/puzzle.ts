import "server-only";
import { ANSWERS } from "./answers";

/** Puzzle #1 is this day; one a day after it, the same for everyone. */
export const FIRST_DAY = "2026-10-09";

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/** Today's date (YYYY-MM-DD) in a time zone (the team's). */
export function todayIn(timeZone: string | null | undefined, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The puzzle for a day: its number and its answer (never sent to the browser before the game ends). */
export function puzzleFor(day: string) {
  const n = dayNumber(day) - dayNumber(FIRST_DAY) + 1;
  const i = (((n - 1) % ANSWERS.length) + ANSWERS.length) % ANSWERS.length;
  return { number: n, answer: ANSWERS[i] };
}
