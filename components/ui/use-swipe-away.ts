"use client";

import { useRef } from "react";
import { swipeOutcome } from "@/lib/notification-optimism";

/*
 * Swipe a card away (1.31.4: notifications in the bell, toasts): it follows
 * the finger (or the mouse) sideways, then goes on out when it's far enough
 * or flicked, or springs back. Up and down stay the list's own scrolling
 * (the card needs `touch-action: pan-y`); a tap still taps, and a press on
 * a button inside it is the button's. The card moves by its own style while
 * it's dragged (no re-render per move); `data-dragging` is on meanwhile.
 * One that can't go (`locked`) only gives a little and springs back.
 */

type Drag = { id: number; x: number; y: number; dx: number; on: boolean; el: HTMLElement; vx: number; lastX: number; lastT: number };

export function useSwipeAway(opts: { onSwipe: (dir: 1 | -1, el: HTMLElement) => void; locked?: boolean; disabled?: boolean }) {
  const drag = useRef<Drag | null>(null);
  // A drag that ended over the card isn't also a click on it.
  const swallow = useRef(false);
  const latest = useRef(opts);
  latest.current = opts;

  const reset = (el: HTMLElement) => {
    delete el.dataset.dragging;
    el.style.transform = "";
    el.style.opacity = "";
  };

  return {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (latest.current.disabled || e.button !== 0 || !e.isPrimary) return;
      if ((e.target as Element).closest("button, a, input, textarea, select, [data-no-swipe]")) return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, on: false, el: e.currentTarget, vx: 0, lastX: e.clientX, lastT: e.timeStamp };
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.on) {
        // Mostly up or down first: that's the list scrolling, not a swipe.
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
          drag.current = null;
          return;
        }
        if (Math.abs(dx) < 10) return;
        d.on = true;
        try {
          d.el.setPointerCapture(e.pointerId);
        } catch {}
        d.el.dataset.dragging = "";
      }
      const dt = Math.max(1, e.timeStamp - d.lastT);
      d.vx = d.vx * 0.4 + ((e.clientX - d.lastX) / dt) * 0.6;
      d.lastX = e.clientX;
      d.lastT = e.timeStamp;
      // Locked: a little give (a quarter, at most 40 px), so it's clear it won't go.
      d.dx = latest.current.locked ? Math.sign(dx) * Math.min(40, Math.abs(dx) / 4) : dx;
      d.el.style.transform = `translateX(${d.dx}px)`;
      d.el.style.opacity = String(1 - Math.min(0.55, Math.abs(d.dx) / (d.el.offsetWidth || 1)) );
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      drag.current = null;
      if (!d || d.id !== e.pointerId || !d.on) return;
      swallow.current = true;
      window.setTimeout(() => (swallow.current = false), 0);
      // A pause before letting go isn't a flick.
      const velocity = e.timeStamp - d.lastT > 120 ? 0 : d.vx;
      const out = swipeOutcome({ dx: d.dx, width: d.el.offsetWidth, velocity, locked: latest.current.locked });
      delete d.el.dataset.dragging;
      if (out === "back") {
        reset(d.el);
        return;
      }
      // On out from where it is now (the leave animation takes it from here).
      latest.current.onSwipe(out === "right" ? 1 : -1, d.el);
    },
    onPointerCancel(e: React.PointerEvent<HTMLElement>) {
      const d = drag.current;
      drag.current = null;
      if (d && d.id === e.pointerId) reset(d.el);
    },
    // A picture inside isn't dragged off by the browser instead (that would end the swipe).
    onDragStart(e: React.DragEvent<HTMLElement>) {
      e.preventDefault();
    },
    onClickCapture(e: React.MouseEvent<HTMLElement>) {
      if (!swallow.current) return;
      swallow.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
