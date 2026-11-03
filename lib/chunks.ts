/*
 * Long lists in groups (1.32.5): the shorts and long videos lists put their
 * rows and cards in groups of LIST_CHUNK, each a .list-chunk (globals.css):
 * a group off screen isn't drawn until it comes near. Pure.
 */

/** Rows or cards per group: about a screen and a half of rows; 24 cards fill whole rows of 1, 2, 3 or 4. */
export const LIST_CHUNK = 24;
/** Cards per group in grids up to 5 or 6 across (60 fills whole rows of any of them). */
export const WIDE_CHUNK = 60;

/** A list in groups of `size` (the last one shorter). */
export function chunks<T>(list: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}
