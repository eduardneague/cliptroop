"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useLatest, useScrollLock } from "@/lib/hooks/use-scroll-lock";
import { CloseIcon } from "./icons";
import { Leaves } from "./leaves";
import { useUiWords } from "./ui-locale";

/**
 * The app's popup window. Closes with Esc, the X, or a click outside.
 * Focus moves inside when it opens, Tab stays inside while it's open,
 * and focus returns to whatever opened it. Bottom sheet on phones. It leaves
 * the way it came in, the dimmed page too (1.34.0, <Leaves>), also when the
 * page around it takes it away.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "sm:max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const titleId = useId();
  const uw = useUiWords();
  const boxRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Set up once per opening: a parent that re-renders (live updates, a new
  // inline onClose) never moves the focus or resets the scroll inside.
  const close = useLatest(onClose);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const raf = requestAnimationFrame(() => {
      const first = box?.querySelector<HTMLElement>(
        '[data-autofocus], button:not([disabled]):not([data-close]), input:not([disabled]), textarea, [tabindex="0"]'
      );
      // Without scrolling: a long window opens at its top even when the
      // first button is at the bottom (What's new's "Earlier updates").
      (first ?? box)?.focus({ preventScroll: true });
    });

    function onKey(e: KeyboardEvent) {
      // Inner menus (dropdowns, calendar) handle their own Esc first.
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab" && box) {
        const items = Array.from(
          box.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, a[href], [tabindex="0"]')
        ).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      // Back to what opened it (unless it's gone, or focus already moved to another popup).
      const back = opener.current;
      if (back && back.isConnected && (!document.activeElement || document.activeElement === document.body || box?.contains(document.activeElement))) back.focus?.({ preventScroll: true });
    };
  }, [open, close]);

  if (!open) return null;

  return createPortal(
    <Leaves lock>
      <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:p-4">
        <div className="pop-dim absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
        <div
          ref={boxRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          // Phones: a floating card with breathing room on every side (never flush to the edges).
          className={`glass-pane glass-lift relative w-full ${width} max-h-[92dvh] flex flex-col bg-surface rounded-2xl border border-line/15 shadow-2xl outline-none pop-modal`}
        >
          <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-line/10">
            <div className="flex-1 min-w-0">
              <h2 id={titleId} className="text-[16px] font-semibold">{title}</h2>
              {description && <p className="text-[12.5px] text-ink-soft mt-0.5">{description}</p>}
            </div>
            <button
              type="button"
              data-close
              onClick={onClose}
              aria-label={uw.close}
              className="w-8 h-8 -mr-1.5 -mt-1 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll px-5 py-4">{children}</div>
          {footer && (
            <div
              className="px-5 py-3 border-t border-line/10 flex flex-wrap justify-end gap-2"
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </Leaves>,
    document.body
  );
}
