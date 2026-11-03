"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { Kit } from "../lib/layout";
import type { Color, Page } from "../lib/scene";

/*
 * A page of the media kit's preview being drawn again (1.41.0). The owner: "if i change something in the media kit
 * that will change a PAGE within the media kit presentation and the change takes a while, i want an animation to show
 * that that PAGE from the media kit preview IS BEING MODIFIED" (and nothing like it anywhere else: "ONLY FOR THE MEDIA
 * KIT PREVIEW PAGES").
 *
 * Which pages: media-kit-tab.tsx (lib/touched.ts: what the change redraws; other numbers on their way; a photo going
 * up; pictures still coming, below). Styles: globals.css, "A kit page being updated".
 */

/**
 * Over the page, inside its frame: a beat after the change (a quick one never shows it), the page dims a little, a
 * light sweeps across it in the theme's colour and a tag says Updating. With animations off: the same, still, once the
 * beat has passed (data-late).
 */
export function KitPageBusy({ bg }: { /** The page's own paper: its wash (a light page lighter, a dark one darker, whatever the app's theme). */ bg: Color }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLate(true), 220);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <span className="kit-page-busy" data-late={late ? "" : undefined} style={{ "--page-paper": `${bg[0]} ${bg[1]} ${bg[2]}` } as React.CSSProperties} aria-hidden>
      <span className="kit-page-busy-tag">
        <ClapLoader />
        <span>Updating</span>
      </span>
    </span>
  );
}

/** Clip's clapperboard, small, in the theme's colour: the arm claps shut, again and again. */
function ClapLoader() {
  return (
    <svg viewBox="0 0 32 32" className="clap-loader" aria-hidden>
      <g className="clap-loader-arm">
        <rect x="3.5" y="6" width="25" height="5.6" rx="1.8" fill="currentColor" />
        <path d="M8.2 6.2 11 11.4M14.2 6.2 17 11.4M20.2 6.2 23 11.4" stroke="rgb(var(--surface))" strokeWidth="2.1" strokeLinecap="round" />
      </g>
      <rect x="3.5" y="13" width="25" height="15" rx="3.4" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 17.6h25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 13.4 11.6 17.4M15 13.4 17.6 17.4M21 13.4 23.6 17.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** How long a picture may keep a page Updating (one that never comes leaves its grey box, as before). */
const PICTURE_WAIT_MS = 12_000;

/**
 * The pictures a page draws that haven't come yet, after a change (a picked video's thumbnail, the cover's new photo):
 * that page shows Updating until they're in. The first layout's pictures aren't waited on: that's the kit loading, with
 * its grey boxes, not a change.
 */
export function usePicturesComing(kits: Kit[] | null): (page: Page) => boolean {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const st = useRef<{ done: Set<string>; asked: Set<string>; first: boolean }>({ done: new Set(), asked: new Set(), first: true });
  useEffect(() => {
    if (!kits) return;
    const s = st.current;
    const srcs = new Set<string>();
    for (const k of kits) for (const p of k.pages) for (const o of p.ops) if (o.t === "image") srcs.add(o.src);
    if (s.first) {
      s.first = false;
      srcs.forEach((src) => s.done.add(src));
      return;
    }
    for (const src of srcs) {
      if (s.done.has(src) || s.asked.has(src)) continue;
      s.asked.add(src);
      const finish = () => {
        if (s.done.has(src)) return;
        s.done.add(src);
        bump();
      };
      const img = new Image();
      img.onload = finish;
      img.onerror = finish;
      img.src = src;
      window.setTimeout(finish, PICTURE_WAIT_MS);
    }
  }, [kits]);
  return (page) => !st.current.first && page.ops.some((o) => o.t === "image" && !st.current.done.has(o.src));
}
