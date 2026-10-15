/**
 * Pages and Grid (1.23.1): real A4 pages, like Word. The text is laid out
 * once, as one long column (its "natural" layout), and each block is then
 * moved onto its page (on screen only: a CSS transform, so the layout
 * itself never changes and nothing above the block you're typing in moves).
 * Every page has the same top and bottom margin; a block that doesn't fit
 * goes whole to the next page (Word's "keep lines together"); a heading
 * goes with the text after it; a page break (Ctrl+Enter) starts a new page;
 * a block taller than a whole page stays where it starts, and its page runs
 * longer.
 * Pages sit one under another (Pages) or 2 or 3 to a row (Grid). Pure:
 * tests/pages.test.ts.
 */

/** A block (paragraph, heading, list item, image, page break…) in the natural layout, in document order. */
export type Block = {
  /** Its position in the document (what's moved). */
  pos: number;
  /** Where it is in the natural layout (from the top of the text) and how tall. */
  top: number;
  height: number;
  /** A heading: never alone at the bottom of a page. */
  keepWithNext?: boolean;
  /** A page break: what follows starts a new page. */
  breakAfter?: boolean;
};

/** Where a block goes: its page (from 0) and how far down that page's text it starts. */
export type Placed = { pos: number; page: number; y: number };

export type Placement = {
  placed: Placed[];
  pages: number;
  /** Per page, how much taller than a page its text runs (a block taller than a page makes its page longer). */
  extra: number[];
};

/**
 * Each block's page and place on it. `room`: the height a page has for text
 * (the page minus its top and bottom margins). The space between two blocks
 * is kept as it is in the natural layout, except at the top of a page (a
 * block starts right at the top margin, like Word).
 */
export function placeBlocks(blocks: Block[], room: number): Placement {
  const placed: Placed[] = [];
  const extra: number[] = [0];
  let page = 0;
  let y = 0;
  let first = true;
  let prevBottom = 0;
  const next = () => {
    page++;
    extra[page] = 0;
    y = 0;
    first = true;
  };
  blocks.forEach((b, i) => {
    let at = first ? 0 : y + Math.max(0, b.top - prevBottom);
    // (Taller than a page: moving it wouldn't make it fit. It starts where it is and its page runs longer.)
    if (!first && !b.breakAfter && b.height <= room && at + b.height > room + 0.5) {
      next();
      at = 0;
    }
    // A heading at the bottom of a page goes with the text after it.
    const n = blocks[i + 1];
    if (b.keepWithNext && !first && n && !n.breakAfter && n.height <= room) {
      const after = at + b.height + Math.max(0, n.top - (b.top + b.height)) + n.height;
      if (after > room + 0.5) {
        next();
        at = 0;
      }
    }
    placed.push({ pos: b.pos, page, y: at });
    y = at + b.height;
    if (y > room) extra[page] = Math.max(extra[page] ?? 0, Math.ceil(y - room));
    first = false;
    prevBottom = b.top + b.height;
    if (b.breakAfter) next();
  });
  return { placed, pages: page + 1, extra: extra.slice(0, page + 1).map((x) => x ?? 0) };
}

export type PageSize = { width: number; height: number; gap: number; cols: number };
export type Sheet = { x: number; y: number; height: number };

/**
 * Where each page sits (from the top left of the first one): one under
 * another (1 column), or 2 or 3 to a row. A row is as tall as its tallest
 * page. `width` / `height`: everything together.
 */
export function pageGeometry(p: Placement, s: PageSize): { sheets: Sheet[]; width: number; height: number } {
  const cols = Math.max(1, Math.round(s.cols));
  const rows = Math.ceil(p.pages / cols);
  const rowH: number[] = [];
  for (let r = 0; r < rows; r++) {
    let h = s.height;
    for (let c = 0; c < cols; c++) h = Math.max(h, s.height + (p.extra[r * cols + c] ?? 0));
    rowH.push(h);
  }
  const rowY: number[] = [];
  let acc = 0;
  for (let r = 0; r < rows; r++) {
    rowY.push(acc);
    acc += rowH[r] + s.gap;
  }
  const sheets = Array.from({ length: p.pages }, (_, k) => {
    const r = Math.floor(k / cols);
    return { x: (k % cols) * (s.width + s.gap), y: rowY[r], height: s.height + (p.extra[k] ?? 0) };
  });
  return { sheets, width: cols * s.width + (cols - 1) * s.gap, height: Math.max(s.height, acc - s.gap) };
}

/** How far each block moves, from its natural place to its place on its page. */
export type Shift = { pos: number; page: number; dx: number; dy: number };

export function shiftsOf(blocks: Block[], p: Placement, sheets: Sheet[]): Shift[] {
  return p.placed.map((x, i) => ({ pos: x.pos, page: x.page, dx: Math.round(sheets[x.page].x), dy: Math.round(sheets[x.page].y + x.y - blocks[i].top) }));
}

/** Two sets of moves are the same (so nothing is redrawn). */
export function sameShifts(a: Shift[], b: Shift[]) {
  return a.length === b.length && a.every((x, i) => x.pos === b[i].pos && x.dx === b[i].dx && x.dy === b[i].dy && x.page === b[i].page);
}

/** Which page a point on the pages is on (page coordinates, from the first page's top left), or null between them. */
export function pageAt(sheets: Sheet[], width: number, x: number, y: number): number | null {
  const k = sheets.findIndex((s) => x >= s.x && x <= s.x + width && y >= s.y && y <= s.y + s.height);
  return k < 0 ? null : k;
}
