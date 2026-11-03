"use client";

import { useEffect, useState } from "react";

/*
 * "Once the page has nothing else to do" (1.32.2): for code that isn't
 * needed to draw the page, like the search window's, the bell's cards, or the
 * celebrations' listeners. The browser says when it's idle; `timeout` is the
 * latest it waits (a busy page still gets it). Safari has no idle callback:
 * a short wait instead.
 */
type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Runs `f` once the page is idle (at most `timeout` ms later). Returns what stops it. */
export function whenIdle(f: () => void, timeout = 4000): () => void {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(f, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(f, Math.min(timeout, 1500));
  return () => window.clearTimeout(t);
}

/** True once the page has been idle (at most `timeout` ms after it's drawn). */
export function useIdle(timeout = 4000): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => whenIdle(() => setIdle(true), timeout), [timeout]);
  return idle;
}
