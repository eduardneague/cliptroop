"use client";

import { useEffect, useRef, useState } from "react";
import { measureUrl } from "@/lib/wallpapers-measure";
import { saveWallpaperLuma } from "@/app/(dashboard)/settings/wallpaper-actions";

/**
 * Your dashboard's background (1.27.5): the picture, GIF or looping video
 * from Settings, filling the screen behind the widgets, darkened by your
 * choice so the words stay easy to read. Decorative: hidden from screen
 * readers. A video doesn't play when animations are off (Settings) or the
 * device asks for less motion; it shows its first frame instead.
 *
 * `measure` (1.28.0): a wallpaper saved before its brightness was measured
 * (its id): measured once here and kept, so the greeting's colour matches it
 * from then on (the wrapper's --bg-luma, globals.css).
 *
 * `luma` (1.29.2): how bright it is (0–100, null = not known). It and the
 * darkening go on <html> too (a style tag, there from the first paint), so
 * the bars around the page, which aren't inside it, read over it as well
 * (--wall-need, globals.css). Gone with the page.
 */
export function DashboardBackdrop({ src, video, dim, luma = null, measure = null }: { src: string; video: boolean; dim: number; luma?: number | null; measure?: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);
  const d = Math.max(0, Math.min(80, dim));
  useEffect(() => {
    if (!measure) return;
    let gone = false;
    void measureUrl(src, video ? "video" : "image").then((l) => {
      if (gone || l === null) return;
      document.querySelector<HTMLElement>("[data-dash-bg]")?.style.setProperty("--bg-luma", String(l / 100));
      document.documentElement.style.setProperty("--bg-luma", String(l / 100));
      void saveWallpaperLuma(measure, l);
    });
    return () => {
      gone = true;
      document.documentElement.style.removeProperty("--bg-luma");
    };
  }, [measure, src, video]);
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
    <>
    <style>{`html{${luma === null ? "" : `--bg-luma:${Math.max(0, Math.min(100, luma)) / 100};`}--bg-dim:${d / 100}}`}</style>
    <div aria-hidden className="dash-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {video ? (
        <video ref={ref} src={src} muted loop playsInline autoPlay={!still} preload="auto" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" decoding="async" fetchPriority="high" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0" style={{ background: `rgb(var(--paper) / ${d / 100})` }} />
    </div>
    </>
  );
}
