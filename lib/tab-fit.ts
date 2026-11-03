/*
 * How many underlined tabs fit in a row before the rest go under "More"
 * (1.30.1, components/ui/tab-overflow.tsx). Pure.
 *
 *   widths  each tab's width, in order
 *   gap     the space between two of them
 *   room    the row's width (inside its padding)
 *   more    the More button's width (room for the tab you're on, when it
 *           ends up under More, so the row doesn't jump)
 */
export function tabsThatFit(o: { widths: number[]; gap: number; room: number; more: number }): number {
  const { widths, gap, room, more } = o;
  const all = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widths.length - 1);
  if (all <= room + 0.5) return widths.length;
  let used = 0;
  let k = 0;
  while (k < widths.length && used + (k ? gap : 0) + widths[k] + gap + more <= room + 0.5) {
    used += (k ? gap : 0) + widths[k];
    k++;
  }
  return k;
}
