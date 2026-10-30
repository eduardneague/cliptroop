"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Leaves } from "./leaves";

/**
 * A card that shows while something is pointed at (1.43.0), for what explains a number without taking room on the page:
 * the owner, Oct 29 2026, on an outlier's "× its usual": "i dont want to see the mathematical equation, i want to only
 * be able to see it if i like hover over an icon there… and if i hover over the x its usual, i can see the math
 * equation too". Pointing at it (or Tab to it) opens it a beat later; leaving it (or the card) closes it, so the card
 * itself can be pointed at and read; a tap opens and closes it on a phone. Above it when there's room, else under it;
 * kept on the screen; glass like the app's menus; it leaves the way it came (Leaves).
 */
export function HoverTip({
  tip,
  children,
  className = "",
  width = 320,
  as: Tag = "span",
  focusable = true,
  style,
}: {
  /** What the card says. */
  tip: React.ReactNode;
  /** What's pointed at. */
  children: React.ReactNode;
  className?: string;
  /** The card's width, at most (less on a narrow screen). */
  width?: number;
  as?: "span" | "div";
  /** Reached with Tab (off when what's inside is a button of its own). */
  focusable?: boolean;
  style?: React.CSSProperties;
}) {
  const id = useId();
  const box = useRef<HTMLElement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean; w: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const place = useCallback(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(width, window.innerWidth - 24);
    const h = card.current?.offsetHeight ?? 120;
    const up = r.top - h - 10 > 8 || r.bottom + h + 10 > window.innerHeight;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    setPos({ left, top: up ? r.top - 8 : r.bottom + 8, up, w });
  }, [width]);

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    place();
    // Once drawn, its own height decides above or under.
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // Esc closes it; so does a tap somewhere else (a phone).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !card.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const enter = (e: React.PointerEvent) => e.pointerType === "mouse" && later(() => setOpen(true), 140);
  const leave = (e: React.PointerEvent) => e.pointerType === "mouse" && later(() => setOpen(false), 160);

  return (
    <>
      <Tag
        ref={box as React.RefObject<never>}
        className={className}
        style={style}
        tabIndex={focusable ? 0 : undefined}
        aria-describedby={open ? id : undefined}
        data-hover-tip=""
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={() => later(() => setOpen(true), 0)}
        onBlur={() => later(() => setOpen(false), 0)}
        onClick={(e: React.MouseEvent) => {
          // A tap (no hover there): open and close.
          if ((e.nativeEvent as PointerEvent).pointerType && (e.nativeEvent as PointerEvent).pointerType !== "mouse") setOpen((o) => !o);
        }}
      >
        {children}
      </Tag>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <Leaves>
            <div
              ref={card}
              id={id}
              role="tooltip"
              onPointerEnter={(e) => e.pointerType === "mouse" && timer.current && clearTimeout(timer.current)}
              onPointerLeave={leave}
              className={`pop-menu glass-pane fixed z-[140] rounded-xl border border-line/15 bg-surface shadow-[0_18px_44px_-16px_rgb(0_0_0/0.5)] px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-soft ${pos?.up ? "origin-bottom" : "origin-top"}`}
              style={{
                left: pos?.left ?? -9999,
                width: pos?.w ?? width,
                ...(pos ? (pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) : { top: -9999 }),
              }}
            >
              {tip}
            </div>
          </Leaves>,
          document.body
        )}
    </>
  );
}
