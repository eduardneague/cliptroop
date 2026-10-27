"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { motionReduced } from "@/lib/motion";
import { minWidth } from "@/lib/breakpoints";

/*
 * The media kit's form and its pages, side by side, keep up with each other (1.39.0). The owner: "the editable boxes
 * scroll along the position of where the content is, for example if i scroll down to brand and kind words, the
 * presentation should be right there too so its easy, and highlight the part you are at".
 *
 * The part you're at is the last part of the form whose top has passed a line a third of the way down the screen
 * (the line sinks as the form runs out, so the last parts get their turn), or the part you're typing in. Its page
 * scrolls into view in the preview, unless you've just scrolled the preview yourself. A click on a page takes the
 * form to its part. Parts carry data-kit-anchor; pages carry data-page-anchor (layout.ts names them).
 */

/** The parts of the form without a page of their own (the channels, the period, the look) show the cover. */
export function pageAnchorFor(anchor: string): string {
  return anchor === "kit" || anchor === "look" ? "cover" : anchor;
}

/** Where things stop being covered by the app's top bar. */
export function barBottom(): number {
  const bar = document.querySelector('[data-shell="header"]');
  const b = bar ? bar.getBoundingClientRect().bottom : 56;
  return Number.isFinite(b) && b > 0 ? b : 56;
}

const behavior = (): ScrollBehavior => (motionReduced() ? "auto" : "smooth");

/** Side by side (a computer): the form scrolls with the window, the preview in its own box beside it. */
export function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    // The same width as the page's lg: (lib/breakpoints.ts), where the form and the preview sit side by side.
    const mq = window.matchMedia(minWidth("lg"));
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function useKitSync({ editor, preview, wide }: { editor: RefObject<HTMLElement | null>; preview: RefObject<HTMLElement | null>; wide: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const activeNow = useRef<string | null>(null);
  /** When the preview was last scrolled by hand (it's left alone for a moment after). */
  const handled = useRef(0);
  /** The window is being scrolled to a part: where things are doesn't decide the part until then. */
  const holdUntil = useRef(0);

  /** Brings a part's page into view in the preview (only if it isn't already). */
  const showPage = useCallback((anchor: string, force = false) => {
    const box = preview.current;
    if (!box || (!force && Date.now() - handled.current < 1200)) return;
    const page = box.querySelector<HTMLElement>(`[data-page-anchor="${CSS.escape(pageAnchorFor(anchor))}"]`);
    if (!page) return;
    const b = box.getBoundingClientRect();
    const r = page.getBoundingClientRect();
    const pad = 12;
    if (r.top >= b.top + pad - 1 && r.bottom <= b.bottom - pad + 1) return;
    box.scrollTo({ top: Math.max(0, box.scrollTop + (r.top - b.top) - pad), behavior: behavior() });
  }, [preview]);

  const activate = useCallback(
    (anchor: string | null, from: "place" | "focus" | "page") => {
      if (!anchor || anchor === activeNow.current) return;
      activeNow.current = anchor;
      setActive(anchor);
      if (wide && from !== "page") showPage(anchor);
    },
    [wide, showPage]
  );

  // Where the form is: on scrolling and resizing (side by side only; on a phone the preview is its own view).
  useEffect(() => {
    if (!wide) return;
    let raf = 0;
    const pick = () => {
      raf = 0;
      if (Date.now() < holdUntil.current) return;
      const root = editor.current;
      if (!root) return;
      const top = barBottom();
      const vh = window.innerHeight;
      const left = document.documentElement.scrollHeight - vh - window.scrollY;
      const near = Math.max(0, Math.min(1, 1 - left / (vh * 0.6)));
      const line = top + (vh - top) * (0.3 + 0.55 * near);
      let found: string | null = null;
      root.querySelectorAll<HTMLElement>("[data-kit-anchor]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.top <= line) found = el.dataset.kitAnchor ?? found;
      });
      // Above the first part: the first part.
      found ??= root.querySelector<HTMLElement>("[data-kit-anchor]")?.dataset.kitAnchor ?? null;
      activate(found, "place");
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [wide, editor, activate]);

  // The part you're typing in.
  useEffect(() => {
    const root = editor.current;
    if (!root) return;
    const onFocus = (e: FocusEvent) => {
      const part = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-kit-anchor]");
      if (part?.dataset.kitAnchor) activate(part.dataset.kitAnchor, "focus");
    };
    root.addEventListener("focusin", onFocus);
    return () => root.removeEventListener("focusin", onFocus);
  }, [editor, activate]);

  // The preview scrolled by hand: left alone for a moment.
  useEffect(() => {
    const box = preview.current;
    if (!box) return;
    const mine = () => {
      handled.current = Date.now();
    };
    const keys = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) mine();
    };
    box.addEventListener("wheel", mine, { passive: true });
    box.addEventListener("touchstart", mine, { passive: true });
    box.addEventListener("pointerdown", mine);
    box.addEventListener("keydown", keys);
    return () => {
      box.removeEventListener("wheel", mine);
      box.removeEventListener("touchstart", mine);
      box.removeEventListener("pointerdown", mine);
      box.removeEventListener("keydown", keys);
    };
  }, [preview, wide]);

  /** A page was clicked: the form goes to its part (its top just under the app's bar). */
  const goToPart = useCallback(
    (anchor: string) => {
      const root = editor.current;
      const part = root?.querySelector<HTMLElement>(`[data-kit-anchor="${CSS.escape(anchor)}"]`);
      if (!part) return;
      holdUntil.current = Date.now() + 1500;
      activeNow.current = anchor;
      setActive(anchor);
      const y = window.scrollY + part.getBoundingClientRect().top - barBottom() - 16;
      window.scrollTo({ top: Math.max(0, y), behavior: behavior() });
      // Where it lands decides again once it's there.
      if ("onscrollend" in window)
        window.addEventListener(
          "scrollend",
          () => {
            holdUntil.current = 0;
          },
          { once: true }
        );
      // Focus to its heading (no scrolling, no ring): a screen reader says where you are.
      part.querySelector<HTMLElement>("[data-part-title]")?.focus({ preventScroll: true });
    },
    [editor]
  );

  return { active, activate, showPage, goToPart };
}
