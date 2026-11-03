"use client";

import { glowElement, lessMotion } from "@/lib/flash";

/**
 * Preferences' four jumps (1.29.3), gliding there (1.45.0, the owner: "i want these buttons in preferences to animate
 * the page, not teleport you down there, i want a scrolling animation when you go down"): the page scrolls smoothly to
 * top of the part (under the app's bar: its scroll-mt-24) and it glows for a moment, as a link to it does (lib/flash.ts).
 * Motion off (or the device asks for less): straight there. The address says which part, for a link or a reload.
 */
const JUMPS = [
  ["look", "Mode and colours"],
  ["glass", "Glass"],
  ["background", "Wallpaper"],
  ["motion", "Motion and sound"],
] as const;

export function PreferenceJumps() {
  return (
    <nav aria-label="Preferences" className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
      {JUMPS.map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(e) => {
            const el = document.getElementById(id);
            if (!el || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            // The address without a jump (a hash change would jump before the glide starts).
            history.replaceState(history.state, "", `${location.pathname}${location.search}#${id}`);
            el.scrollIntoView({ behavior: lessMotion() ? "auto" : "smooth", block: "start" });
            glowElement(el);
          }}
          className="whitespace-nowrap rounded-lg border border-line/15 px-3 h-8 inline-flex items-center text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 transition-colors"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
