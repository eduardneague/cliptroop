"use client";

import { useState } from "react";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { ClipLogo } from "@/components/ui/clip-logo";
import type { Platform } from "@/modules/short-videos/lib/constants";
import { cellsOf, stripWindow, type Poster as PosterData } from "../lib/dashboard";

const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

/**
 * Posted by ClipTroop: just the logo (1.24.0), the same on every card and
 * row. Its clip paths are named for the Posting page (see ClipLogo).
 */
export function ByAppBadge({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span title="Posted by ClipTroop" className={`inline-flex items-center justify-center rounded-md bg-surface/95 shadow-sm flex-shrink-0 ${className}`} style={{ width: size + 4, height: size + 4 }}>
      <ClipLogo size={size} id="clip-logo-posting" />
    </span>
  );
}

/**
 * A video's thumbnail in a box `aspect` wide for 1 high: the platform's
 * picture (a tall one whole, on a blur of itself), else a frame of the
 * version that's posted (1 second in), else a quiet placeholder with its
 * #number. A picture that doesn't load (an old Instagram link) falls
 * through to the next. The platform's icon sits in the corner, and
 * ClipTroop's logo when ClipTroop posted it.
 */
export function Poster({
  poster,
  wide,
  platform,
  number,
  byApp = false,
  icon = true,
  aspect = 16 / 9,
  size = "md",
  className = "",
  children,
}: {
  poster: PosterData;
  /** A long video or live stream (wide), else tall. */
  wide: boolean;
  platform: Platform;
  number?: number | null;
  byApp?: boolean;
  /** The platform's icon in the corner (not where the platform is said already). */
  icon?: boolean;
  aspect?: number;
  /** "sm": a small thumbnail in a row (smaller corner marks). */
  size?: "sm" | "md";
  className?: string;
  children?: React.ReactNode;
}) {
  const [bad, setBad] = useState<string[]>([]);
  const [cells, setCells] = useState<{ url: string; cellW: number; cellH: number } | null>(null);
  const src = poster.src && !bad.includes(poster.src) ? poster.src : null;
  const strip = !src && poster.strip && !bad.includes(poster.strip.url) ? poster.strip : null;
  const fail = (u: string) => setBad((b) => (b.includes(u) ? b : [...b, u]));
  const geo = strip ? (cells?.url === strip.url ? cells : strip) : null;
  const win = geo ? stripWindow(geo, aspect) : null;
  const sm = size === "sm";

  return (
    <span className={`relative block overflow-hidden bg-surface-2 isolate ${className}`} style={{ aspectRatio: String(aspect) }}>
      {src ? (
        <>
          {!wide && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" aria-hidden loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => fail(src)} className={`relative w-full h-full ${wide ? "object-cover" : "object-contain"}`} />
        </>
      ) : strip && win ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={strip.url} alt="" aria-hidden loading="lazy" className="absolute inset-0 w-full h-full object-cover blur-xl scale-125 opacity-50" />
          <span className="absolute overflow-hidden" style={{ left: pct(win.win.left), top: pct(win.win.top), width: pct(win.win.width), height: pct(win.win.height) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={strip.url}
              alt=""
              loading="lazy"
              onError={() => fail(strip.url)}
              onLoad={(e) => {
                // The real size of the strip (the saved video size can be off, e.g. a turned phone video).
                const c = cellsOf(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
                if (c && (c.cellW !== geo!.cellW || c.cellH !== geo!.cellH)) setCells({ url: strip.url, ...c });
              }}
              className="absolute max-w-none"
              style={{ left: pct(win.img.left), top: pct(win.img.top), width: pct(win.img.width), height: pct(win.img.height) }}
            />
          </span>
        </>
      ) : (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-2 to-line/10">
          <span
            className={`flex items-center justify-center rounded-md border border-line/20 bg-surface/50 font-mono font-semibold text-ink-faint ${wide ? "w-[48%] aspect-video" : "h-[74%] aspect-[9/16]"} ${sm ? "text-[8.5px]" : "text-[11px]"}`}
          >
            {number ? `#${number}` : ""}
          </span>
        </span>
      )}
      {icon && <PlatformIcon platform={platform} className={`absolute ${sm ? "bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-[3px]" : "bottom-2 right-2 w-6 h-6 rounded-md shadow"}`} />}
      {byApp && <ByAppBadge size={sm ? 12 : 18} className={`absolute ${sm ? "top-0.5 left-0.5 !rounded-[4px]" : "top-2 left-2"}`} />}
      {children}
    </span>
  );
}
