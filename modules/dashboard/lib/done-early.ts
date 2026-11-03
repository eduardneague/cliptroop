/**
 * A task finished before the day it was due (1.35.2, the owner: "if you do the tasks earlier than the date they are
 * set for … we should count them as soon as you do them even if they're upcoming and just have in our task history
 * written: done early on date"). Tasks already count the moment they're done (and since migration 0111 a short's
 * "Schedule the posts" is done once every post is scheduled, not when the last one goes out); the history says so.
 * Pure: `day` turns the moment it was done into its day where you are (the browser's).
 */
export function doneEarly(at: string, due: string | null | undefined, day: (d: Date) => string): string | null {
  if (!due) return null;
  const done = day(new Date(at));
  return done < due ? done : null;
}

const short = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Done early on Oct 26, due Oct 29". */
export const earlyText = (doneDay: string, due: string) => `Done early on ${short(doneDay)}, due ${short(due)}`;
