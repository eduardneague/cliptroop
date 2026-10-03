/**
 * Team colours for shorts and long videos → the CSS variables every page
 * uses (--short / --long, as "r g b"). Dark mode gets a lighter shade of
 * the same colour so it stays readable on dark backgrounds.
 */
export const DEFAULT_SHORT_COLOR = "#EA580C";
export const DEFAULT_LONG_COLOR = "#0EA5E9";

const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lighten = ([r, g, b]: [number, number, number], t = 0.3): [number, number, number] =>
  [r, g, b].map((c) => Math.round(c + (255 - c) * t)) as [number, number, number];
const triplet = (c: [number, number, number]) => c.join(" ");

export function kindColorCss(short?: string | null, long?: string | null) {
  const s = rgb(short && HEX.test(short) ? short : DEFAULT_SHORT_COLOR);
  const l = rgb(long && HEX.test(long) ? long : DEFAULT_LONG_COLOR);
  return `:root{--short:${triplet(s)};--long:${triplet(l)}}.dark{--short:${triplet(lighten(s))};--long:${triplet(lighten(l))}}`;
}
