"use client";

import { motionReduced } from "@/lib/motion";
import { sounds } from "@/lib/sounds";

/*
 * A short leaving (1.38.0). On the list: a red line is drawn through its title, the row slides off to the left and
 * fades, then the gap closes and the rows below glide up. On its own page: the title is struck through the same way,
 * then the page tips back and falls away before the list opens. With animations off: a quick fade, nothing moves.
 * It plays while the short is deleted; if that fails, everything comes back as it was.
 *
 * 1.40.0: shared (moved from modules/short-videos/lib), for long videos too, and for several at once (`itemsAway`: rows
 * of a table, or cards, which shrink away while the cards after them glide into the gaps).
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
function strike(host: HTMLElement, title: HTMLElement, thick: number, ms: number, delay = 0): { lines: HTMLElement[]; anim: Promise<void> } {
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
    anims.push(done(line.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: each, delay: delay + i * each, easing: EASE_OUT, fill: "forwards" })));
  });
  return { lines, anim: Promise.all(anims).then(() => undefined) };
}

/** A row of a table, on its way out (`delay`: after the ones before it, when several go; `sound`: the first only). */
export function rowAway(row: HTMLElement, delay = 0, sound = true): Away {
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
  const wait = delay > 0 ? new Promise<void>((r) => setTimeout(r, delay)) : Promise.resolve();
  // 1. Tinted red, and a line drawn through the title.
  const tint = document.createElement("span");
  tint.setAttribute("aria-hidden", "true");
  Object.assign(tint.style, { position: "absolute", inset: "0", background: "rgb(var(--red) / 0.08)", pointerEvents: "none", zIndex: "29" });
  row.appendChild(tint);
  extra.push(tint);
  ours.push(tint.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay, fill: "both" }));
  const title = row.querySelector<HTMLElement>("[data-row-title]");
  let drawn: Promise<void> = wait.then(() => new Promise((r) => setTimeout(r, 200)));
  if (title) {
    const { lines, anim } = strike(row, title, 2, 210, delay);
    extra.push(...lines);
    drawn = anim;
  }
  // 2. Off to the left, fading and softening.
  const out = drawn.then(() => {
    if (sound) sounds.remove();
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

/** A card of a grid, on its way out: struck through, then it shrinks and fades where it is (its gap closes later). */
function cardOut(card: HTMLElement, delay: number, ours: Animation[], extra: HTMLElement[], sound: boolean): Promise<void> {
  const tint = document.createElement("span");
  tint.setAttribute("aria-hidden", "true");
  Object.assign(tint.style, { position: "absolute", inset: "0", borderRadius: "inherit", background: "rgb(var(--red) / 0.08)", pointerEvents: "none", zIndex: "29" });
  card.appendChild(tint);
  extra.push(tint);
  ours.push(tint.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay, fill: "both" }));
  const title = card.querySelector<HTMLElement>("[data-row-title]");
  let drawn: Promise<void> = new Promise((r) => setTimeout(r, delay + 200));
  if (title) {
    const { lines, anim } = strike(card, title, 2, 210, delay);
    extra.push(...lines);
    drawn = anim;
  }
  return drawn.then(() => {
    if (sound) sounds.remove();
    const shrink = card.animate(
      [
        { transform: "scale(1)", opacity: 1, filter: "blur(0)" },
        { transform: "scale(0.9)", opacity: 0, filter: "blur(2px)" },
      ],
      { duration: 260, easing: EASE_IN, fill: "forwards" }
    );
    ours.push(shrink);
    return done(shrink);
  });
}

/**
 * Cards leave their grid: they're taken out, and the cards after them glide from where they were into the gaps (each
 * grid on its own; a list in groups closes the rest of its gaps when it's drawn again).
 */
function closeCardGaps(cards: HTMLElement[], ours: Animation[]): Promise<void> {
  const grids = new Set(cards.map((c) => c.parentElement).filter((g): g is HTMLElement => !!g));
  const stay: HTMLElement[] = [];
  grids.forEach((g) => stay.push(...(Array.from(g.children) as HTMLElement[]).filter((el) => !cards.includes(el))));
  const before = new Map(stay.map((el) => [el, el.getBoundingClientRect()]));
  cards.forEach((c) => (c.style.display = "none"));
  const moves = stay.map((el) => {
    const a = before.get(el)!;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;
    const m = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 320, easing: EASE_IN_OUT });
    ours.push(m);
    return done(m);
  });
  return Promise.all(moves).then(() => undefined);
}

/**
 * 1.40.0: several on their way out together (deleted from a selection): rows of a table (rowAway, a beat apart), or
 * cards (marked data-card: struck, shrunk, then the gaps close). Nothing found: nothing plays.
 */
