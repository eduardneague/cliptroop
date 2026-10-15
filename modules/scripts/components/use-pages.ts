"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { pageAt, pageGeometry, placeBlocks, sameShifts, shiftsOf, type Block, type Sheet, type Shift } from "../lib/pages";

/**
 * Pages and Grid (1.23.1): each block of the script moved onto its page, on
 * screen only (lib/pages.ts). The moves are node decorations (a CSS
 * transform), never saved, and they don't change the layout: measuring
 * again after a move gives the same answer, so the text never jumps around
 * while you type, and the page you're writing on is the editor itself
 * (Grid included: write on any page, like Word's multiple pages).
 */
type PagesState = { shifts: Shift[]; deco: DecorationSet };
export const pagesKey = new PluginKey<PagesState>("pagePlaces");

function draw(doc: PMNode, shifts: Shift[]): DecorationSet {
  const decos: Decoration[] = [];
  for (const s of shifts) {
    if (!s.dx && !s.dy) continue;
    const node = doc.nodeAt(s.pos);
    if (!node) continue;
    decos.push(Decoration.node(s.pos, s.pos + node.nodeSize, { style: `transform: translate(${s.dx}px, ${s.dy}px)` }));
  }
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

export const PagePlaces = Extension.create({
  name: "pagePlaces",
  addProseMirrorPlugins() {
    return [
      new Plugin<PagesState>({
        key: pagesKey,
        state: {
          init: () => ({ shifts: [], deco: DecorationSet.empty }),
          apply(tr, value, _old, state) {
            const next = tr.getMeta(pagesKey) as Shift[] | undefined;
            if (next) return { shifts: next, deco: draw(state.doc, next) };
            if (!tr.docChanged || !value.shifts.length) return value;
            // Until it's measured again (the next frame), each block keeps its move.
            return { shifts: value.shifts.map((s) => ({ ...s, pos: tr.mapping.map(s.pos) })), deco: value.deco.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations(state) {
            return pagesKey.getState(state)?.deco ?? null;
          },
          handleDOMEvents: {
            // A click on the editor itself but not on its text (where a block was before it moved to its page).
            mousedown(view, event) {
              if (event.button !== 0 || event.target !== view.dom || !pagesKey.getState(view.state)?.shifts.length) return false;
              if (!caretNear(view, event.clientX, event.clientY)) return false;
              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});

const LISTS = new Set(["bulletList", "orderedList", "taskList"]);

/** What measuring needs from the editor (the harness gives a stand-in). */
export type PagesView = Pick<EditorView, "dom" | "nodeDOM">;
type PagesNode = { type: { name: string }; forEach: (fn: (child: PagesNode, offset: number) => void) => void };
export type PagesDoc = { forEach: (fn: (node: PagesNode, offset: number) => void) => void };

/** Its top inside `root`, from the layout (a transform doesn't change it). NaN when root isn't on its way up. */
function topWithin(el: HTMLElement, root: HTMLElement): number {
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return n === root ? y : NaN;
}

export type PagesLayout = {
  pages: number;
  /** One page's size and margins (the paper's own box is the first page). */
  pageW: number;
  pageH: number;
  padTop: number;
  padBottom: number;
  padX: number;
  /** Each page's place (from the first page's top left) and height; everything together. */
  sheets: Sheet[];
  width: number;
  height: number;
};

/** The blocks of the script as laid out now (one long column), in order. */
export function measureBlocks(view: PagesView, doc: PagesDoc): { blocks: Block[]; els: HTMLElement[] } {
  const root = view.dom as HTMLElement;
  const blocks: Block[] = [];
  const els: HTMLElement[] = [];
  const add = (node: PagesNode, pos: number) => {
    const el = view.nodeDOM(pos);
    if (!(el instanceof HTMLElement)) return;
    const isBreak = node.type.name === "pageBreak";
    const height = el.offsetHeight;
    if (!height && !isBreak) return; // (Hidden.)
    const top = topWithin(el, root);
    if (!Number.isFinite(top)) return;
    blocks.push({ pos, top, height, keepWithNext: node.type.name === "heading", breakAfter: isBreak });
    els.push(el);
  };
  doc.forEach((node, offset) => {
    // A list's items move one by one (a long list goes on over pages).
    if (LISTS.has(node.type.name)) node.forEach((item, o) => add(item, offset + 1 + o));
    else add(node, offset);
  });
  return { blocks, els };
}

/** One measurement: where every block goes, and the pages. `cols`: 1 for Pages, 2 or 3 for Grid. */
export function measurePages(view: PagesView, doc: PagesDoc, paper: HTMLElement, o: { ratio: number; gap: number; cols: number }): { shifts: Shift[]; layout: PagesLayout } {
  const pageW = paper.offsetWidth;
  const pageH = Math.round(pageW * o.ratio);
  const cs = getComputedStyle(paper);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const padX = parseFloat(cs.paddingLeft) || 0;
  const { blocks } = measureBlocks(view, doc);
  const placement = placeBlocks(blocks, Math.max(40, pageH - padTop - padBottom));
  const geo = pageGeometry(placement, { width: pageW, height: pageH, gap: o.gap, cols: o.cols });
  return {
    shifts: shiftsOf(blocks, placement, geo.sheets),
    layout: { pages: placement.pages, pageW, pageH, padTop, padBottom, padX, sheets: geo.sheets, width: geo.width, height: geo.height },
  };
}

/** The editor's latest page layout (for clicks on empty paper). */
const layouts = new WeakMap<HTMLElement, { layout: PagesLayout; zoom: number; paper: HTMLElement }>();

/**
 * A click on empty paper (a margin, between two blocks, below the last one):
 * the caret goes to the closest text on that page, the way Word does it.
 * True when it placed the caret.
 */
export function caretNear(view: EditorView, x: number, y: number): boolean {
  const known = layouts.get(view.dom as HTMLElement);
  const shifts = pagesKey.getState(view.state)?.shifts ?? [];
  if (!known || !shifts.length) return false;
  const box = known.paper.getBoundingClientRect();
  const z = known.zoom || 1;
  const page = pageAt(known.layout.sheets, known.layout.pageW, (x - box.left) / z, (y - box.top) / z);
  if (page === null) return false;
  // The closest block on that page, on screen.
  let best: { r: DOMRect; d: number } | null = null;
  for (const s of shifts) {
    if (s.page !== page) continue;
    const el = view.nodeDOM(s.pos);
    if (!(el instanceof HTMLElement)) continue;
    const r = el.getBoundingClientRect();
    if (!r.height) continue;
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (!best || d < best.d) best = { r, d };
  }
  if (!best) return false;
  const hit = view.posAtCoords({ left: Math.min(Math.max(x, best.r.left + 2), best.r.right - 2), top: Math.min(Math.max(y, best.r.top + 2), best.r.bottom - 2) });
  if (!hit) return false;
  view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(hit.pos))));
  view.focus();
  return true;
}

/**
 * Lays the script out on pages (Pages and Grid only): measured after every
 * change (the frame after, before it's drawn), when the page width changes,
 * and when fonts or pictures arrive. `zoom`: the scale the pages are shown
 * at (to turn screen points into the page's own).
 */
export function usePages(
  editor: Editor | null,
  opts: { on: boolean; cols: number; paper: React.RefObject<HTMLDivElement | null>; ratio: number; gap: number; zoom: number }
): PagesLayout & { remeasure: () => void } {
  const [layout, setLayout] = useState<PagesLayout>({ pages: 1, pageW: 794, pageH: 1123, padTop: 72, padBottom: 72, padX: 72, sheets: [{ x: 0, y: 0, height: 1123 }], width: 794, height: 1123 });
  const run = useRef<() => void>(() => {});
  const refs = useRef(opts);
  refs.current = opts;
  const { on, cols, ratio, gap } = opts;

  useEffect(() => {
    if (!editor) return;
    const clear = () => {
      if (!editor.isDestroyed && pagesKey.getState(editor.state)?.shifts.length) editor.view.dispatch(editor.state.tr.setMeta(pagesKey, []).setMeta("addToHistory", false));
      layouts.delete(editor.view.dom as HTMLElement);
    };
    if (!on) {
      clear();
      return;
    }
    let raf = 0;
    const measure = () => {
      const paper = refs.current.paper.current;
      if (!paper || editor.isDestroyed) return;
      const { shifts, layout: next } = measurePages(editor.view, editor.state.doc as unknown as PagesDoc, paper, { ratio, gap, cols });
      layouts.set(editor.view.dom as HTMLElement, { layout: next, zoom: refs.current.zoom || 1, paper });
      if (!sameShifts(pagesKey.getState(editor.state)?.shifts ?? [], shifts)) editor.view.dispatch(editor.state.tr.setMeta(pagesKey, shifts).setMeta("addToHistory", false));
      setLayout((l) =>
        l.pages === next.pages && l.pageW === next.pageW && l.pageH === next.pageH && l.padTop === next.padTop && l.padX === next.padX && l.width === next.width && l.height === next.height && l.sheets.every((s, i) => s.y === next.sheets[i]?.y && s.height === next.sheets[i]?.height)
          ? l
          : next
      );
    };
    // (A frame callback runs before the frame is drawn: a block that no longer fits is already on its next page.)
    const soon = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    run.current = soon;
    soon();
    editor.on("update", soon);
    const ro = new ResizeObserver(soon);
    ro.observe(editor.view.dom as HTMLElement);
    if (opts.paper.current) ro.observe(opts.paper.current);
    void document.fonts?.ready.then(soon);
    return () => {
      cancelAnimationFrame(raf);
      editor.off("update", soon);
      ro.disconnect();
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, on, cols, ratio, gap]);

  // The zoom changes the screen size only: what a click means, not where things go.
  useEffect(() => {
    if (!editor) return;
    const known = layouts.get(editor.view.dom as HTMLElement);
    if (known) known.zoom = opts.zoom || 1;
  }, [editor, opts.zoom]);

  const remeasure = useCallback(() => run.current(), []);
  return { ...layout, remeasure };
}
