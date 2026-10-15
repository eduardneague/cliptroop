"use client";

import { useSyncExternalStore } from "react";

/**
 * The script page's right-hand panels (comments, writing suggestions, a
 * link's page): one at a time, so they never pile up on each other.
 * Opening one closes whichever was open.
 */
export type DockPanel = "comments" | "grammar" | "link";

let current: DockPanel | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const dock = {
  get: () => current,
  open(p: DockPanel) {
    if (current === p) return;
    current = p;
    emit();
  },
  close(p: DockPanel) {
    if (current !== p) return;
    current = null;
    emit();
  },
};

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

export function useDock(): DockPanel | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
