"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { measureUrl } from "@/lib/wallpapers-measure";
import { saveWallpaperLuma } from "@/app/(dashboard)/settings/wallpaper-actions";
import { stillSrc } from "@/lib/video-still";

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
 * (--wall-lift, globals.css). Gone with the page.
 *
 * `global` (1.29.4): the one behind every page (EverywhereBackdrop), drawn
 * by the layout. A page with its own (a profile's) hides it (globals.css).
 */
export function DashboardBackdrop({
  src,
  video,
  dim,
  luma = null,
  measure = null,
  global = false,
}: {
  src: string;
  video: boolean;
  dim: number;
  luma?: number | null;
  measure?: string | null;
  global?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);
  const d = Math.max(0, Math.min(80, dim));
  // Another picture (switched, or a profile just saved, 1.29.4): it loads under the one showing and fades in
  // once it's there; the old one goes after the fade. Never a moment with nothing, or the old one coming back.
  const [layers, setLayers] = useState<{ src: string; video: boolean; ready: boolean }[]>(() => [{ src, video, ready: true }]);
  useEffect(() => {
    setLayers((list) => (list[list.length - 1]?.src === src ? list : [...list.slice(-1), { src, video, ready: false }]));
  }, [src, video]);
  const shown = (s: string) => {
    setLayers((list) => list.map((l) => (l.src === s ? { ...l, ready: true } : l)));
    window.setTimeout(() => setLayers((list) => (list.length > 1 && list[list.length - 1].src === s ? list.slice(-1) : list)), 400);
  };
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
    <div aria-hidden data-global-bg={global ? "" : undefined} data-own-bg={global ? undefined : ""} className="dash-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      {layers.map((l, i) => {
        const cls = `absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${l.ready ? "opacity-100" : "opacity-0"}`;
        const last = i === layers.length - 1;
        return l.video ? (
          <video key={l.src} ref={last ? ref : undefined} src={stillSrc(l.src)} muted loop playsInline autoPlay={!still} preload="auto" onLoadedData={() => shown(l.src)} onError={() => shown(l.src)} className={cls} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={l.src} src={l.src} alt="" decoding="async" fetchPriority="high" onLoad={() => shown(l.src)} onError={() => shown(l.src)} className={cls} />
        );
      })}
      <div className="absolute inset-0 transition-[background-color] duration-500" style={{ background: `rgb(var(--paper) / ${d / 100})` }} />
    </div>
    </>
  );
}

/**
 * On pages other than the dashboard the wallpaper is darkened at least this
 * much (%): their titles and words sit right on it and are made for the
 * paper (70 % keeps even a busy, bright picture about 6:1 behind light words).
 */
export const EVERYWHERE_DIM = 70;

/**
 * Your wallpaper behind every page (1.29.4, Settings → Preferences →
 * Wallpaper → On every page). Drawn once by the layout, so it stays put as
 * you move around (no flash between pages). The dashboard shows it as you
 * set it; other pages darken it more, smoothly, so they stay easy to read.
 */
export function EverywhereBackdrop({ bg }: { bg: { url: string; video: boolean; dim: number; luma: number | null } }) {
  const dash = usePathname() === "/dashboard";
  return <DashboardBackdrop src={bg.url} video={bg.video} dim={dash ? bg.dim : Math.max(bg.dim, EVERYWHERE_DIM)} luma={bg.luma} global />;
}
