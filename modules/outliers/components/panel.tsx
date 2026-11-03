"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon, CloseIcon } from "@/components/ui/icons";
import { motionReduced } from "@/components/ui/count-up";
import { useLatest, useScrollLock } from "@/lib/hooks/use-scroll-lock";
import { Leaves } from "@/components/ui/leaves";

/*
 * The side panel a video or channel opens in (1.27.0): from the right on
 * computers (the page stays in view behind it), the whole screen on phones.
 * Esc or the X closes it, focus stays inside while it's open and goes back
 * to what opened it. Above the app's bars, below menus and popups opened
 * from inside it.
 *
 * One frame for the whole visit (1.29.9): going from a video to its channel,
 * to another video, or back, changes what's inside; the panel itself stays
 * where it is (it used to close and slide in again, and the page behind
 * flickered). The new content starts at the top with a soft fade.
 *
 *   <PanelFrame>  the panel: the dim page behind, the bar, the scrolling body
 *   <PanelContent> what a video or channel panel puts in it: its name for
 *                  screen readers, the bar's middle and its body
 */

const noop = () => () => {};

type FrameApi = {
  /** Where the bar's middle goes. */
  header: HTMLDivElement | null;
  setLabel: (label: string) => void;
  /** Something else is shown (another video or channel): back to the top, softly. */
  shown: (key: string) => void;
};
const FrameCtx = createContext<FrameApi | null>(null);

export function PanelFrame({ onClose, onBack, backLabel, children }: { onClose: () => void; onBack?: (() => void) | null; backLabel?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  const [header, setHeader] = useState<HTMLDivElement | null>(null);
  const [label, setLabel] = useState("Video");
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
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
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

  const api = useMemo<FrameApi>(
    () => ({
      header,
      setLabel,
      shown: (key) => {
        if (last.current === key) return;
        const before = last.current;
        last.current = key;
        if (before === null) return;
        body.current?.scrollTo({ top: 0 });
        // What was clicked went away with the old content: keep the keyboard in the panel.
        const b = box.current;
        if (b && !b.contains(document.activeElement)) b.focus({ preventScroll: true });
        if (!motionReduced()) inner.current?.animate?.([{ opacity: 0.25, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      },
    }),
    [header]
  );

  // In the page's own HTML (a link that opens a panel) it waits for the browser: the panel lives at the end of the page.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <FrameCtx.Provider value={api}>
      <Leaves lock>
        <div className="fixed inset-0 z-[65] flex justify-end" data-outliers-panel-root>
          <div className="pop-dim absolute inset-0 bg-black/45 hidden md:block" onClick={onClose} aria-hidden />
          <div
            ref={box}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            data-outliers-panel
            tabIndex={-1}
            className="relative h-full w-full md:w-[min(760px,calc(100vw-72px))] xl:w-[min(860px,calc(100vw-120px))] bg-paper md:border-l md:border-line/15 shadow-2xl outline-none flex flex-col pop-drawer"
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
              <div ref={setHeader} className="flex-1 min-w-0 flex items-center gap-2" />
              <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0">
                <CloseIcon className="w-[18px] h-[18px]" />
              </button>
            </div>
            <div ref={body} className="relative flex-1 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
              <div ref={inner}>{children}</div>
            </div>
          </div>
        </div>
      </Leaves>
    </FrameCtx.Provider>,
    document.body
  );
}

/**
 * A video's or channel's content in the panel (inside a PanelFrame): `label`
 * names the panel for screen readers, `header` is the bar's middle (who /
 * what, and actions), `bodyKey` changes when another video or channel is
 * shown.
 */
export function PanelContent({ label, header, bodyKey, children }: { label: string; header?: React.ReactNode; bodyKey: string; children: React.ReactNode }) {
  const frame = useContext(FrameCtx);
  const setLabel = frame?.setLabel;
  const shown = frame?.shown;
  useLayoutEffect(() => setLabel?.(label), [label, setLabel]);
  useLayoutEffect(() => shown?.(bodyKey), [bodyKey, shown]);
  return (
    <>
      {frame?.header && header ? createPortal(header, frame.header) : null}
      {children}
    </>
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
