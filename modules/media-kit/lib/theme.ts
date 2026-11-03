/**
 * The media kit's colours (1.37.0), made from one colour: the team's (or the one picked). The ink is a very deep
 * shade of the same hue, so a kit reads as the team's own rather than as ClipTroop's; every word clears 4.5:1 on what
 * it sits on, every bar and big number 3:1 (lib/contrast.ts). Pure.
 */
import { contrast, fromOklch, over, textShade, toOklch, type RGB } from "@/lib/contrast";
import type { KitPlatform, KitTheme } from "./settings";

export type KitPalette = {
  theme: KitTheme;
  paper: RGB;
  ink: RGB;
  /** Secondary words. */
  muted: RGB;
  /** Small print. */
  faint: RGB;
  /** Hairlines, chart grids. */
  hair: RGB;
  /** The accent's own tint (tiles, the chart's area). */
  wash: RGB;
  /** A deeper tint (the bars beside the accent one). */
  tint: RGB;
  /** A plain raised surface (no accent). */
  panel: RGB;
  /** Shapes and big numbers (3:1 on the paper). */
  accent: RGB;
  /** Accent words (4.5:1 on the paper and on the wash). */
  accentText: RGB;
  /** Words on the accent. */
  onAccent: RGB;
  /** Each platform's colour in charts (3:1 on the paper). */
  platform: Record<KitPlatform, RGB>;
};

export const DEFAULT_ACCENT: RGB = [232, 99, 13];

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export const rgbToHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

const WHITE: RGB = [255, 255, 255];

/** A colour moved (lighter or darker, same hue) until it reaches `need` on `bg`. */
const reach = (c: RGB, bg: RGB, theme: KitTheme, need: number): RGB => textShade(c, [bg], theme, need);

export function kitPalette(accentHex: string | null | undefined, theme: KitTheme): KitPalette {
  const base = (accentHex && hexToRgb(accentHex)) || DEFAULT_ACCENT;
  const [, C, h] = toOklch(base);
  // A grey picked as the accent has no hue to lend: a neutral ink then.
  const tint = C < 0.02 ? 0 : 1;
  const brand = { youtube: [255, 0, 0] as RGB, instagram: [214, 41, 118] as RGB, facebook: [8, 102, 255] as RGB };

  if (theme === "dark") {
    const paper = fromOklch(0.19, Math.min(C * 0.28, 0.032) * tint, h);
    const ink = fromOklch(0.97, 0.008 * tint, h);
    const accent = reach(base, paper, "dark", 3.2);
    const wash = over(accent, 0.16, paper);
    const accentText = textShade(base, [paper, wash], "dark", 4.6);
    return {
      theme,
      paper,
      ink,
      muted: over(ink, 0.72, paper),
      faint: over(ink, 0.56, paper),
      hair: over(ink, 0.14, paper),
      wash,
      tint: over(accent, 0.34, paper),
      panel: over(ink, 0.06, paper),
      accent,
      accentText,
      onAccent: contrast(WHITE, accent) >= 4.5 ? WHITE : paper,
      platform: {
        youtube: reach(brand.youtube, paper, "dark", 3.2),
        instagram: reach(brand.instagram, paper, "dark", 3.2),
        facebook: reach(brand.facebook, paper, "dark", 3.2),
        tiktok: [37, 244, 238],
      },
    };
  }
  const paper = WHITE;
  const ink = fromOklch(0.22, Math.min(C * 0.3, 0.035) * tint, h);
  const accent = reach(base, paper, "light", 3.2);
  const wash = over(accent, 0.08, paper);
  const accentText = textShade(base, [paper, wash], "light", 4.6);
  return {
    theme,
    paper,
    ink,
    muted: over(ink, 0.7, paper),
    faint: over(ink, 0.64, paper),
    hair: over(ink, 0.12, paper),
    wash,
    tint: over(accent, 0.24, paper),
    panel: over(ink, 0.04, paper),
    accent,
    accentText,
    // White on the accent when it reads (4.5:1); otherwise the ink.
    onAccent: contrast(WHITE, accent) >= 4.5 ? WHITE : ink,
    platform: {
      youtube: reach(brand.youtube, paper, "light", 3.2),
      instagram: reach(brand.instagram, paper, "light", 3.2),
      facebook: reach(brand.facebook, paper, "light", 3.2),
      // TikTok's black, a little softer than the ink beside the others.
      tiktok: over(ink, 0.82, paper),
    },
  };
}
