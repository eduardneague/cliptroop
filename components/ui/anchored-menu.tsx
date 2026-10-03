"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A dropdown that always opens DOWN from its button, rendered at the top of
 * the page (a portal), so blurred / sticky bars can never trap it.
 *   Phones: full width with 12px on each side, scrolls if tall.
 *   Larger: under the button, aligned to its left or right edge.
 * Closes on an outside tap, Escape, or when the page scrolls.
 */
export function AnchoredMenu({
  open,
  onClose,
  anchor,
  width = 280,
  align = "right",
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement | null>;
  width?: number;
  align?: "left" | "right";
  children: React.ReactNode;
  label?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const top = r.bottom + 6;
      const maxH = Math.max(160, window.innerHeight - top - 12);
      if (vw < 640) setPos({ top, left: 12, width: vw - 24, maxH });
      else {
        const w = Math.min(width, vw - 24);
        const left = align === "right" ? Math.max(12, Math.min(r.right - w, vw - w - 12)) : Math.max(12, Math.min(r.left, vw - w - 12));
        setPos({ top, left, width: w, maxH });
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, width, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      // A dropdown opened from inside the panel lives in its own portal.
      if (t instanceof Element && t.closest("[data-floating-menu]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = (e: Event) => {
      if (panel.current && e.target instanceof Node && panel.current.contains(e.target)) return;
      if (e.target instanceof Element && e.target.closest("[data-floating-menu]")) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onClose, anchor]);

  if (!open || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panel}
      role="menu"
      aria-label={label}
      className="fixed z-[70] rounded-2xl border border-line/15 bg-surface shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] overflow-y-auto overflow-x-hidden overscroll-contain animate-[modalin_.14s_var(--ease-out)]"
      style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
    >
      {children}
    </div>,
    document.body
  );
}
