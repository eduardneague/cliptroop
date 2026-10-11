"use client";

import { useEffect, useRef } from "react";

/*
 * Page scroll locked while a popup is open (dialogs, sheets, the search
 * palette, the tour, the sketch studio, the lightbox).
 *
 * Counted, not "save and restore": with two popups open, the one that closes
 * first can't hand back a "locked" page to the one that closes last (the
 * old way left the page stuck without a scrollbar until a refresh). The page
 * scrolls again the moment the last lock is let go, whatever the order.
 */

let locks = 0;

/** Locks page scroll; call what it returns to let go (calling it twice is harmless). */
export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  locks++;
  if (locks === 1) document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = "";
  };
}

/** True while some popup holds the page still. */
export const scrollLocked = () => locks > 0;

/**
 * The safety net: a page left without scrolling while nothing is open (a
 * browser extension, an old tab's code) gets it back. Called on every move to
 * another page.
 */
export function releaseStrayScrollLock() {
  if (typeof document === "undefined" || locks > 0) return;
  if (document.body.style.overflow === "hidden") document.body.style.overflow = "";
}

/** Holds the lock while `active` (or while mounted, when left out). */
export function useScrollLock(active = true) {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
}

/**
 * The latest version of a callback, for listeners that shouldn't be added
 * again every time a parent passes a new function (an inline onClose would
 * otherwise re-run a popup's setup on every re-render: focus jumping back to
 * the top, scroll locks taken and given back).
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
