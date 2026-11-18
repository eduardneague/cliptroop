/*
 * Frame Guides' categories (1.54.0). The owner (Nov 18 2026): "2 of the categories have to be a-roll and b-roll …
 * keep it simple, dont overcomplicate it too much". So: a short list. First what the shot is (A-roll: the main
 * footage, the person talking; B-roll: what's cut in over it), then the shot itself (close-up, medium, wide, overhead,
 * POV, product). Picking two of the first kind shows either; picking one of each shows the frames that are both
 * (A-roll close-ups). 1.54.1: these and no others (the owner: "remove this feature with teams in frame guides
 * entirely"): a team's own categories are gone (0133's frame_categories stays, unused; "c:<id>" keys are dropped).
 * The keys are what the database keeps on a frame (0133 checks their shape: lowercase words joined by "-"); the names
 * can change, the keys never do. Pure: tests/frame-guides.test.ts.
 */

export type FrameColor = "teal" | "blue" | "violet" | "pink" | "red" | "orange" | "amber" | "green" | "slate";
export const FRAME_COLORS: FrameColor[] = ["teal", "blue", "violet", "pink", "red", "orange", "amber", "green", "slate"];

/** A colour as CSS (the app's own colours: they read in light and dark, and with every theme). */
export const COLOR_CSS: Record<FrameColor, string> = {
  teal: "rgb(var(--teal))",
  blue: "rgb(var(--blue))",
  violet: "rgb(var(--violet))",
  pink: "rgb(var(--pink))",
  red: "rgb(var(--red))",
  orange: "rgb(var(--coral))",
  amber: "rgb(var(--gold))",
  green: "rgb(var(--green))",
  slate: "rgb(var(--ink-soft))",
};
export const COLOR_NAME: Record<FrameColor, string> = { teal: "Teal", blue: "Blue", violet: "Violet", pink: "Pink", red: "Red", orange: "Orange", amber: "Amber", green: "Green", slate: "Grey" };
export const cleanColor = (c: unknown, fallback: FrameColor = "teal"): FrameColor => (FRAME_COLORS.includes(c as FrameColor) ? (c as FrameColor) : fallback);

/** Frame guides' own colour, everywhere (comments are the accent, editing ideas blue): globals.css --frame. */
export const FRAME_COLOR = "rgb(var(--frame))";

/** A category's colour: one of the above, or the theme's own ("accent", 1.54.1: the shots follow the theme). */
export type ChipColor = FrameColor | "accent";
export const chipCss = (c: ChipColor) => (c === "accent" ? "rgb(var(--amber))" : COLOR_CSS[c]);

export type CategoryGroup = { id: string; name: string; color: ChipColor; items: { key: string; name: string; hint?: string; color?: ChipColor }[] };

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: "roll",
    name: "Type",
    color: "blue",
    items: [
      { key: "a-roll", name: "A-roll", hint: "The main footage: you, talking", color: "blue" },
      { key: "b-roll", name: "B-roll", hint: "What's cut in over it", color: "orange" },
    ],
  },
  {
    id: "shot",
    name: "Shot",
    color: "accent",
    items: [
      { key: "close-up", name: "Close-up" },
      { key: "medium", name: "Medium" },
      { key: "wide", name: "Wide" },
      { key: "overhead", name: "Overhead" },
      { key: "pov", name: "POV" },
      { key: "product", name: "Product" },
    ],
  },
];

/** A frame is one or the other: picking A-roll takes B-roll off, and the other way round. */
export const ROLL_KEYS = ["a-roll", "b-roll"];
export function toggleCategory(value: string[], key: string): string[] {
  if (value.includes(key)) return value.filter((x) => x !== key);
  return [...(ROLL_KEYS.includes(key) ? value.filter((x) => !ROLL_KEYS.includes(x)) : value), key];
}

/** Every built-in key: its name, group and colour. */
export const BUILT_IN = new Map(CATEGORY_GROUPS.flatMap((g) => g.items.map((it) => [it.key, { key: it.key, name: it.name, hint: it.hint, group: g.id, color: it.color ?? g.color }] as const)));

/** One of the categories above. */
export const isCategoryKey = (k: string) => BUILT_IN.has(k);

/** A category's name and colour (null: not one of them, like a team category from 1.54.0). */
export function categoryInfo(key: string): { key: string; name: string; color: ChipColor; group: string } | null {
  const b = BUILT_IN.get(key);
  return b ? { key, name: b.name, color: b.color, group: b.group } : null;
}

/** Categories as a frame keeps them: these ones only, once each, A-roll or B-roll (not both). Anything else is dropped. */
export function cleanCategories(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  let out: string[] = [];
  for (const k of keys) {
    if (typeof k !== "string" || !BUILT_IN.has(k) || out.includes(k)) continue;
    // (One kind of footage: the last one given wins, as toggleCategory does.)
    if (ROLL_KEYS.includes(k)) out = out.filter((x) => !ROLL_KEYS.includes(x));
    out.push(k);
  }
  return out;
}
