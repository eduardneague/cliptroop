"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { pageBreaks, sameBreaks, type Line, type PageBreak, type Unit } from "../lib/pages";

/**
 * Pages view (1.23.0): the breaks between pages, drawn as gaps in the text
 * (decorations, never saved), so every page has the same top and bottom
 * margin. The gaps follow the edits; the layout is measured again a moment
 * after each change.
 */
type PagesState = { breaks: PageBreak[]; deco: DecorationSet };
export const pagesKey = new PluginKey<PagesState>("pageBreaks");

function draw(doc: PMNode, breaks: PageBreak[]): DecorationSet {
  if (!breaks.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    breaks.map((b, i) =>
      Decoration.widget(
        b.pos,
        () => {
          const el = document.createElement("span");
          el.className = "pm-page-gap no-print";
          el.style.height = `${Math.max(0, b.height)}px`;
          el.contentEditable = "false";
          el.setAttribute("aria-hidden", "true");
          el.dataset.page = String(i + 2);
          return el;
        },
        { side: 1, key: `gap-${b.pos}-${Math.round(b.height)}`, ignoreSelection: true }
      )
    )
  );
}

export const PageBreaks = Extension.create({
  name: "pageBreaks",
  addProseMirrorPlugins() {
    return [
      new Plugin<PagesState>({
        key: pagesKey,
        state: {
          init: () => ({ breaks: [], deco: DecorationSet.empty }),
          apply(tr, value, _old, state) {
            const next = tr.getMeta(pagesKey) as PageBreak[] | undefined;
            if (next) return { breaks: next, deco: draw(state.doc, next) };
            if (!tr.docChanged || !value.breaks.length) return value;
            // Until it's measured again, the gaps move with the words.
            const breaks = value.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos, 1) }));
            return { breaks, deco: draw(state.doc, breaks) };
          },
        },
        props: {
          decorations(state) {
            return pagesKey.getState(state)?.deco ?? null;
          },
        },
      }),
    ];
  },
});

const LISTS = new Set(["bulletList", "orderedList", "taskList"]);

/** What measuring needs from the editor (the harness gives a stand-in). */
export type PagesView = {
  nodeDOM: (pos: number) => globalThis.Node | null;
  posAtDOM: (node: globalThis.Node, offset: number) => number;
};
type PagesNode = { type: { name: string }; isAtom: boolean; forEach: (fn: (child: PagesNode, offset: number) => void) => void };
export type PagesDoc = { forEach: (fn: (node: PagesNode, offset: number) => void) => void };

/**
 * One measurement: the blocks and their lines as laid out now (minus the
 * gaps already drawn), and where the pages break. `z` is the page's zoom.
 */
export function measurePages(view: PagesView, doc: PagesDoc, paper: HTMLElement, content: HTMLElement, z: number, ratio: number, gap: number) {
  const pageW = paper.offsetWidth;
  const pageH = Math.round(pageW * ratio);
  const cs = getComputedStyle(paper);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const padX = parseFloat(cs.paddingLeft) || 0;
  const origin = paper.getBoundingClientRect().top;
  const local = (y: number) => (y - origin) / z;
  // The gaps already drawn don't count: positions as if there were none.
  const gaps = Array.from(content.querySelectorAll<HTMLElement>(".pm-page-gap")).map((el) => {
    const r = el.getBoundingClientRect();
    return { top: local(r.top), h: r.height / z };
  });
  // A gap is above a top edge when it starts at or above it, and above a
  // bottom edge only when it starts before it (the line just before a gap
  // ends where the gap begins). Whole pixels of slack: layout is fractional.
  const natTop = (y: number) => {
    let s = 0;
    for (const g of gaps) if (g.top <= y + 1) s += g.h;
    return y - s;
  };
  const natBottom = (y: number) => {
    let s = 0;
    for (const g of gaps) if (g.top < y - 1) s += g.h;
    return y - s;
  };
  // Where each line of a block starts. Measured on the characters themselves
  // (a point on screen only finds the lines in view; this finds all of them).
  const range = document.createRange();
  const charTop = (n: Text, i: number) => {
    range.setStart(n, i);
    range.setEnd(n, i + 1);
    const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
    return r.top;
  };
  const linesOf = (el: HTMLElement): Line[] => {
    // A line's box is its line height, not just the letters: the page's top
    // margin is measured to it, the same as the first page's.
    const lhOf = (n: Text) => {
      const v = parseFloat(getComputedStyle(n.parentElement ?? el).lineHeight);
      return Number.isFinite(v) ? v : null;
    };
    const found: { top: number; bottom: number; node: Text; offset: number }[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
      const len = n.data.length;
      if (!len || !n.data.trim() || (n.parentElement && n.parentElement.closest('[contenteditable="false"]'))) continue;
      range.selectNodeContents(n);
      const frags = Array.from(range.getClientRects()).filter((r) => r.height > 0);
      frags.forEach((f, k) => {
        // The first character on this fragment's line.
        let lo = 0;
        let hi = len - 1;
        if (k > 0) {
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (charTop(n!, mid) < f.top - 1) lo = mid + 1;
            else hi = mid;
          }
        }
        const lh = lhOf(n!);
        const lead = lh ? (lh * z - f.height) / 2 : 0;
        found.push({ top: f.top - lead, bottom: f.bottom + lead, node: n!, offset: k > 0 ? lo : 0 });
      });
    }
    const lines: Line[] = [];
    let last: { top: number; bottom: number } | null = null;
    for (const f of found) {
      if (last && Math.abs(f.top - last.top) < 3) {
        // Same line, another piece (bold, a link…): it only makes the line taller.
        last.bottom = Math.max(last.bottom, f.bottom);
        lines[lines.length - 1].bottom = natBottom(local(last.bottom));
        continue;
      }
      let pos: number;
      try {
        pos = view.posAtDOM(f.node, f.offset);
      } catch {
        continue;
      }
      if (lines.length && pos <= lines[lines.length - 1].pos) continue;
      last = { top: f.top, bottom: f.bottom };
      lines.push({ top: natTop(local(f.top)), bottom: natBottom(local(f.bottom)), pos });
    }
    return lines;
  };
  const units: Unit[] = [];
  const add = (node: PagesNode, pos: number) => {
    const el = view.nodeDOM(pos);
    if (!(el instanceof HTMLElement)) return;
    const r = el.getBoundingClientRect();
    if (!r.height) return;
    units.push({
      top: natTop(local(r.top)),
      bottom: natBottom(local(r.bottom)),
      marginTop: parseFloat(getComputedStyle(el).marginTop) || 0,
      pos,
      heading: node.type.name === "heading",
      lines: node.isAtom ? undefined : () => linesOf(el),
    });
  };
  doc.forEach((node, offset) => {
    if (LISTS.has(node.type.name)) node.forEach((item, o) => add(item, offset + 1 + o));
    else add(node, offset);
  });
  const { breaks, pages } = pageBreaks(units, { height: pageH, gap, padTop, padBottom });
  return { breaks, pages, pageH, pageW, padTop, padBottom, padX };
}

