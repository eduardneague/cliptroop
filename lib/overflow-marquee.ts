"use client";

import { motionReduced } from "@/lib/motion";

/*
 * Words cut short with "…" slide into view (1.43.0). The owner (Oct 29 2026): "at dropdown menus if something is too
 * large to fit, when hovering i want an animation where you can see the rest of it too, must do this across the app,
 * especially in business page". One listener for the whole app (<OverflowMarquee /> in the dashboard layout): pointing
 * at an option of a list, a menu's item or a dropdown's button finds the words in it that end in "…" and slides each to
 * its end, waits, and back, for as long as the pointer stays (Select also starts it on the option the arrow keys reach).
 * Only what's actually cut moves; with animations off the whole text shows as the element's tooltip instead.
 *
 * The slide moves the line's start (text-indent) inside the element itself: nothing is added to the page, so React's
 * markup stays as it drew it, and the "…" goes away by itself as the end comes into view.
 */

/** What starts it: options, menu items, a dropdown's button, or anything marked data-marquee. */
export const MARQUEE_HOSTS =
  '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [aria-haspopup="listbox"], [data-marquee]';

const running = new Map<Element, { els: HTMLElement[]; anims: Animation[]; titled: HTMLElement[] }>();

/** Px a second it slides at; how long it waits at each end. */
const SPEED = 55;
const REST_START = 700;
const REST_END = 1200;

/** The elements in `host` (itself too) whose one line of text ends cut with "…". */
export function cutShort(host: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  const all = [host, ...Array.from(host.querySelectorAll("*"))];
  for (const el of all) {
    if (!(el instanceof HTMLElement)) continue;
    // Only what holds words of its own (not a row around them).
    if (!Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== "ellipsis" || !/^(nowrap|pre)$/.test(cs.whiteSpace)) continue;
    if (el.scrollWidth - el.clientWidth > 1) out.push(el);
  }
  return out;
}

/** The keyframes of one slide: rest, to the end, rest, back (the easing per stretch). */
export function slideFrames(distance: number): { frames: Keyframe[]; duration: number } {
  const move = Math.max(500, (distance / SPEED) * 1000);
  const back = Math.max(350, move * 0.45);
  const duration = REST_START + move + REST_END + back;
  const at = (ms: number) => Math.min(1, ms / duration);
  return {
    duration,
    frames: [
      { textIndent: "0px", offset: 0 },
      { textIndent: "0px", offset: at(REST_START), easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
      { textIndent: `${-Math.ceil(distance)}px`, offset: at(REST_START + move) },
      { textIndent: `${-Math.ceil(distance)}px`, offset: at(REST_START + move + REST_END), easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
      { textIndent: "0px", offset: 1 },
    ],
  };
}

/** Starts the slide on what's cut short in `host` (again: nothing new). */
export function startMarquee(host: Element) {
  // A menu that closed took its hosts with it: forget them.
  for (const h of [...running.keys()]) if (!h.isConnected) stopMarquee(h);
  if (running.has(host)) return;
  const els = cutShort(host);
  if (!els.length) return;
  if (motionReduced()) {
    // Nothing moves: the whole words as a tooltip.
    const titled = els.filter((el) => !el.title);
    titled.forEach((el) => (el.title = el.textContent?.trim() ?? ""));
    running.set(host, { els, anims: [], titled });
    return;
  }
  const anims = els.map((el) => {
    const { frames, duration } = slideFrames(el.scrollWidth - el.clientWidth);
    return el.animate(frames, { duration, iterations: Infinity });
  });
  running.set(host, { els, anims, titled: [] });
}

/** Stops it: what slid glides back to its start. */
export function stopMarquee(host: Element) {
  const r = running.get(host);
  if (!r) return;
  running.delete(host);
  r.titled.forEach((el) => el.removeAttribute("title"));
  r.els.forEach((el, i) => {
    const a = r.anims[i];
    if (!a) return;
    const now = getComputedStyle(el).textIndent;
    a.cancel();
    if (now && now !== "0px" && el.isConnected) el.animate([{ textIndent: now }, { textIndent: "0px" }], { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  });
}

export function stopAllMarquees() {
  for (const host of [...running.keys()]) stopMarquee(host);
}

/** The app-wide listener (once): pointing at a host starts its slide, leaving it stops it. Returns its clean-up. */
export function installMarquee(doc: Document = document): () => void {
  let current: Element | null = null;
  const over = (e: PointerEvent) => {
    const t = e.target instanceof Element ? e.target : null;
    const host = t?.closest(MARQUEE_HOSTS) ?? null;
    if (host === current) return;
    if (current) stopMarquee(current);
    current = host;
    if (host) startMarquee(host);
  };
  const out = (e: PointerEvent) => {
    if (!current) return;
    const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (to && current.contains(to)) return;
    stopMarquee(current);
    current = null;
  };
  const reset = () => {
    current = null;
    stopAllMarquees();
  };
  doc.addEventListener("pointerover", over, true);
  doc.addEventListener("pointerout", out, true);
  window.addEventListener("blur", reset);
  return () => {
    doc.removeEventListener("pointerover", over, true);
    doc.removeEventListener("pointerout", out, true);
    window.removeEventListener("blur", reset);
    reset();
  };
}
