"use client";

import { useEffect, useRef } from "react";

/**
 * Fills a popup's form when it opens (or when it opens on something else:
 * another `key`), and never again while it stays open. A parent that
 * re-renders while someone types (a live update arriving, a list reloading
 * after the last save) doesn't wipe what they've done.
 *
 * `fill` reads the props of the render that opened it.
 */
export function useFillOnOpen(open: boolean, key: string, fill: () => void) {
  const filled = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      filled.current = null;
      return;
    }
    if (filled.current === key) return;
    filled.current = key;
    fill();
    // Only opening (or a different key) fills: see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
}
