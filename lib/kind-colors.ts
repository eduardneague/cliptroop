import { wordsIn, type RGB } from "./contrast";

/**
 * Team colours for shorts and long videos → the CSS variables every page
 * uses (--short / --long, as "r g b"). Dark mode gets a lighter shade of
 * the same colour so it stays readable on dark backgrounds. 1.35.0: and the
 * shade words in each colour use (--short-text / --long-text, text-short and
 * text-long): deeper in light mode, lighter in dark, so a team's yellow or
 * light blue still reads at 4.5:1 in every theme (lib/contrast.ts).
 */
export const DEFAULT_SHORT_COLOR = "#EA580C";
export const DEFAULT_LONG_COLOR = "#0EA5E9";

const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lighten = ([r, g, b]: RGB, t = 0.3): RGB => [r, g, b].map((c) => Math.round(c + (255 - c) * t)) as unknown as RGB;
const triplet = (c: RGB) => c.join(" ");

export function kindColorCss(short?: string | null, long?: string | null) {
  const s = rgb(short && HEX.test(short) ? short : DEFAULT_SHORT_COLOR);
  const l = rgb(long && HEX.test(long) ? long : DEFAULT_LONG_COLOR);
  const [sd, ld] = [lighten(s), lighten(l)];
  return (
    `:root{--short:${triplet(s)};--long:${triplet(l)};--short-text:${triplet(wordsIn(s, "light"))};--long-text:${triplet(wordsIn(l, "light"))}}` +
    `.dark{--short:${triplet(sd)};--long:${triplet(ld)};--short-text:${triplet(wordsIn(sd, "dark"))};--long-text:${triplet(wordsIn(ld, "dark"))}}`
  );
}
