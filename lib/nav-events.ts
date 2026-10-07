/**
 * "A move to another page has started": what the thin bar at the top
 * (components/ui/nav-progress.tsx) listens for. Fired by Next for every move
 * (instrumentation-client.ts: links, router.push / replace, back and forward)
 * and by hand where needed. No React here, so it can load first.
 */
export const NAV_START_EVENT = "cliptroop:nav-start";

/** Starts the bar. With `href`: only when that's another page (else there's nothing to wait for). */
export function startNavProgress(href?: string) {
  if (typeof window === "undefined") return;
  if (href) {
    try {
      const to = new URL(href, window.location.href);
      if (to.origin !== window.location.origin) return;
      if (to.pathname === window.location.pathname && to.search === window.location.search) return;
    } catch {
      return;
    }
  }
  window.dispatchEvent(new Event(NAV_START_EVENT));
}
