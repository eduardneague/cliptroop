"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mascot } from "./mascot";
import { motionReduced } from "./count-up";
import { LOOK_SCREEN_EVENT, LOOK_SCREEN_FLAG, LOOK_WORDS, type LookChange, type LookRequest } from "@/lib/look-screen";

/*
 * Clip's "new look" screen (1.29.8, lib/look-screen.ts): over the whole app
 * for a moment while a new colour theme, light or dark, or glass look is
 * put on. It's solid (no blur of its own: the page under it is busy enough),
 * takes the new colours as they arrive, and leaves once the new look has
 * been drawn: at least MIN ms so it never just flickers, about a second in
 * all. A second change while it's up happens under it and keeps it a little
 * longer. Mounted once, in the dashboard layout.
 */

const MIN = 750;
const MIN_STILL = 450;
const IN = 130;
const OUT = 240;

/** After the browser has drawn two more frames (the first is the one already on its way). */
const afterPaint = (f: () => void) => requestAnimationFrame(() => requestAnimationFrame(f));

export function LookScreenHost() {
  const [screen, setScreen] = useState<{ what: LookChange; out: boolean } | null>(null);
  const until = useRef(0);
  // The screen's way out (not the changes waiting to happen under it: those always run).
  const timers = useRef<number[]>([]);
  // Changes asked for while the screen fades in, in order.
  const waiting = useRef<(() => void)[] | null>(null);

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w[LOOK_SCREEN_FLAG] = true;
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    // Takes the screen away once the new look is on screen and it has shown long enough.
    const finish = () =>
      afterPaint(() => {
        clear();
        const wait = Math.max(0, until.current - performance.now());
        timers.current.push(
          window.setTimeout(() => setScreen((s) => (s ? { ...s, out: true } : s)), wait),
          window.setTimeout(() => setScreen(null), wait + (motionReduced() ? 0 : OUT)),
        );
      });
    const onRequest = (e: Event) => {
      const { what, apply } = (e as CustomEvent<LookRequest>).detail;
      const min = motionReduced() ? MIN_STILL : MIN;
      // Up and not on its way out (one fading away starts over, faded in first).
      const up = !!document.querySelector("[data-look-screen]:not(.is-out)");
      until.current = Math.max(until.current, performance.now() + (up ? min / 2 : min));
      setScreen({ what, out: false });
      // Still fading in: this change waits its turn behind the ones before it (the last one wins, as clicked).
      if (waiting.current) {
        waiting.current.push(apply);
        return;
      }
      if (up) {
        // Already covering the page: change it now, under the screen.
        apply();
        finish();
        return;
      }
      // Wait until the screen is on screen (and has faded in), then change the look under it.
      waiting.current = [apply];
      afterPaint(() => {
        window.setTimeout(() => {
          const list = waiting.current ?? [];
          waiting.current = null;
          list.forEach((f) => f());
          finish();
        }, motionReduced() ? 0 : IN);
      });
    };
    window.addEventListener(LOOK_SCREEN_EVENT, onRequest);
    return () => {
      delete w[LOOK_SCREEN_FLAG];
      window.removeEventListener(LOOK_SCREEN_EVENT, onRequest);
      clear();
    };
  }, []);

  if (!screen || typeof document === "undefined") return null;
  return createPortal(
    <div data-look-screen className={`look-screen ${screen.out ? "is-out" : ""}`} role="status" aria-live="polite">
      <div className="look-screen-card">
        <Mascot mood="idle" size={104} />
        <p className="mt-3 font-display text-[19px] font-semibold">{LOOK_WORDS[screen.what]}</p>
        <p className="mt-1 text-[13px] text-ink-soft">It can take a moment to show on every page.</p>
        <span className="look-screen-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>,
    document.body,
  );
}
