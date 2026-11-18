/*
 * Frame Guides' categories (1.54.0). The owner (Nov 18 2026): "2 of the categories have to be a-roll and b-roll …
 * keep it simple, dont overcomplicate it too much". So: a short list. First what the shot is (A-roll: the main
 * footage, the person talking; B-roll: what's cut in over it), then the shot itself (close-up, medium, wide, overhead,
 * POV, product), then each team's own (frame_categories, "c:<id>" on a frame). Picking two of the first kind shows
 * either; picking one of each shows the frames that are both (A-roll close-ups).
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

export type CategoryGroup = { id: string; name: string; color: FrameColor; items: { key: string; name: string; hint?: string; color?: FrameColor }[] };

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
    color: "teal",
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

/** A team's own category, as a frame keeps it. */
export const customKey = (id: string) => `c:${id}`;
export const isCustomKey = (k: string) => /^c:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k);
/** The shape 0133 lets in (frame_category_keys_ok). */
export const isCategoryKey = (k: string) => k.length <= 40 && (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(k) || isCustomKey(k));

export type CustomCategory = { id: string; name: string; color: FrameColor };

/** A category's name and colour (a built-in one, or the team's own; null when it's gone). */
export function categoryInfo(key: string, custom: CustomCategory[]): { key: string; name: string; color: FrameColor; group: string } | null {
  const b = BUILT_IN.get(key);
  if (b) return { key, name: b.name, color: b.color, group: b.group };
  if (isCustomKey(key)) {
    const c = custom.find((x) => customKey(x.id) === key);
    return c ? { key, name: c.name, color: c.color, group: "yours" } : null;
  }
  return null;
}

/**
 * Categories as a frame keeps them: known ones only (built in, or the team's), once each, at most 30. Unknown keys
 * (a category deleted meanwhile) are dropped.
 */
export function cleanCategories(keys: unknown, custom: CustomCategory[]): string[] {
  if (!Array.isArray(keys)) return [];
  const out: string[] = [];
  for (const k of keys) {
    if (typeof k !== "string" || out.includes(k) || !isCategoryKey(k)) continue;
    if (!BUILT_IN.has(k) && !custom.some((c) => customKey(c.id) === k)) continue;
    out.push(k);
    if (out.length >= 30) break;
  }
  return out;
}
