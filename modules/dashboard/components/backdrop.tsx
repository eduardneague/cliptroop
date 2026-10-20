"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Your dashboard's background (1.27.5): the picture, GIF or looping video
 * from Settings, filling the screen behind the widgets, darkened by your
 * choice so the words stay easy to read. Decorative: hidden from screen
 * readers. A video doesn't play when animations are off (Settings) or the
 * device asks for less motion; it shows its first frame instead.
 */
export function DashboardBackdrop({ src, video, dim }: { src: string; video: boolean; dim: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => {
      const pref = document.documentElement.dataset.motion;
      setStill(pref === "off" || (pref !== "on" && mq.matches));
    };
    read();
    mq.addEventListener("change", read);
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => {
      mq.removeEventListener("change", read);
      obs.disconnect();
    };
  }, []);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (still) v.pause();
    else void v.play().catch(() => null);
  }, [still]);

  return (
    <div aria-hidden className="dash-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {video ? (
        <video ref={ref} src={src} muted loop playsInline autoPlay={!still} preload="auto" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" decoding="async" fetchPriority="high" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0" style={{ background: `rgb(var(--paper) / ${Math.max(0, Math.min(80, dim)) / 100})` }} />
    </div>
  );
}
