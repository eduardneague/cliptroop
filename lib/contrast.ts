/**
 * Colour contrast (1.35.0), pure: WCAG's contrast ratio, OKLCH, and the shade
 * words in a colour need to read (the same hue with its lightness moved:
 * darker in light mode, lighter in dark). The team's own short / long colours
 * get their word shades from it (lib/kind-colors.ts), and
 * tests/light-contrast.test.ts checks every theme's colours with it.
 */
export type RGB = readonly [number, number, number];

const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const srgb = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG's relative luminance (0 black – 1 white). */
export const luminance = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG's contrast ratio of two colours (1–21; words need 4.5, large words and icons 3). */
export function contrast(a: RGB, b: RGB) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** `fg` at `alpha` over `bg`: a tint such as bg-teal/10 on a card. */
export const over = (fg: RGB, alpha: number, bg: RGB): RGB => [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as unknown as RGB;

/** sRGB → OKLCH: lightness 0–1, chroma, hue in radians. */
export function toOklch(c: RGB): [number, number, number] {
  const [R, G, B] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, b), Math.atan2(b, a)];
}

function linearOf(L: number, C: number, h: number) {
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
const inGamut = (x: number[]) => x.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/** OKLCH → sRGB, rounded; a colour the screen can't show keeps its lightness and hue with less chroma. */
export function fromOklch(L: number, C: number, h: number): RGB {
  let c = C;
  if (!inGamut(linearOf(L, c, h))) {
    let lo = 0;
    let hi = c;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (inGamut(linearOf(L, mid, h))) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  return linearOf(L, c, h).map((v) => Math.round(srgb(Math.min(1, Math.max(0, v))))) as unknown as RGB;
}

/**
 * The shade of `c` nearest it (the same hue, lighter or darker) that reads at
 * `need` on every one of `bgs`: darker in light mode, lighter in dark. A
 * little over 4.5 by default, so rounding never drops under.
 */
export function textShade(c: RGB, bgs: readonly RGB[], mode: "light" | "dark", need = 4.6): RGB {
  const reads = (t: RGB) => bgs.every((bg) => contrast(t, bg) >= need);
  if (reads(c)) return c;
  const [L0, C, h] = toOklch(c);
  let lo = mode === "light" ? 0 : L0;
  let hi = mode === "light" ? L0 : 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const good = reads(fromOklch(mid, C, h));
    if (mode === "light") {
      if (good) lo = mid;
      else hi = mid;
    } else if (good) hi = mid;
    else lo = mid;
  }
  return fromOklch(mode === "light" ? lo : hi, C, h);
}

/**
 * The darkest backgrounds of any light theme and the lightest of any dark one
 * (Nord's, in globals.css; the test keeps these true when themes change):
 * `plain` for words on cards, paper and hovers, `chip` under a colour's own
 * tints (up to 15 % over a card or the paper). Words that read there read in
 * every theme.
 */
export const WORST: Record<"light" | "dark", { plain: RGB; chip: RGB }> = {
  light: { plain: [216, 222, 233], chip: [229, 233, 240] },
  dark: { plain: [42, 48, 60], chip: [34, 39, 49] },
};

/**
 * The shade words in `c` use: 4.5:1 on the backgrounds `worst` (every theme's
 * by default), and on `c`'s own chips up to 15 % over them.
 */
export const wordsIn = (c: RGB, mode: "light" | "dark", worst = WORST[mode]) => textShade(c, [worst.plain, over(c, 0.15, worst.chip)], mode);

/** The shade of `c` nearest it that white words read on at 4.5:1 (a button, an avatar's initials): `c` itself when they do. */
export function forWhite(c: RGB, need = 4.6): RGB {
  const white: RGB = [255, 255, 255];
  if (contrast(white, c) >= need) return c;
  const [L0, C, h] = toOklch(c);
  let lo = 0;
  let hi = L0;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (contrast(white, fromOklch(mid, C, h)) >= need) lo = mid;
    else hi = mid;
  }
  return fromOklch(lo, C, h);
}

/**
 * Words on a fill given as a hex (an avatar's initials on its colour): white
 * where it reads at 4.5:1, else whichever of white and the page's dark ink
 * reads better (a light team colour, a grey). Anything that isn't a hex: white.
 */
export function onFill(fill: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(fill.trim());
  if (!m) return "#fff";
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  const c: RGB = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const white = contrast([255, 255, 255], c);
  return white >= 4.5 || white >= contrast([20, 17, 12], c) ? "#fff" : "rgb(20 17 12)";
}
