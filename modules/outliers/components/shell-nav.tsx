"use client";

import { createContext, useContext } from "react";
import type { Kind } from "../lib/types";
import type { TabId } from "../lib/view";

/*
 * Moving around the Outliers page (1.27.0): links to another tab, niche or
 * kind keep the rest (niche, kind), and the tab being opened shows as
 * picked at once while the page loads.
 */

export type ShellTarget = { tab?: TabId; niche?: string | null; kind?: Kind; params?: Record<string, string | number | null | undefined> };

export type ShellNav = {
  href: (t: ShellTarget) => string;
  go: (t: ShellTarget, opts?: { replace?: boolean }) => void;
  busy: boolean;
};

export const ShellNavCtx = createContext<ShellNav | null>(null);

export function useShellNav(): ShellNav {
  const c = useContext(ShellNavCtx);
  if (!c) throw new Error("useShellNav outside the Outliers page");
  return c;
}

/** Changes one search param in the address without loading anything (a picked format, a typed title). */
export function shallowParam(key: string, value: string | null) {
  const u = new URL(window.location.href);
  if (value === null || value === "") u.searchParams.delete(key);
  else u.searchParams.set(key, value);
  window.history.replaceState({ outliersPanel: !!window.history.state?.outliersPanel }, "", u.pathname + u.search + u.hash);
}
