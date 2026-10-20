"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon, CloseIcon } from "@/components/ui/icons";
import { useLatest, useScrollLock } from "@/lib/hooks/use-scroll-lock";

/*
 * The side panel a video or channel opens in (1.27.0): from the right on
 * computers (the page stays in view behind it), the whole screen on phones.
 * Esc or the X closes it, focus stays inside while it's open and goes back
 * to what opened it. Above the app's bars, below menus and popups opened
 * from inside it.
 */

const noop = () => () => {};

export function PanelShell({
  label,
  onClose,
  onBack,
  backLabel,
  header,
  children,
  bodyKey,
}: {
  label: string;
  onClose: () => void;
  onBack?: (() => void) | null;
  backLabel?: string;
  /** The top bar's middle (who / what) and actions. */
  header?: React.ReactNode;
  children: React.ReactNode;
  /** Changes when another video or channel is shown: the body scrolls back to the top. */
  bodyKey: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const close = useLatest(onClose);
  useScrollLock(true);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => box.current?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        // A menu or popup opened from inside closes first.
        if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-outliers-panel]), [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab" && box.current) {
        const items = Array.from(box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, select, a[href], iframe, [tabindex="0"]')).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
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
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      if (opener && opener.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, [close]);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [bodyKey]);

  // In the page's own HTML (a link that opens a panel) it waits for the browser: the panel lives at the end of the page.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[65] flex justify-end" data-outliers-panel-root>
      <div className="absolute inset-0 bg-black/45 animate-[fadein_.15s_ease] hidden md:block" onClick={onClose} aria-hidden />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-outliers-panel
        tabIndex={-1}
        className="relative h-full w-full md:w-[min(760px,calc(100vw-72px))] xl:w-[min(860px,calc(100vw-120px))] bg-paper md:border-l md:border-line/15 shadow-2xl outline-none flex flex-col animate-[sheetup_.28s_var(--ease-out)] md:animate-[drawer-in_.26s_var(--ease-out)]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center gap-2 h-14 px-2 sm:px-3 border-b border-line/10 bg-paper/95 backdrop-blur flex-shrink-0">
          {onBack ? (
            <button type="button" onClick={onBack} aria-label={backLabel ?? "Back"} title={backLabel ?? "Back"} className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0">
              <ArrowLeftIcon className="w-[18px] h-[18px]" />
            </button>
          ) : (
            <span className="w-1 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0 flex items-center gap-2">{header}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0">
            <CloseIcon className="w-[18px] h-[18px]" />
          </button>
        </div>
        <div ref={body} className="relative flex-1 overflow-y-auto overscroll-contain styled-scroll" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** A section in a panel: a heading, an optional line under it, something on the right. */
export function PanelSection({ title, sub, right, children, className = "" }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 ${className}`}>
      <div className="flex items-end justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-semibold">{title}</h3>
          {sub && <p className="text-[12px] text-ink-faint mt-0.5">{sub}</p>}
        </div>
        {right && <div className="flex-shrink-0 flex items-center gap-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}
