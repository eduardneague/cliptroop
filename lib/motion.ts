/**
 * True when animations are off: the account setting (html[data-motion]), or the device asks for less motion and the
 * setting doesn't say otherwise. On the server: true (nothing moves there). Moved here from components/ui/count-up.tsx
 * in 1.34.0, for code that isn't a component (lib/pop-ghost.ts).
 */
export function motionReduced() {
  if (typeof window === "undefined") return true;
  const m = document.documentElement.dataset.motion;
  if (m === "off") return true;
  if (m === "on") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
