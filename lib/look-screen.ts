/**
 * Clip's "new look" screen (1.29.8). Switching the colour theme, light or
 * dark, or the glass look (on, off, its style) restyles every pane on the
 * page at once; with glass over a busy page the browser can need a moment
 * for that, and the page would stutter or flash while it works. So Clip
 * covers it: `changeLook(what, apply)` puts his screen up, waits until it's
 * on screen, makes the change under it, waits until the new look has been
 * drawn, and takes the screen away again.
 *
 * The screen lives in the app shell (LookScreenHost, components/ui/look-screen.tsx).
 * Anywhere without it (sign in, the landing page) the change just happens.
 */

export type LookChange = "theme" | "dark" | "light" | "glass";
export type LookRequest = { what: LookChange; apply: () => void };

export const LOOK_SCREEN_EVENT = "vp:look-screen";
/** Set by the host while it's mounted. */
export const LOOK_SCREEN_FLAG = "__vpLookScreen";

export function changeLook(what: LookChange, apply: () => void) {
  if (typeof window === "undefined" || !(window as unknown as Record<string, unknown>)[LOOK_SCREEN_FLAG]) {
    apply();
    return;
  }
  window.dispatchEvent(new CustomEvent<LookRequest>(LOOK_SCREEN_EVENT, { detail: { what, apply } }));
}

/** What Clip says while it changes. */
export const LOOK_WORDS: Record<LookChange, string> = {
  theme: "Painting in your new colours",
  dark: "Dimming the lights",
  light: "Turning the lights on",
  glass: "Polishing the glass",
};
