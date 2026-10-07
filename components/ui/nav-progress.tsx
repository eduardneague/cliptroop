"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_START_EVENT, startNavProgress } from "@/lib/nav-events";

export { startNavProgress };

/** Where a link goes, if clicking it moves to another page of the app (else null). */
export function internalTarget(a: HTMLAnchorElement, here: Location): URL | null {
  if (a.target && a.target !== "_self") return null;
  if (a.hasAttribute("download") || a.hasAttribute("data-no-progress")) return null;
  let url: URL;
  try {
    url = new URL(a.href, here.href);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  // Files and server routes load by themselves (the browser shows its own progress).
  if (url.pathname.startsWith("/api/")) return null;
  // Same page (or just a #section on it): nothing to wait for.
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url;
}

/**
 * The thin amber line at the top of the screen. It appears the moment you
 * click a link (or go back), creeps along while the next page is on the way,
 * and finishes as soon as the address changes, so every click answers at
 * once even when the page itself takes a moment. Styles: globals.css.
 */
export function NavProgress() {
  const bar = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const timers = useRef<number[]>([]);
  // While a page is on its way: a tiny re-render every 300ms. React sometimes
  // misses the moment a page's data has fully arrived and leaves it waiting
  // until something else on screen changes (seen as "I clicked a step and
  // nothing happened until I clicked again"). Any update makes React look
  // again, so this keeps every move finishing on time.
  const [, nudge] = useState(0);
  const beat = useRef<number | null>(null);
  const finishRef = useRef<() => void>(() => {});
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = useRef("");

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const stopBeat = () => {
      if (beat.current !== null) window.clearInterval(beat.current);
      beat.current = null;
    };
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const finish = () => {
      if (!loading.current) return;
      loading.current = false;
      clear();
      el.dataset.state = "done";
      timers.current.push(window.setTimeout(() => el.removeAttribute("data-state"), 520));
    };
    // Nudges until the page is in and no loading shape is left (at most 15s).
    const startBeat = () => {
      stopBeat();
      const until = Date.now() + 15000;
      beat.current = window.setInterval(() => {
        if (Date.now() > until || (!loading.current && !document.querySelector('[aria-busy="true"]'))) return stopBeat();
        nudge((n) => (n + 1) % 1000);
      }, 300);
    };
    const start = () => {
      clear();
      loading.current = true;
      el.dataset.state = "loading";
      el.setAttribute("data-fresh", "");
      void el.offsetWidth; // lands at the starting point first, then creeps
      el.removeAttribute("data-fresh");
      startBeat();
      // Never stuck: whatever happens, it finishes after a while.
      timers.current.push(window.setTimeout(finish, 12000));
    };
    finishRef.current = finish;

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a instanceof HTMLAnchorElement && internalTarget(a, window.location)) start();
    };
    const onBack = () => {
      if (window.location.pathname + window.location.search !== here.current) start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onBack);
    window.addEventListener(NAV_START_EVENT, start);
    return () => {
      clear();
      stopBeat();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onBack);
      window.removeEventListener(NAV_START_EVENT, start);
    };
  }, []);

  // The address changed: the new page is here.
  useEffect(() => {
    here.current = pathname + (search ? `?${search}` : "");
    finishRef.current();
  }, [pathname, search]);

  return <div ref={bar} className="nav-progress" aria-hidden />;
}
