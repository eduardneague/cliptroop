"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Things coming into view (1.46.0, the owner: "add animations across the website"): anything marked `data-reveal`
 * rises and fades in the first time it's on screen, one after another where it says `--i`. What's already on screen
 * when the page opens is simply there (no flash), and with animations off, the setting or the device's, or without
 * this script, nothing is hidden at all (site.css hides only under html.rv, which this adds).
 */
export function Reveal() {
  const path = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    const off = root.dataset.motion === "off" || (root.dataset.motion !== "on" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])"));
    if (off || !("IntersectionObserver" in window)) {
      all.forEach((el) => el.setAttribute("data-shown", ""));
      return;
    }
    // On screen already: shown before anything is hidden.
    const vh = window.innerHeight;
    const later = all.filter((el) => {
      const r = el.getBoundingClientRect();
      const now = r.top < vh * 0.92 && r.bottom > 0;
      if (now) el.setAttribute("data-shown", "");
      return !now;
    });
    root.classList.add("rv");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-shown", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    later.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [path]);
  return null;
}
