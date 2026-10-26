/**
 * Words in a colour that was given for fills, for inline styles (1.35.0;
 * classes get the same from text-teal and the rest, tailwind.config.ts).
 * One of the app's own colours, `rgb(var(--teal))` (with or without an
 * alpha): its word shade, `rgb(var(--teal-text))`, deeper in light mode and
 * lighter in dark (globals.css). Any other colour (a hex, an avatar's): mixed
 * toward the page's ink (a third of the way in light mode, half in dark:
 * --word-mix), so it reads in both (tests/light-contrast.test.ts checks the
 * app's palettes with it).
 */
const OWN = /rgb\(var\(--(amber|teal|blue|violet|short|long|pink|gold|green|red|coral)\)/g;

export function wordColor(c: string): string {
  if (/var\(--ink/.test(c)) return c; // the page's own greys are word colours already
  if (/var\(--(amber|teal|blue|violet|short|long|pink|gold|green|red|coral)\)/.test(c)) return c.replace(OWN, "rgb(var(--$1-text)");
  return `color-mix(in srgb, ${c} var(--word-mix, 65%), rgb(var(--ink)))`;
}
