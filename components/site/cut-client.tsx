"use client";

import { useEffect, useRef } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The cut (the home page, 1.45.0): the words scroll as ever, and the picture beside them stays put while a playhead
 * crosses one week of making a short. Which scene is in the middle of the screen decides the picture; how far you've
 * read moves the playhead. Nothing moves on its own: it follows the scroll, so it's the same with animations off
 * (the pictures' own loops stop then, as everywhere).
 *
 * Writes three things on the section: --p (0 to 1, the playhead), data-active on the scene's picture and clip, and the
 * day and time under the playhead. Phones get each scene's picture under its words instead (the stage is hidden).
 */
export function CutScroller({ children, scenes }: { children: React.ReactNode; scenes: number }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const blocks = Array.from(el.querySelectorAll<HTMLElement>("[data-cut-scene]"));
    const panels = Array.from(el.querySelectorAll<HTMLElement>("[data-cut-panel]"));
    const clips = Array.from(el.querySelectorAll<HTMLElement>("[data-cut-clip]"));
    const clock = el.querySelector<HTMLElement>("[data-cut-clock]");
    const wide = window.matchMedia("(min-width: 1024px)");
    let frame = 0;
    let active = -1;

    const update = () => {
      frame = 0;
      if (!wide.matches) return;
      const vh = window.innerHeight;
      const first = blocks[0]?.getBoundingClientRect();
      const last = blocks[blocks.length - 1]?.getBoundingClientRect();
      if (!first || !last) return;
      // From the first scene's middle reaching the screen's middle to the last one's.
      const start = first.top + first.height / 2 - vh / 2;
      const end = last.top + last.height / 2 - vh / 2;
      const p = Math.min(1, Math.max(0, end === start ? 0 : -start / (end - start)));
      el.style.setProperty("--p", p.toFixed(4));
      let now = 0;
      let best = Infinity;
      blocks.forEach((b, i) => {
        const r = b.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - vh / 2);
        if (dist < best) {
          best = dist;
          now = i;
        }
      });
      if (now !== active) {
        active = now;
        panels.forEach((x, i) => {
          x.toggleAttribute("data-active", i === now);
          // Its loop runs only while it's the one showing (landing.css: [data-ld-play][data-on]).
          x.toggleAttribute("data-on", i === now);
        });
        clips.forEach((x, i) => x.toggleAttribute("data-active", i === now));
      }
      if (clock) {
        const t = p * 7 * 0.9999;
        const day = DAYS[Math.floor(t)];
        const mins = Math.floor((t % 1) * 24 * 60);
        clock.textContent = `${day} ${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
      }
    };
    const ask = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    wide.addEventListener("change", ask);
    return () => {
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      wide.removeEventListener("change", ask);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scenes]);

  return (
    <div ref={root} className="cut">
      {children}
    </div>
  );
}
