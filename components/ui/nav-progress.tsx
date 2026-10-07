"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_START_EVENT, NUDGE_EVENT, nudgeReact, startNavProgress } from "@/lib/nav-events";

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
  // The same goes for router.refresh() and saves (server actions): their
  // results are nudged in for a few seconds too (installed below).
  const [, nudge] = useState(0);
  const beat = useRef<number | null>(null);
  const navUntil = useRef(0);
  const quietUntil = useRef(0);
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
    // Nudges until the page is in and no loading shape is left (at most 15s
    // per move), or until a refresh / save has had time to show (quietUntil).
    const tick = () => {
      const now = Date.now();
      const moving = now < navUntil.current && (loading.current || !!document.querySelector('[aria-busy="true"]'));
      if (!moving && now > quietUntil.current) return stopBeat();
      if (document.visibilityState !== "hidden") nudge((n) => (n + 1) % 1000);
    };
    const ensureBeat = () => {
      if (beat.current === null) beat.current = window.setInterval(tick, 300);
    };
    const startBeat = () => {
      navUntil.current = Date.now() + 15000;
      ensureBeat();
    };
    const nudgeFor = (ms: number) => {
      quietUntil.current = Math.max(quietUntil.current, Date.now() + ms);
      ensureBeat();
    };
    const onNudge = (e: Event) => nudgeFor(Number((e as CustomEvent).detail) || 8000);

    // router.refresh() (the same object every useRouter() hands out) and
    // every save (Next's server actions are POSTs with a "next-action"
    // header): nudge while they're on their way and a few seconds after.
    const w = window as unknown as { next?: { router?: { refresh?: () => void; __nudged?: boolean } }; fetch: typeof fetch & { __nudged?: boolean } };
    const r = w.next?.router;
    if (r?.refresh && !r.__nudged) {
      const refresh = r.refresh.bind(r);
      r.refresh = () => {
        nudgeReact(8000);
        refresh();
      };
      r.__nudged = true;
    }
    if (!w.fetch.__nudged) {
      const original = w.fetch;
      const isAction = (h: HeadersInit | undefined) => {
        if (!h) return false;
        if (h instanceof Headers) return h.has("next-action");
        if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === "next-action");
        return Object.keys(h).some((k) => k.toLowerCase() === "next-action");
      };
      const wrapped = function (input: RequestInfo | URL, init?: RequestInit) {
        const res = original.call(window, input, init);
        try {
          if (isAction(init?.headers)) {
            nudgeReact(15000);
            res.then(
              () => nudgeReact(6000),
              () => {}
            );
          }
        } catch {
          /* never let this get in the way of the request */
        }
        return res;
      } as typeof fetch & { __nudged?: boolean };
      wrapped.__nudged = true;
      window.fetch = wrapped;
    }
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
    window.addEventListener(NUDGE_EVENT, onNudge);
    return () => {
      clear();
      stopBeat();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onBack);
      window.removeEventListener(NAV_START_EVENT, start);
      window.removeEventListener(NUDGE_EVENT, onNudge);
    };
  }, []);

  // The address changed: the new page is here.
  useEffect(() => {
    here.current = pathname + (search ? `?${search}` : "");
    finishRef.current();
  }, [pathname, search]);

  return <div ref={bar} className="nav-progress" aria-hidden />;
}
