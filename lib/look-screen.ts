/**
 * Clip's "new look" screen (1.29.8). Switching the colour theme, light or
 * dark, or the glass look (on, off, its style) restyles every pane on the
 * page at once; with glass over a busy page the browser can need a moment
 * for that, and the page would stutter or flash while it works. So Clip
 * covers it: `changeLook(what, apply)` puts his screen up, waits until it's
 * on screen, makes the change under it, waits until the new look has been
 * drawn, and takes the screen away again. 1.35.1 (the owner: "turning
 * wallpaper off should also give you the loading screen thing", "selecting a
 * wallpaper should too"): the wallpaper too, a change that takes a while.
 *
 * The screen lives in the app shell (LookScreenHost, components/ui/look-screen.tsx).
 * Anywhere without it (sign in, the landing page) the change just happens.
 */

export type LookChange = "theme" | "dark" | "light" | "glass" | "wallpaper" | "wallpaper-off";
/**
 * `apply` may take a while (1.35.1, a wallpaper: saved, then the page asked for again and its picture loaded): it
 * returns a promise then, and the screen stays up until it settles (or LOOK_MAX_WAIT has passed).
 */
export type LookRequest = { what: LookChange; apply: () => void | Promise<void> };

/** The longest the screen waits for a change that takes a while (a slow connection: the rest happens after). */
export const LOOK_MAX_WAIT = 8000;

export const LOOK_SCREEN_EVENT = "vp:look-screen";
/** Set by the host while it's mounted. */
export const LOOK_SCREEN_FLAG = "__vpLookScreen";

export function changeLook(what: LookChange, apply: () => void | Promise<void>) {
  if (typeof window === "undefined" || !(window as unknown as Record<string, unknown>)[LOOK_SCREEN_FLAG]) {
    void apply();
    return;
  }
  window.dispatchEvent(new CustomEvent<LookRequest>(LOOK_SCREEN_EVENT, { detail: { what, apply } }));
}

/**
 * Makes the changes, in order, and settles when they're done: at once for ones made on the spot, or when the last of
 * those that take a while (1.35.1, a wallpaper) has finished or failed, or after `max` ms. A change that throws is
 * skipped (the others still happen, and the screen still goes).
 */
export function runChanges(changes: LookRequest["apply"][], max = LOOK_MAX_WAIT): Promise<void> {
  const slow: Promise<unknown>[] = [];
  for (const f of changes) {
    try {
      const r = f();
      if (r && typeof (r as Promise<void>).then === "function") slow.push((r as Promise<void>).catch(() => null));
    } catch {}
  }
  if (!slow.length) return Promise.resolve();
  return Promise.race([Promise.all(slow).then(() => undefined), new Promise<void>((done) => setTimeout(done, max))]);
}

/** What Clip says while it changes. */
export const LOOK_WORDS: Record<LookChange, string> = {
  theme: "Painting in your new colours",
  dark: "Dimming the lights",
  light: "Turning the lights on",
  glass: "Polishing the glass",
  wallpaper: "Putting up your wallpaper",
  "wallpaper-off": "Taking your wallpaper down",
};

/**
 * Settles once a new wallpaper has loaded (DashboardBackdrop puts it under the one showing, hidden, until its
 * picture or video frame is there), or after `max` ms; soon with none on the page.
 */
export function wallpaperDrawn(max = 3000): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const check = () => {
      const loading = document.querySelector(".dash-backdrop > :is(img, video).opacity-0");
      if (!loading || Date.now() - t0 > max) resolve();
      else window.setTimeout(check, 50);
    };
    // Two frames first: the page has drawn what the refresh brought, and the new layer has been added after it.
    requestAnimationFrame(() => requestAnimationFrame(check));
  });
}
