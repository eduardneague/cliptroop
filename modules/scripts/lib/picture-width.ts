// How wide a picture in a script gets when one of its sides is dragged, or moved from the keyboard (1.55.3: the corner
// square gave way to its sides). Widths are percents of the page, as the picture keeps them.

export type PictureAlign = "left" | "center" | "right";
export type PictureSide = "left" | "right";

/** Widths a picture settles on as it's dragged close to them: a quarter, a third, a half, two thirds, three quarters, all. */
export const PICTURE_SNAPS = [25, 33, 50, 66, 75, 100] as const;
/** How close (percent of the page) a drag comes to one of those before it settles on it. */
export const SNAP_WITHIN = 1.6;
/** The narrowest a picture gets: 15% of the page, and never under 80 px. */
export const PICTURE_MIN_PCT = 15;
export const PICTURE_MIN_PX = 80;

/** The sides that move: the right one of a picture on the left, the left one of a picture on the right, both in the middle. */
export function movingSides(align: PictureAlign): PictureSide[] {
  return align === "center" ? ["left", "right"] : align === "right" ? ["left"] : ["right"];
}

/** How many pixels wider it gets for each one the pointer goes right: out from its side is wider; in the middle, both sides move. */
export function growth(side: PictureSide, align: PictureAlign): number {
  return (side === "right" ? 1 : -1) * (align === "center" ? 2 : 1);
}

/** The narrowest it can be on a page this wide (percent). */
export function narrowest(full: number): number {
  return full > 0 ? Math.min(100, Math.max(PICTURE_MIN_PCT, Math.ceil((PICTURE_MIN_PX / full) * 100))) : PICTURE_MIN_PCT;
}

/** Its width for a drag: within its limits, and settled on a snap when it's that close to one. */
export function draggedWidth(startPx: number, dx: number, full: number, grow: number): { pct: number; snapped: boolean } {
  const px = Math.min(full, Math.max(PICTURE_MIN_PX, (full * PICTURE_MIN_PCT) / 100, startPx + dx * grow));
  const raw = (px / full) * 100;
  const snap = PICTURE_SNAPS.find((p) => Math.abs(raw - p) <= SNAP_WITHIN);
  return snap !== undefined ? { pct: snap, snapped: true } : { pct: Math.round(raw), snapped: false };
}

/**
 * A side from the keyboard: the arrow pointing out from it (or Up) wider, the other one (or Down) narrower, by 2 (with
 * Shift, or Page Up and Page Down, by 10); Home the narrowest, End the whole page. Null: not a key for it.
 */
export function keyedWidth(now: number, key: string, shift: boolean, side: PictureSide, floor = PICTURE_MIN_PCT): number | null {
  const step = shift || key === "PageUp" || key === "PageDown" ? 10 : 2;
  const wider = key === (side === "right" ? "ArrowRight" : "ArrowLeft") || key === "ArrowUp" || key === "PageUp";
  const narrower = key === (side === "right" ? "ArrowLeft" : "ArrowRight") || key === "ArrowDown" || key === "PageDown";
  if (wider) return Math.min(100, Math.round(now) + step);
  if (narrower) return Math.max(floor, Math.round(now) - step);
  if (key === "Home") return floor;
  if (key === "End") return 100;
  return null;
}
