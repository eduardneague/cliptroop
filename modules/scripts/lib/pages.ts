/**
 * Pages view (1.23.0): real A4 pages. Every page has the same top and
 * bottom margin, like Word: where a page is full, the text continues at the
 * top of the next one. This works out where those breaks go from the
 * layout the editor measured, as if there were no breaks yet ("natural"
 * positions, in the page's own pixels). It never touches the document: the
 * breaks are drawn as gaps between the words.
 */
export type PageBox = {
  /** One page's height. */
  height: number;
  /** Space between two pages. */
  gap: number;
  /** The page's margins (the paper's padding). */
  padTop: number;
  padBottom: number;
};

export type Line = { top: number; bottom: number; pos: number };

/** A block (paragraph, heading, list item, image…) in the order of the document. */
export type Unit = {
  top: number;
  bottom: number;
  /** Its top margin: at the top of a page it goes (the gap takes its place). */
  marginTop: number;
  /** Where a break before it goes. */
  pos: number;
  heading?: boolean;
  /** Its lines, asked for only when it doesn't fit (measuring lines is slow). */
  lines?: () => Line[];
};

export type PageBreak = { pos: number; height: number };

export const pageTop = (p: PageBox, k: number) => k * (p.height + p.gap) + p.padTop;
export const pageBottom = (p: PageBox, k: number) => k * (p.height + p.gap) + p.height - p.padBottom;

/**
 * Where the text breaks to the next page, and how many pages there are.
 * A block that doesn't fit goes to the next page, or splits between its
 * lines when its first line still fits. A heading never stays alone at the
 * bottom of a page: it moves with the text after it. Something taller than
 * a page starts on its own page and runs on.
 */
export function pageBreaks(units: Unit[], p: PageBox): { breaks: PageBreak[]; pages: number } {
  const breaks: PageBreak[] = [];
  let shift = 0;
  let k = 0;
  let end = 0;
  const room = pageBottom(p, 0) - pageTop(p, 0);
  const fits = (bottom: number) => bottom <= pageBottom(p, k) + 0.5;
  const insert = (pos: number, top: number, margin: number) => {
    const height = pageTop(p, k + 1) - (top - margin);
    breaks.push({ pos, height });
    shift += height - margin;
    k++;
  };
  const runLines = (lines: Line[], from: number) => {
    for (let j = from; j < lines.length; j++) {
      const lt = lines[j].top + shift;
      if (fits(lines[j].bottom + shift)) continue;
      if (lt <= pageTop(p, k) + 0.5) continue; // one line taller than a page: let it be
      insert(lines[j].pos, lt, 0);
    }
  };

  let i = 0;
  while (i < units.length) {
    const u = units[i];
    const top = u.top + shift;
    if (fits(u.bottom + shift)) {
      end = u.bottom + shift;
      i++;
      continue;
    }
    const lines = u.lines?.() ?? [];
    if (lines.length > 1 && fits(lines[0].bottom + shift)) {
      // It starts on this page: the rest of its lines go on the next.
      runLines(lines, 1);
      end = u.bottom + shift;
      i++;
      continue;
    }
    const atTop = top - u.marginTop <= pageTop(p, k) + 0.5;
    const prev = units[i - 1];
    if (!atTop && prev?.heading && prev.top + shift - prev.marginTop > pageTop(p, k) + 0.5 && !breaks.some((b) => b.pos === prev.pos)) {
      // Keep the heading with its text: both go to the next page.
      insert(prev.pos, prev.top + shift, prev.marginTop);
      i--;
      continue;
    }
    if (!atTop) insert(u.pos, top, u.marginTop);
    if (u.bottom - u.top > room + 0.5) {
      // Taller than a page: it runs on, between its lines when it has them.
      if (lines.length > 1) runLines(lines, 1);
      else k += Math.max(0, Math.ceil((u.bottom + shift - pageBottom(p, k)) / (p.height + p.gap)));
    }
    end = u.bottom + shift;
    i++;
  }
  let pages = 1;
  while (end > pageBottom(p, pages - 1) + 0.5 && pages < 999) pages++;
  return { breaks, pages: Math.max(pages, k + 1) };
}

/** Two sets of breaks are the same (so nothing is redrawn). */
export function sameBreaks(a: PageBreak[], b: PageBreak[]) {
  return a.length === b.length && a.every((x, i) => x.pos === b[i].pos && Math.abs(x.height - b[i].height) < 1);
}
