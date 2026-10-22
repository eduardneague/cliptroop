"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeMenu, type MenuPlace } from "@/lib/menu-place";

/**
 * A dropdown that opens from its button, rendered at the top of the page (a
 * portal), so blurred / sticky bars can never trap it.
 *   Phones: full width with 12px on each side, scrolls if tall.
 *   Larger: under the button, aligned to its left or right edge.
 * It opens up instead when it doesn't fit below and there's more room above
 * (a button at the bottom of a popup: the idea window's Start, 1.29.9), and
 * sits above popups, so one opened from inside a popup is never hidden
 * behind it. Closes on an outside tap, Escape (just the menu, not the popup
 * it came from), or once its button scrolls off the screen (until then it
 * follows it).
 */
export function AnchoredMenu({
  open,
  onClose,
  anchor,
  width = 280,
  align = "right",
  maxHeight,
  children,
  label,
  role = "menu",
}: {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement | null>;
  width?: number;
  align?: "left" | "right";
  /** The tallest it gets (it scrolls inside after that); the room on screen otherwise. */
  maxHeight?: number;
  children: React.ReactNode;
  label?: string;
  /** "dialog" for a box of choices that isn't a list of commands (Search's filter pills, 1.30.0). */
  role?: "menu" | "dialog";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPlace | null>(null);
  // How tall it wants to be, once it has been drawn (decides up or down from then on).
  const natural = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      natural.current = null;
      return setPos(null);
    }
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setPos(placeMenu({ anchor: r, vw: window.innerWidth, vh: window.innerHeight, width, align, natural: natural.current, maxHeight }));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, width, align, maxHeight]);

  // Drawn once: if what's inside doesn't fit where it opened, place it again knowing its height (still before it shows).
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el || !pos || natural.current !== null) return;
    natural.current = el.scrollHeight;
    const r = anchor.current?.getBoundingClientRect();
    if (!r || el.scrollHeight <= el.clientHeight + 1) return;
    const next = placeMenu({ anchor: r, vw: window.innerWidth, vh: window.innerHeight, width, align, natural: el.scrollHeight, maxHeight });
    if (next.up !== pos.up) setPos(next);
  }, [pos, anchor, width, align, maxHeight]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      // A dropdown opened from inside the panel lives in its own portal.
      if (t instanceof Element && t.closest("[data-floating-menu]")) return;
      onClose();
    };
    // First (capturing), and marked as handled: Escape closes this menu, not the popup or panel it was opened from.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.activeElement instanceof Element && document.activeElement.closest("[data-floating-menu]")) return;
      e.preventDefault();
      onClose();
    };
    // Something around it scrolled: it follows its button while the button is on screen (1.30.0: a row of filter
    // pills that slides sideways on a phone, the page moving a little), and closes once the button has gone.
    let frame = 0;
    const onScroll = (e: Event) => {
      if (panel.current && e.target instanceof Node && panel.current.contains(e.target)) return;
      if (e.target instanceof Element && e.target.closest("[data-floating-menu]")) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = anchor.current?.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (!r || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw || (r.width === 0 && r.height === 0)) return onClose();
        setPos(placeMenu({ anchor: r, vw, vh, width, align, natural: natural.current, maxHeight }));
      });
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      cancelAnimationFrame(frame);
    };
  }, [open, onClose, anchor, width, align, maxHeight]);

  if (!open || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panel}
      role={role}
      aria-label={label}
      className={`glass-pane styled-scroll fixed z-[125] rounded-2xl border border-line/15 bg-surface shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] overflow-y-auto overflow-x-hidden overscroll-contain animate-[modalin_.14s_var(--ease-out)] ${pos.up ? "origin-bottom" : "origin-top"}`}
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
    >
      {children}
    </div>,
    document.body
  );
}
