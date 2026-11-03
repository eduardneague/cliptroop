/**
 * Lands on a part of a page (1.26.0): once the element with this id is on
 * screen, it scrolls into view and glows for a moment, so a link to
 * "Settings › Preferences › Sounds" shows where Sounds is. Waits for the
 * page to arrive (up to a few seconds); the glow is in globals.css
 * ([data-flash]).
 */

const waiting = new Set<string>();

export function lessMotion() {
  const m = document.documentElement.dataset.motion;
  if (m === "off") return true;
  if (m === "on") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function flashElement(el: HTMLElement) {
  if (el.dataset.flash) return; // already glowing
  const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
  el.scrollIntoView({ behavior: lessMotion() ? "auto" : "smooth", block: tall ? "start" : "center" });
  glowElement(el);
}

const glows = new WeakMap<HTMLElement, number[]>();
/** The glow alone (1.45.0: Preferences' jumps scroll there themselves); a second one starts it over. */
export function glowElement(el: HTMLElement) {
  for (const t of glows.get(el) ?? []) window.clearTimeout(t);
  el.dataset.flash = "on";
  const off = window.setTimeout(() => {
    el.dataset.flash = "off";
    glows.set(el, [window.setTimeout(() => delete el.dataset.flash, 700)]);
  }, 1600);
  glows.set(el, [off]);
}

/**
 * Glow the element with this id once it's there. With `href`, only on that
 * page (never a same-named part of the page you're leaving), unless the
 * address was tidied up on the way (a second and a half later, the page's
 * path is enough).
 */
export function flashWhenReady(id: string, href?: string, timeout = 6000) {
  if (typeof window === "undefined" || !id || waiting.has(id)) return;
  let want: URL | null = null;
  if (href) {
    try {
      want = new URL(href, window.location.href);
    } catch {
      want = null;
    }
  }
  waiting.add(id);
  const started = Date.now();
  const tick = () => {
    const waited = Date.now() - started;
    const here = window.location;
    const ready = !want || (here.pathname === want.pathname && (here.search === want.search || waited > 1500));
    const el = ready ? document.getElementById(id) : null;
    if (el && el.getClientRects().length) {
      waiting.delete(id);
      flashElement(el);
      return;
    }
    if (waited < timeout) window.setTimeout(tick, 100);
    else waiting.delete(id);
  };
  tick();
}

/** The part of the page the address points at (#…), if any. */
export function hashTarget(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.slice(1);
  // Sign-in links carry tokens there (#access_token=…): not a part of the page.
  if (!raw || /[=&]/.test(raw)) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
