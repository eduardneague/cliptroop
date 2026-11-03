/**
 * A profile's colours (1.29.5, Customize profile → Colours): the frame
 * around your picture, the XP bar (and the bars and icons in your
 * showcases), and the glow in your header's corner. Each is your level's
 * colour (the default), the colour theme's (the one of whoever is looking),
 * or a colour you pick; the glow can be off. Saved on your profile page
 * (profile_pages.frame_color, bar_color, glow_color, migration 0099), so
 * everyone sees your choice. Pure: shared by the page, the editor, the
 * server action and the tests.
 */

/** "level", "theme", or a colour as lower-case "#rrggbb". */
export type ProfileColor = string;
export type ProfileColors = { frame: ProfileColor; bar: ProfileColor; glow: ProfileColor };

export const DEFAULT_COLORS: ProfileColors = { frame: "level", bar: "level", glow: "level" };

/** Colours to pick from, besides your level's, the theme's and your own. */
export const COLOR_PRESETS: { hex: string; name: string }[] = [
  { hex: "#e5484d", name: "Red" },
  { hex: "#f76b15", name: "Orange" },
  { hex: "#e2a300", name: "Yellow" },
  { hex: "#7cb342", name: "Lime" },
  { hex: "#30a46c", name: "Green" },
  { hex: "#12a594", name: "Teal" },
  { hex: "#00a2c7", name: "Cyan" },
  { hex: "#3e63dd", name: "Blue" },
  { hex: "#6e56cf", name: "Violet" },
  { hex: "#ab4aba", name: "Purple" },
  { hex: "#d6409f", name: "Pink" },
  { hex: "#8b93a1", name: "Grey" },
];

const HEX = /^#[0-9a-f]{6}$/;
export const isColorHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** One colour, as saved: "level", "theme" or "#rrggbb" ("off" too for the glow); anything else is the level's. */
export function cleanColor(v: unknown, canBeOff = false): ProfileColor {
  if (v === "level" || v === "theme" || (canBeOff && v === "off")) return v;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return HEX.test(s) ? s : "level";
}

/** The three, from a profile page's row; missing ones (a database before 0099) are the level's. */
export function readColors(row: { frame_color?: unknown; bar_color?: unknown; glow_color?: unknown } | null | undefined): ProfileColors {
  return { frame: cleanColor(row?.frame_color), bar: cleanColor(row?.bar_color), glow: cleanColor(row?.glow_color, true) };
}

/** The three, from what the page sends ({ frame, bar, glow }), cleaned the same way. */
export function cleanColors(v: unknown): ProfileColors {
  const x = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return readColors({ frame_color: x.frame, bar_color: x.bar, glow_color: x.glow });
}

export const sameColors = (a: ProfileColors, b: ProfileColors) => a.frame === b.frame && a.bar === b.bar && a.glow === b.glow;

/** As CSS: the level's colour, the theme's accent (the viewer's theme), or the colour itself. "off" has none. */
export function colorCss(c: ProfileColor, levelHex: string): string {
  return c === "level" ? levelHex : c === "theme" ? "rgb(var(--amber))" : c === "off" ? "transparent" : c;
}

/** What to call a choice (the picker's labels, and its screen reader names). */
export function colorName(c: ProfileColor): string {
  if (c === "level") return "Your level's colour";
  if (c === "theme") return "Your theme's colour";
  if (c === "off") return "Off";
  return COLOR_PRESETS.find((p) => p.hex === c)?.name ?? "Your own colour";
}