export function itemsAway(items: HTMLElement[]): Away | null {
  if (!items.length) return null;
  const cards = items.filter((el) => el.hasAttribute("data-card"));
  const rows = items.filter((el) => !el.hasAttribute("data-card"));
  const step = Math.min(60, 360 / items.length);
  const rowsGo = rows.map((r, i) => rowAway(r, i * step, i === 0));
  const ours: Animation[] = [];
  const extra: HTMLElement[] = [];
  const reduced = motionReduced();
  const cardsOut = reduced ? Promise.resolve() : Promise.all(cards.map((c, i) => cardOut(c, (rows.length + i) * step, ours, extra, i === 0 && !rows.length))).then(() => undefined);
  return {
    out: Promise.all([...rowsGo.map((g) => g.out), cardsOut]).then(() => undefined),
    collapse: async () => {
      const jobs: Promise<void>[] = rowsGo.map((g) => g.collapse());
      if (cards.length) {
        if (reduced) {
          cards.forEach((c) => {
            const a = c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" });
            ours.push(a);
            jobs.push(done(a));
          });
        } else jobs.push(closeCardGaps(cards, ours));
      }
      await Promise.all(jobs);
    },
    restore: () => {
      rowsGo.forEach((g) => g.restore());
      ours.forEach((a) => a.cancel());
      extra.forEach((e) => e.remove());
      cards.forEach((c) => c.style.removeProperty("display"));
    },
  };
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

/** A color of the theme, for an animation's frames (a variable can't be read inside them everywhere). */
function themeColor(name: string, alpha: number): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return v ? `rgb(${v} / ${alpha})` : `rgba(220, 38, 38, ${alpha})`;
}

/**
 * 1.43.0: rows of a real table (<tr>: the cash book) on their way out, as rowAway draws them: tinted red, a red line
 * through the title, off to the left. A table row can't shrink its height away, and isn't a box things can be placed
 * in on every browser, so each cell is tinted (a shadow inside it, over its background and under its words) and slides
 * on its own, and the line is drawn in the title's own cell. The gap closes once the table is drawn without them: take
 * rowsBefore() first, then rowsGlide() (collapse does nothing here).
 */
export function tableRowsAway(rows: HTMLTableRowElement[]): Away | null {
  if (!rows.length) return null;
  const ours: Animation[] = [];
  const extra: HTMLElement[] = [];
  const cellsOf = (r: HTMLTableRowElement) => Array.from(r.cells) as HTMLElement[];
  const restore = () => {
    ours.forEach((a) => a.cancel());
    extra.forEach((e) => e.remove());
    if (!motionReduced()) rows.forEach((r) => cellsOf(r).forEach((c) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE_OUT })));
  };
  if (motionReduced()) {
    const fades = rows.flatMap((r) =>
      cellsOf(r).map((c) => {
        const a = c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" });
        ours.push(a);
        return done(a);
      })
    );
    return { out: Promise.all(fades).then(() => undefined), collapse: () => Promise.resolve(), restore };
  }
  const clear = themeColor("red", 0);
  const tint = themeColor("red", 0.09);
  const step = Math.min(60, 360 / rows.length);
  const outs = rows.map((row, i) => {
    const delay = i * step;
    const cells = cellsOf(row);
    // 1. Tinted red, and a line drawn through the title.
    cells.forEach((c) => ours.push(c.animate([{ boxShadow: `inset 0 0 0 999px ${clear}` }, { boxShadow: `inset 0 0 0 999px ${tint}` }], { duration: 180, delay, fill: "both" })));
    const title = row.querySelector<HTMLElement>("[data-row-title]");
    const host = title?.closest<HTMLElement>("td, th");
    let drawn: Promise<void> = new Promise((r) => setTimeout(r, delay + 200));
    if (title && host) {
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      const { lines, anim } = strike(host, title, 2, 210, delay);
      extra.push(...lines);
      drawn = anim;
    }
    // 2. Off to the left, fading and softening, every cell together.
    return drawn.then(() => {
      if (i === 0) sounds.remove();
      return Promise.all(
        cells.map((c) => {
          const slide = c.animate(
            [
              { transform: "translateX(0)", opacity: 1, filter: "blur(0)" },
              { transform: "translateX(-56px)", opacity: 0, filter: "blur(2px)" },
            ],
            { duration: 280, easing: EASE_IN, fill: "forwards" }
          );
          ours.push(slide);
          return done(slide);
        })
      ).then(() => undefined);
    });
  });
  return { out: Promise.all(outs).then(() => undefined), collapse: () => Promise.resolve(), restore };
}

/** 1.43.0: where each row of a list is now (its [data-flip] name → its top), before it's drawn again without some. */
export function rowsBefore(body: HTMLElement): Map<string, number> {
  const at = new Map<string, number>();
  body.querySelectorAll<HTMLElement>(":scope > [data-flip]").forEach((el) => at.set(el.dataset.flip!, el.getBoundingClientRect().top));
  return at;
}

/**
 * …then each glides from where it was to where it is (the rows under the ones that left move up into the gap). Only
 * what can be seen moves (`clip`: the box that scrolls them); a table row moves cell by cell.
 */
export function rowsGlide(body: HTMLElement, before: Map<string, number>, clip?: Element | null): Promise<void> {
  if (motionReduced()) return Promise.resolve();
  const view = (clip ?? document.documentElement).getBoundingClientRect();
  const top = Math.max(0, view.top);
  const bottom = Math.min(window.innerHeight, view.bottom);
  const jobs: Promise<void>[] = [];
  body.querySelectorAll<HTMLElement>(":scope > [data-flip]").forEach((el) => {
    const was = before.get(el.dataset.flip!);
    if (was === undefined) return;
    const r = el.getBoundingClientRect();
    const dy = was - r.top;
    if (Math.abs(dy) < 1) return;
    // Not on screen on the way: nobody sees it move.
    if (Math.max(r.bottom, r.bottom + dy) < top || Math.min(r.top, r.top + dy) > bottom) return;
    const parts = el instanceof HTMLTableRowElement ? (Array.from(el.cells) as HTMLElement[]) : [el];
    parts.forEach((p) => jobs.push(done(p.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 320, easing: EASE_IN_OUT }))));
  });
  return Promise.all(jobs).then(() => undefined);
}
