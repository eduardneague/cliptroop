/**
 * Where a dropdown goes (1.29.9, components/ui/anchored-menu.tsx): under its
 * button, or over it when it doesn't fit below and there's more room above
 * (a button at the bottom of a popup, like the idea window's Start). Phones
 * get the whole width with 12px on each side; larger screens line it up with
 * the button's left or right edge, never past the screen's.
 */

export type MenuPlace = { top?: number; bottom?: number; left: number; width: number; maxH: number; up: boolean };

/** The gap to the button, and the least room kept to the screen's edge. */
const GAP = 6;
const EDGE = 12;

export function placeMenu(o: {
  /** The button's box on screen. */
  anchor: { top: number; bottom: number; left: number; right: number };
  vw: number;
  vh: number;
  width: number;
  align: "left" | "right";
  /** How tall it wants to be (once drawn), else a guess. */
  natural?: number | null;
  /** The tallest it may get. */
  maxHeight?: number;
}): MenuPlace {
  const { anchor: r, vw, vh } = o;
  const cap = o.maxHeight ?? Infinity;
  const below = vh - r.bottom - GAP - EDGE;
  const above = r.top - GAP - EDGE;
  const want = Math.min(o.natural ?? 220, cap);
  const up = below < want && above > below;
  const maxH = Math.max(120, Math.min(cap, up ? above : below));
  const width = vw < 640 ? vw - EDGE * 2 : Math.min(o.width, vw - EDGE * 2);
  const left = vw < 640 ? EDGE : o.align === "right" ? Math.max(EDGE, Math.min(r.right - width, vw - width - EDGE)) : Math.max(EDGE, Math.min(r.left, vw - width - EDGE));
  return up ? { bottom: vh - r.top + GAP, left, width, maxH, up } : { top: r.bottom + GAP, left, width, maxH, up };
}
