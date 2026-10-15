"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The pages side by side, like Word's multiple pages (1.23.0): 2 or 3 in a
 * row, each a small copy of the real page (the same breaks, margins and
 * pictures). A page opens in the Pages view, at that page.
 */
export function PagesGrid({
  html,
  pages,
  pageW,
  pageH,
  padTop,
  padX,
  gap,
  cols,
  paper,
  onOpen,
}: {
  html: string;
  pages: number;
  pageW: number;
  pageH: number;
  padTop: number;
  padX: number;
  gap: number;
  cols: 2 | 3;
  paper: "light" | "dark";
  onOpen: (page: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Phones: two in a row at most, so a page stays readable.
  const n = w && w < 520 ? Math.min(cols, 2) : cols;
  const space = 20;
  const tile = n && w ? (w - space * (n - 1)) / n : 0;
  const s = pageW ? tile / pageW : 0;

  return (
    <div ref={ref} className="no-print grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: space }}>
      {Array.from({ length: pages }, (_, k) => (
        <button key={k} type="button" onClick={() => onOpen(k)} className="group text-left focus-visible:outline-none" aria-label={`Open page ${k + 1}`}>
          <div
            data-paper={paper}
            className="script-paper relative overflow-hidden rounded-md border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)] transition-shadow group-hover:ring-2 group-hover:ring-amber/60 group-focus-visible:ring-2 group-focus-visible:ring-amber"
            style={{ height: pageH * s || undefined, aspectRatio: s ? undefined : `${pageW} / ${pageH}` }}
          >
            {s > 0 && html && (
              <div
                inert
                className="pm-grid-page absolute left-0 top-0 pointer-events-none select-none"
                style={{ width: pageW, padding: `${padTop}px ${padX}px`, transform: `scale(${s}) translateY(${-k * (pageH + gap)}px)`, transformOrigin: "0 0" }}
                // A copy of the script's own pages, as the editor drew them.
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          </div>
          <span className="mt-1.5 block text-center text-[11.5px] font-semibold text-ink-soft tabular-nums group-hover:text-ink">Page {k + 1}</span>
        </button>
      ))}
    </div>
  );
}
