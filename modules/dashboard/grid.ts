/**
 * Dashboard grid engine (pure functions, no React).
 *
 * Every widget has a place on a 12 column grid: x, y (column, row) and
 * w, h (columns, rows). The board is computed from scratch every time
 * (saved layout + what the pointer is doing), never nudged step by step,
 * so a drag can't flicker or loop.
 *
 *  - compact():  everything slides up until something is above it.
 *  - preview():  where everything goes while one widget is dragged or
 *                resized (push aside, swap with a similar widget, slide up).
 *  - fill():     widgets grow into empty space next to them (display only,
 *                the saved sizes stay as you set them).
 */

export const COLS = 12;

export type Box = { i: string; x: number; y: number; w: number; h: number };
export type Limits = { minW: number; minH: number; maxW: number; maxH: number };

export const collides = (a: Box, b: Box) => a.i !== b.i && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
export const bottom = (items: Box[]) => items.reduce((m, b) => Math.max(m, b.y + b.h), 0);
const byPos = (a: Box, b: Box) => a.y - b.y || a.x - b.x;

/** Keep a box inside the grid and inside its size limits. */
export function clampBox(b: Box, lim?: Limits): Box {
  let w = Math.round(b.w);
  let h = Math.round(b.h);
  if (lim) {
    w = Math.max(lim.minW, Math.min(lim.maxW, w));
    h = Math.max(lim.minH, Math.min(lim.maxH, h));
  }
  w = Math.max(1, Math.min(COLS, w));
  h = Math.max(1, h);
  const x = Math.max(0, Math.min(COLS - w, Math.round(b.x)));
  const y = Math.max(0, Math.round(b.y));
  return { i: b.i, x, y, w, h };
}

/**
 * Settle one box among already placed ones: slide up while the row just
 * above it is free, then move below anything it still overlaps.
 */
function settle(placed: Box[], b: Box): Box {
  const out = { ...b };
  while (out.y > 0 && !placed.some((p) => collides(p, { i: out.i, x: out.x, y: out.y - 1, w: out.w, h: 1 }))) out.y--;
  for (let guard = 0; guard < 500; guard++) {
    const hit = placed.find((p) => collides(p, out));
    if (!hit) break;
    out.y = hit.y + hit.h;
  }
  return out;
}

/** Slide everything up as far as it goes (keeps top-to-bottom order). Fixed boxes don't move. */
export function compact(items: Box[], fixed: Box[] = []): Box[] {
  const placed: Box[] = fixed.map((b) => ({ ...b }));
  const fixedIds = new Set(fixed.map((b) => b.i));
  const out = new Map<string, Box>(placed.map((b) => [b.i, b]));
  for (const b of [...items].filter((b) => !fixedIds.has(b.i)).sort(byPos)) {
    const s = settle(placed, b);
    placed.push(s);
    out.set(s.i, s);
  }
  return items.map((b) => out.get(b.i)!);
}

export type Interaction =
  | { kind: "move"; id: string; x: number; y: number }
  | { kind: "resize"; id: string; w: number; h: number };

/**
 * The board while one widget is moved or resized. `base` is the saved
 * layout (compacted). Returns every box, compacted, including the moved one
 * where it will land.
 */
export function preview(base: Box[], act: Interaction, limits: Record<string, Limits>): Box[] {
  const me = base.find((b) => b.i === act.id);
  if (!me) return compact(base);
  const others = base.filter((b) => b.i !== act.id);

  if (act.kind === "resize") {
    const r = clampBox({ ...me, w: act.w, h: act.h }, limits[me.i]);
    const fixed = { ...r, x: Math.min(me.x, COLS - r.w) };
    const moved = compact(others, [fixed]);
    return compact([fixed, ...moved]);
  }

  let target = clampBox({ ...me, x: act.x, y: act.y });
  // Dropped mostly onto one other widget: trade places with it.
  const hits = others.filter((o) => collides(o, target));
  if (hits.length === 1) {
    const o = hits[0];
    const share = overlapArea(o, target) / Math.min(o.w * o.h, target.w * target.h);
    if (share >= 0.5) {
      const mine = clampBox({ ...me, x: o.x, y: o.y });
      const theirs = clampBox({ ...o, x: me.x, y: me.y });
      if (!collides(mine, theirs)) {
        const rest = compact(
          others.filter((b) => b.i !== o.i),
          [mine, theirs]
        );
        return compact([mine, theirs, ...rest]);
      }
    }
  }
  // Top edge past the middle of a widget = go below it (instead of pushing it down,
  // which would just slide this one back up where it came from).
  const settled = compact(others);
  for (let guard = 0; guard < 50; guard++) {
    const top = target.y;
    const over = settled.filter((o) => collides(o, target) && top >= o.y + o.h / 2);
    if (!over.length) break;
    target = { ...target, y: Math.max(...over.map((o) => o.y + o.h)) };
  }
  const moved = compact(settled, [target]);
  return compact([target, ...moved]);
}

/** First free spot (top to bottom, left to right) for a new w×h widget. */
export function firstFit(items: Box[], id: string, w: number, h: number): Box {
  const ww = Math.min(COLS, w);
  for (let y = 0; y <= bottom(items); y++)
    for (let x = 0; x <= COLS - ww; x++) {
      const b = { i: id, x, y, w: ww, h };
      if (!items.some((o) => collides(o, b))) return b;
    }
  return { i: id, x: 0, y: bottom(items), w: ww, h };
}

/**
 * Grow widgets into empty space beside them (right, then left, then down),
 * within their limits. Widgets you sized yourself (`keep`) stay as they are.
 * Display only: saved sizes don't change.
 */
export function fill(items: Box[], limits: Record<string, Limits>, keep: Set<string> = new Set()): Box[] {
  const out = items.map((b) => ({ ...b }));
  const maxY = bottom(out);
  const free = (b: Box) => b.x >= 0 && b.x + b.w <= COLS && b.y >= 0 && b.y + b.h <= maxY && !out.some((o) => collides(o, b));
  const order = [...out].sort(byPos);
  for (const b of order) {
    if (keep.has(b.i)) continue;
    const lim = limits[b.i];
    while (b.w < (lim?.maxW ?? COLS) && free({ i: b.i, x: b.x + b.w, y: b.y, w: 1, h: b.h })) b.w++;
    while (b.w < (lim?.maxW ?? COLS) && free({ i: b.i, x: b.x - 1, y: b.y, w: 1, h: b.h })) {
      b.x--;
      b.w++;
    }
  }
  for (const b of order) {
    if (keep.has(b.i)) continue;
    const lim = limits[b.i];
    while (b.h < (lim?.maxH ?? 99) && free({ i: b.i, x: b.x, y: b.y + b.h, w: b.w, h: 1 })) b.h++;
  }
  return out;
}

/** Reading order (top to bottom, left to right): how phones stack them. */
export const readingOrder = (items: Box[]) => [...items].sort(byPos).map((b) => b.i);
