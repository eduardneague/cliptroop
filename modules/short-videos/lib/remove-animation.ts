"use client";

import { motionReduced } from "@/lib/motion";
import { sounds } from "@/lib/sounds";

/*
 * A short leaving (1.38.0). On the list: a red line is drawn through its title, the row slides off to the left and
 * fades, then the gap closes and the rows below glide up. On its own page: the title is struck through the same way,
 * then the page tips back and falls away before the list opens. With animations off: a quick fade, nothing moves.
 * It plays while the short is deleted; if that fails, everything comes back as it was.
 */

export type Away = {
  /** The line and the slide (wait for it before asking the server, so the list never jumps mid-way). */
  out: Promise<void>;
  /** The gap closes (the list: the row's height to nothing). */
  collapse: () => Promise<void>;
  /** Deleting failed: back as it was. */
  restore: () => void;
};

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.55, 0, 0.75, 0.2)";
const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";

const done = (a: Animation) => a.finished.then(() => undefined).catch(() => undefined);

/**
 * A red line through the words of `title` (its text, not its whole box; a line each when it wraps), drawn from the
 * left, one after the other, placed in `host`.
 */
function strike(host: HTMLElement, title: HTMLElement, thick: number, ms: number): { lines: HTMLElement[]; anim: Promise<void> } {
  const hr = host.getBoundingClientRect();
  const box = title.getBoundingClientRect();
  // The words' own boxes (not the boxes of what holds them: a button around a wrapped title is one tall box), merged a
  // line at a time, and kept inside the title's box (a cut-off title). Text only a screen reader hears is skipped.
  const boxes: DOMRect[] = [];
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim() || n.parentElement?.closest(".sr-only")) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    boxes.push(...Array.from(range.getClientRects()));
  }
  const rows: { top: number; bottom: number; left: number; right: number }[] = [];
  for (const r of boxes) {
    if (r.width < 1 || r.height < 1) continue;
    const row = rows.find((x) => Math.abs(x.top + (x.bottom - x.top) / 2 - (r.top + r.height / 2)) < r.height / 2);
    if (row) {
      row.left = Math.min(row.left, r.left);
      row.right = Math.max(row.right, r.right);
      row.top = Math.min(row.top, r.top);
      row.bottom = Math.max(row.bottom, r.bottom);
    } else rows.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
  }
  if (!rows.length) rows.push({ top: box.top, bottom: box.bottom, left: box.left, right: box.right });
  rows.sort((a, b) => a.top - b.top);
  const each = ms / Math.max(1, rows.length);
  const lines: HTMLElement[] = [];
  const anims: Promise<void>[] = [];
  rows.forEach((r, i) => {
    const left = Math.max(box.left, r.left);
    const width = Math.max(12, Math.min(box.right, r.right) - left);
    const line = document.createElement("span");
    line.setAttribute("aria-hidden", "true");
    line.dataset.removeLine = "";
    Object.assign(line.style, {
      position: "absolute",
      left: `${left - hr.left}px`,
      top: `${r.top - hr.top + (r.bottom - r.top) / 2 - thick / 2}px`,
      width: `${width}px`,
      height: `${thick}px`,
      borderRadius: `${thick}px`,
      background: "rgb(var(--red))",
      transformOrigin: "left center",
      transform: "scaleX(0)",
      pointerEvents: "none",
      zIndex: "30",
    });
    host.appendChild(line);
    lines.push(line);
    anims.push(done(line.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: each, delay: i * each, easing: EASE_OUT, fill: "forwards" })));
  });
  return { lines, anim: Promise.all(anims).then(() => undefined) };
}

/** A row of the shorts table, on its way out. */
export function rowAway(row: HTMLElement): Away {
  const ours: Animation[] = [];
  const extra: HTMLElement[] = [];
  const restore = () => {
    ours.forEach((a) => a.cancel());
    extra.forEach((e) => e.remove());
    row.style.removeProperty("overflow");
    if (!motionReduced()) row.animate([{ opacity: 0, transform: "translateX(-12px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE_OUT });
  };
  if (motionReduced()) {
    return {
      out: Promise.resolve(),
      collapse: () => {
        const a = row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" });
        ours.push(a);
        return done(a);
      },
      restore,
    };
  }
  // 1. Tinted red, and a line drawn through the title.
  const tint = document.createElement("span");
  tint.setAttribute("aria-hidden", "true");
  Object.assign(tint.style, { position: "absolute", inset: "0", background: "rgb(var(--red) / 0.08)", pointerEvents: "none", zIndex: "29" });
  row.appendChild(tint);
  extra.push(tint);
  ours.push(tint.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, fill: "forwards" }));
  const title = row.querySelector<HTMLElement>("[data-row-title]");
  let drawn: Promise<void> = new Promise((r) => setTimeout(r, 200));
  if (title) {
    const { lines, anim } = strike(row, title, 2, 210);
    extra.push(...lines);
    drawn = anim;
  }
  // 2. Off to the left, fading and softening.
  const out = drawn.then(() => {
    sounds.remove();
    const slide = row.animate(
      [
        { transform: "translateX(0)", opacity: 1, filter: "blur(0)" },
        { transform: "translateX(-56px)", opacity: 0, filter: "blur(2px)" },
      ],
      { duration: 280, easing: EASE_IN, fill: "forwards" }
    );
    ours.push(slide);
    return done(slide);
  });
  // 3. The gap closes.
  const collapse = () => {
    const cs = getComputedStyle(row);
    row.style.overflow = "hidden";
    const a = row.animate(
      [
        { height: `${row.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth },
        { height: "0px", paddingTop: "0px", paddingBottom: "0px", borderTopWidth: "0px" },
      ],
      { duration: 260, easing: EASE_IN_OUT, fill: "forwards" }
    );
    ours.push(a);
    return done(a);
  };
  return { out, collapse, restore };
}

/** A short's own page, on its way out (the list opens after). */
export function pageAway(page: HTMLElement): Away {
  const ours: Animation[] = [];
  const extra: HTMLElement[] = [];
  const restore = () => {
    ours.forEach((a) => a.cancel());
    extra.forEach((e) => e.remove());
    page.style.removeProperty("transform-origin");
    if (!motionReduced()) page.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: EASE_OUT });
  };
  if (motionReduced()) {
    const a = page.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" });
    ours.push(a);
    return { out: done(a), collapse: () => Promise.resolve(), restore };
  }
  const title = page.querySelector<HTMLElement>("[data-short-title]") ?? page.querySelector<HTMLElement>("h1:not(.sr-only)");
  let drawn: Promise<void> = new Promise((r) => setTimeout(r, 200));
  if (title) {
    // The line is drawn on the page itself, so it falls with it.
    if (getComputedStyle(page).position === "static") page.style.position = "relative";
    const { lines, anim } = strike(page, title, 3, 280);
    extra.push(...lines);
    drawn = anim;
  }
  const out = drawn.then(() => {
    sounds.remove();
    page.style.transformOrigin = "50% 0%";
    const fall = page.animate(
      [
        { transform: "perspective(1400px) rotateX(0deg) translateY(0) scale(1)", opacity: 1, filter: "blur(0)" },
        { transform: "perspective(1400px) rotateX(9deg) translateY(56px) scale(0.95)", opacity: 0, filter: "blur(3px)" },
      ],
      { duration: 420, easing: EASE_IN, fill: "forwards" }
    );
    ours.push(fall);
    return done(fall);
  });
  return { out, collapse: () => Promise.resolve(), restore };
}
