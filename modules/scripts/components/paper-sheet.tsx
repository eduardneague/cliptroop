"use client";

import { useSyncExternalStore } from "react";

/**
 * The script page's paper and header while it loads: the paper the person picked (light or dark) and as wide as they
 * keep it, so the page doesn't change look or width when the text arrives.
 */
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const subscribe = (f: () => void) => {
  window.addEventListener("storage", f);
  return () => window.removeEventListener("storage", f);
};

/** Light or dark paper (script-editor.tsx's PAPER_KEY). */
function useStoredPaper(): "light" | "dark" {
  return useSyncExternalStore(subscribe, () => (read("vp:script-paper") === "dark" ? "dark" : "light"), () => "light");
}

/** How wide the page is kept (1.55.6; script-editor.tsx's WIDTH_KEY and STRIP_W): Normal, Wide or the whole width. */
const PAPER_W: Record<string, string> = { normal: "max-w-3xl", wide: "max-w-[1080px]", full: "max-w-none" };
function useStoredWidth(): string {
  return useSyncExternalStore(subscribe, () => PAPER_W[read("vp:script-width") ?? ""] ?? PAPER_W.normal, () => PAPER_W.normal);
}

export function PaperSheet({ children }: { children: React.ReactNode }) {
  const paper = useStoredPaper();
  const width = useStoredWidth();
  return (
    <div data-paper={paper} className={`script-paper mx-auto w-full ${width} rounded-2xl px-5 sm:px-14 py-8 sm:py-14 border border-line/10 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)]`}>
      {children}
    </div>
  );
}

/**
 * The header while the page loads (1.55.6): the real one's box (script-editor.tsx), so it sits in the same place (on a
 * computer it sticks right under the app's bar: the editor's UNDER_BAR) and, with the glass look, is the same card
 * hanging from the floating bar, over the same paper.
 */
export function PaperHead({ children }: { children: React.ReactNode }) {
  const paper = useStoredPaper();
  return (
    <div data-script-head="" data-paper={paper} className="no-print isolate bg-paper relative z-[15] sm:sticky sm:top-[var(--script-head-top,var(--shell-top,56px))]">
      {children}
    </div>
  );
}
