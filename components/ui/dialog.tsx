"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

/**
 * The app's popup window. Closes with Esc, the X, or a click outside.
 * Focus moves inside when it opens, Tab stays inside while it's open,
 * and focus returns to whatever opened it. Bottom sheet on phones.
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
  const boxRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    requestAnimationFrame(() => {
      const first = box?.querySelector<HTMLElement>(
        '[data-autofocus], button:not([disabled]):not([data-close]), input:not([disabled]), textarea, [tabindex="0"]'
      );
      (first ?? box)?.focus();
    });

    function onKey(e: KeyboardEvent) {
      // Inner menus (dropdowns, calendar) handle their own Esc first.
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:p-4">
      <div className="absolute inset-0 bg-black/50 animate-[fadein_.12s_ease]" onClick={onClose} aria-hidden />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // Phones: a floating card with breathing room on every side (never flush to the edges).
        className={`relative w-full ${width} max-h-[92dvh] flex flex-col bg-surface rounded-2xl border border-line/15 shadow-2xl outline-none animate-[modalin_.14s_ease]`}
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
            aria-label="Close"
            className="w-8 h-8 -mr-1.5 -mt-1 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll px-5 py-4">{children}</div>
        {footer && (
          <div
            className="px-5 py-3 border-t border-line/10 flex justify-end gap-2"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
