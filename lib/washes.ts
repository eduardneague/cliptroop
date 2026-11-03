/**
 * The colours behind the glass (1.29.2, Settings → Preferences → Glass →
 * Colours behind the glass). Pure: shared by the account (profiles.glass_wash
 * and glass_wash_colors, migration 0096), this device ("vp-look"), the
 * first-paint script and Settings.
 *
 *  - "theme":  your colour theme's own (its accent and two hues beside it),
 *              as before 1.29.2. The default.
 *  - "none":   no colours: the glass sits over the plain paper.
 *  - a theme's id: that theme's colours behind the glass, whatever theme
 *              you use (Ink's greys under Cherry's buttons, say).
 *  - a blend's id (Sunset, Aurora…): three colours picked to go together.
 *  - "custom": your own three colours.
 */

/** A colour as the CSS variables hold it: "r g b". */
export type Rgb = string;

/** A theme's colours behind the glass: its accent in light and in dark mode (the same as components/ui/palette.tsx). */
export const THEME_WASHES = [
  { id: "default", name: "Orange", light: "232 99 13", dark: "232 99 13" },
  { id: "coral", name: "Coral", light: "208 70 50", dark: "226 88 64" },
  { id: "sand", name: "Sand", light: "161 98 7", dark: "178 120 8" },
  { id: "cherry", name: "Cherry", light: "200 30 48", dark: "229 62 74" },
  { id: "berry", name: "Berry", light: "196 37 99", dark: "225 62 120" },
  { id: "orchid", name: "Orchid", light: "162 28 175", dark: "192 72 206" },
  { id: "grape", name: "Grape", light: "109 64 214", dark: "139 102 240" },
  { id: "indigo", name: "Indigo", light: "79 70 229", dark: "109 100 240" },
  { id: "ocean", name: "Ocean", light: "37 99 235", dark: "59 130 246" },
  { id: "solar", name: "Solar", light: "33 113 181", dark: "45 140 210" },
  { id: "sky", name: "Sky", light: "3 116 176", dark: "14 140 205" },
  { id: "nord", name: "Nord", light: "76 106 150", dark: "98 134 178" },
  { id: "lagoon", name: "Lagoon", light: "13 124 128", dark: "20 150 150" },
  { id: "forest", name: "Forest", light: "22 128 74", dark: "31 150 88" },
  { id: "pine", name: "Pine", light: "22 101 72", dark: "34 140 100" },
  { id: "sakura", name: "Sakura", light: "46 125 72", dark: "64 150 92" },
  { id: "lime", name: "Lime", light: "77 124 15", dark: "88 142 14" },
  { id: "mocha", name: "Mocha", light: "120 82 52", dark: "166 118 78" },
  { id: "slate", name: "Slate", light: "51 65 85", dark: "100 116 139" },
  { id: "ink", name: "Ink", light: "28 28 30", dark: "120 120 128" },
] as const;

/** Three colours picked to go together. */
export const BLENDS = [
  { id: "sunset", name: "Sunset", colors: ["#ff7a18", "#ff3d77", "#7b2ff7"] },
  { id: "aurora", name: "Aurora", colors: ["#00c9a7", "#3a7bd5", "#a445ff"] },
  { id: "candy", name: "Candy", colors: ["#ff6ec7", "#38bdf8", "#facc15"] },
  { id: "ember", name: "Ember", colors: ["#ef4444", "#f97316", "#7c2d12"] },
  { id: "tide", name: "Tide", colors: ["#06b6d4", "#2563eb", "#14b8a6"] },
  { id: "meadow", name: "Meadow", colors: ["#84cc16", "#22c55e", "#eab308"] },
] as const;

export type ThemeWashId = (typeof THEME_WASHES)[number]["id"];
export type BlendId = (typeof BLENDS)[number]["id"];
export type WashId = "theme" | "none" | "custom" | ThemeWashId | BlendId;

export const DEFAULT_WASH: WashId = "theme";
/** Where "Custom" starts: the app's orange, meetings' violet, long videos' blue. */
export const DEFAULT_CUSTOM: [string, string, string] = ["#e8630d", "#8b5cf6", "#0ea5e9"];

const HEX = /^#[0-9a-f]{6}$/;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);
export const themeWash = (id: unknown) => THEME_WASHES.find((w) => w.id === id) ?? null;
export const blend = (id: unknown) => BLENDS.find((b) => b.id === id) ?? null;
export const isWash = (v: unknown): v is WashId => v === "theme" || v === "none" || v === "custom" || !!themeWash(v) || !!blend(v);

/** "#e8630d" → "232 99 13". */
export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Three colours, as saved: lower-case "#rrggbb"; anything else falls back to the start of Custom. */
export function cleanColors(v: unknown): [string, string, string] {
  const list = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x.trim().toLowerCase() : "")) : [];
  return [0, 1, 2].map((i) => (isHex(list[i]) ? list[i] : DEFAULT_CUSTOM[i])) as [string, string, string];
}

/**
 * What <html> gets for a wash:
 *  - kind "one": one base colour (a theme's) in light and dark (--wash-light, --wash-dark), its two neighbours worked out by the CSS;
 *  - kind "three": three colours (--wash-1, --wash-2, --wash-3);
 *  - kind "none": no colours; the theme's own needs nothing (no attribute).
 */
export type WashVars =
  | { kind: "theme" }
  | { kind: "none" }
  | { kind: "one"; light: Rgb; dark: Rgb }
  | { kind: "three"; colors: [Rgb, Rgb, Rgb] };

export function washVars(wash: WashId, colors: [string, string, string]): WashVars {
  if (wash === "none") return { kind: "none" };
  const t = themeWash(wash);
  if (t) return { kind: "one", light: t.light, dark: t.dark };
  const b = blend(wash);
  if (b) return { kind: "three", colors: b.colors.map(hexToRgb) as [Rgb, Rgb, Rgb] };
  if (wash === "custom") return { kind: "three", colors: colors.map(hexToRgb) as [Rgb, Rgb, Rgb] };
  return { kind: "theme" };
}