/**
 * Measures the pages (on, and only on, the Pages and Grid views) and sets
 * the breaks. `scale` is the zoom of the page (Wide / Full), so screen
 * pixels can be turned back into the page's own.
 */
export function usePages(
  editor: Editor | null,
  opts: { on: boolean; paper: React.RefObject<HTMLDivElement | null>; content: React.RefObject<HTMLDivElement | null>; ratio: number; gap: number; scale: React.RefObject<number> }
) {
  const [layout, setLayout] = useState({ pageH: 1123, pageW: 794, pages: 1, padTop: 72, padBottom: 72, padX: 72 });
  const run = useRef<() => void>(() => {});
  const { on, ratio, gap } = opts;
  const refs = useRef(opts);
  refs.current = opts;

  useEffect(() => {
    if (!editor) return;
    const clear = () => {
      if (!editor.isDestroyed && pagesKey.getState(editor.state)?.breaks.length) editor.view.dispatch(editor.state.tr.setMeta(pagesKey, []).setMeta("addToHistory", false));
    };
    if (!on) {
      clear();
      return;
    }
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // New breaks move the text, which is measured again: that settles in a
    // pass or two. If it ever kept changing on its own, it stops until the
    // next edit (no endless redrawing).
    let churn = 0;
    let lastW = 0;
    const measure = () => {
      const paper = refs.current.paper.current;
      const content = refs.current.content.current;
      if (!paper || !content || editor.isDestroyed) return;
      const { breaks, pages, pageH, pageW, padTop, padBottom, padX } = measurePages(
        editor.view,
        editor.state.doc as unknown as PagesDoc,
        paper,
        content,
        refs.current.scale.current || 1,
        ratio,
        gap
      );
      // A new width is a new layout (a panel opened, the window was resized).
      if (pageW !== lastW) churn = 0;
      lastW = pageW;
      const now = pagesKey.getState(editor.state)?.breaks ?? [];
      if (!sameBreaks(now, breaks) && churn++ < 6) editor.view.dispatch(editor.state.tr.setMeta(pagesKey, breaks).setMeta("addToHistory", false));
      setLayout((l) =>
        l.pageH === pageH && l.pageW === pageW && l.pages === pages && l.padTop === padTop && l.padBottom === padBottom && l.padX === padX ? l : { pageH, pageW, pages, padTop, padBottom, padX }
      );
    };
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(measure);
      }, 120);
    };
    const edited = () => {
      churn = 0;
      soon();
    };
    run.current = edited;
    raf = requestAnimationFrame(measure);
    editor.on("update", edited);
    const ro = new ResizeObserver(soon);
    if (opts.paper.current) ro.observe(opts.paper.current);
    if (opts.content.current) ro.observe(opts.content.current);
    window.addEventListener("resize", edited);
    void document.fonts?.ready.then(edited);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      editor.off("update", edited);
      ro.disconnect();
      window.removeEventListener("resize", edited);
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, on, ratio, gap]);

  const remeasure = useCallback(() => run.current(), []);
  return { ...layout, remeasure };
}
