import { lockScroll } from "@/lib/hooks/use-scroll-lock";

/*
 * A pop-up leaves the way it came in (1.34.0). When one closes, React takes it off the page at once; this puts a still
 * copy of it back where it was, marked data-leaving, so its way in plays backwards (globals.css, "Pop-ups"), for as
 * long as the way in took, and then removes the copy. The copy can't be pressed, focused or read out (inert,
 * aria-hidden, pointer-events: none): the moment you close a pop-up, nothing in it answers any more, while the page
 * under it already does. components/ui/leaves.tsx calls it as a pop-up leaves the page.
 */

/** The moving parts of pop-ups (globals.css): the longest one's way in decides how long the copy stays. */
export const POP_PARTS = ".pop-dim, .pop-fade, .pop-modal, .pop-menu, .pop-drop, .pop-sheet, .pop-drawer, .pop-card";

/**
 * Marks a copy mustn't carry: other code would take it for the real thing while it leaves ("is a menu or a prompt
 * open?" looks for these; the copy is hidden from screen readers anyway).
 */
const STRIP = ["role", "aria-modal", "data-confirm", "data-floating-menu", "data-tour", "data-tour-active", "data-autofocus", "autofocus", "data-outliers-panel", "data-outliers-panel-root"];

/** An animation-duration as the browser gives it ("0.22s", "180ms", "0.22s, 0.1s") → the longest, in ms. */
export function longestMs(value: string): number {
  let ms = 0;
  for (const part of value.split(",")) {
    const n = Number.parseFloat(part);
    if (Number.isFinite(n)) ms = Math.max(ms, /ms\s*$/.test(part) ? n : n * 1000);
  }
  return ms;
}

/**
 * Called while the pop-up's outermost element (`root`) is still on the page, just before React removes it. `lock`:
 * the pop-up held the page still, and its copy goes on doing so until it's gone (no scrollbar coming back under it).
 * Nothing happens with animations off (its parts take no time), or when React only pretended to remove it (Strict
 * Mode) or removed the place around it too.
 */
export function leaveCopy(root: HTMLElement, { lock = false }: { lock?: boolean } = {}) {
  const parent = root.parentNode;
  if (!parent || typeof window === "undefined") return;
  let ms = 0;
  for (const part of root.querySelectorAll<HTMLElement>(POP_PARTS)) ms = Math.max(ms, longestMs(getComputedStyle(part).animationDuration));
  if (ms < 20) return;
  const next = root.nextSibling;
  const copy = root.cloneNode(true) as HTMLElement;

  // What the browser holds rather than the markup: typed text and ticks, drawings, how far each part is scrolled.
  // A video, an embedded page or a player is never copied (a second one would load or play): an empty box its size.
  const from = [root, ...root.querySelectorAll<HTMLElement>("*")];
  const to = [copy, ...copy.querySelectorAll<HTMLElement>("*")];
  const scrolled: [Element, number, number][] = [];
  from.forEach((a, i) => {
    const b = to[i];
    if (!b) return;
    if (a instanceof HTMLInputElement && b instanceof HTMLInputElement) {
      b.value = a.value;
      b.checked = a.checked;
      b.removeAttribute("name");
    } else if (a instanceof HTMLTextAreaElement && b instanceof HTMLTextAreaElement) b.value = a.value;
    else if (a instanceof HTMLSelectElement && b instanceof HTMLSelectElement) b.selectedIndex = a.selectedIndex;
    else if (a instanceof HTMLCanvasElement && b instanceof HTMLCanvasElement) {
      try {
        b.getContext("2d")?.drawImage(a, 0, 0);
      } catch {
        // A canvas that can't be read (another site's picture in it): it leaves blank.
      }
    } else if (a instanceof HTMLVideoElement || a instanceof HTMLAudioElement || a instanceof HTMLIFrameElement || a instanceof HTMLObjectElement || a instanceof HTMLEmbedElement) {
      const r = a.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = b.getAttribute("class") ?? "";
      box.style.cssText = b.style.cssText;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      b.replaceWith(box);
      return;
    }
    if (a.scrollTop || a.scrollLeft) scrolled.push([b, a.scrollTop, a.scrollLeft]);
  });
  for (const el of to) for (const name of STRIP) el.removeAttribute(name);
  copy.setAttribute("data-leaving", "");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;

  // React removes the pop-up right after this, in the same moment: the copy takes its place before the next paint.
  queueMicrotask(() => {
    if (root.isConnected || !parent.isConnected) return;
    parent.insertBefore(copy, next && next.parentNode === parent ? next : null);
    for (const [el, top, left] of scrolled) {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
    const release = lock ? lockScroll() : null;
    window.setTimeout(() => {
      copy.remove();
      release?.();
    }, ms + 60);
  });
}
