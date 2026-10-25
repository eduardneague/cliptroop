/**
 * The shorts list's history (1.32.5). A team posting every day has hundreds
 * of posted shorts after a year, and the list drew every one of them: the
 * page's size, the time to draw it and every live update grew with each.
 * Posted shorts planned more than HISTORY_DAYS ago are left out until asked
 * for (?past=all), once there are at least HIDE_AT_LEAST of them. Anything
 * not posted yet (overdue included), or without a date, always shows. Pure.
 */
export const HISTORY_DAYS = 14;
export const HIDE_AT_LEAST = 30;

/** YYYY-MM-DD, n calendar days from d. */
export const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function splitHistory<T extends { stage: string; plannedDate: string | null }>(list: T[], today: string, showAll: boolean) {
  const cutoff = shiftDay(today, -HISTORY_DAYS);
  const old = (s: T) => s.stage === "posted" && !!s.plannedDate && s.plannedDate < cutoff;
  const older = list.filter(old).length;
  const hiding = !showAll && older >= HIDE_AT_LEAST;
  return {
    /** The first day still shown when hiding. */
    cutoff,
    /** Posted shorts from before the cutoff (shown or not). */
    older,
    /** Whether they're left out now. */
    hiding,
    /** Whether there's a choice to offer (enough of them to leave out). */
    offer: older >= HIDE_AT_LEAST,
    shown: hiding ? list.filter((s) => !old(s)) : list,
  };
}
