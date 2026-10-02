"use client";

import { useEffect, useState, useTransition } from "react";
import { setSounds } from "@/app/(dashboard)/settings/actions";
import { setSoundsEnabled, sounds, type SoundName } from "@/lib/sounds";
import { useToast } from "./toast-provider";

/**
 * Keeps this device in line with the account's sound setting, and plays
 * the small sounds the markup asks for:
 *   data-sound="send"   on a button or link plays that sound when clicked
 *   data-sound="none"   keeps a control quiet (it plays its own sound)
 *   switches and checkboxes tick softly.
 */
export function SoundSync({ on }: { on: boolean }) {
  useEffect(() => setSoundsEnabled(on), [on]);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      const tagged = el.closest<HTMLElement>("[data-sound]");
      if (tagged) {
        const name = tagged.dataset.sound as SoundName | "none";
        if (name !== "none" && name in sounds && !(tagged as HTMLButtonElement).disabled) sounds[name]();
        return;
      }
      const toggle = el.closest<HTMLElement>('[role="switch"], [role="checkbox"], input[type="checkbox"], [role="radio"]');
      if (toggle && !(toggle as HTMLButtonElement).disabled) sounds.tick();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

/** Settings → Preferences → Sounds. */
export function SoundsChoice({ on: initial }: { on: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const toast = useToast();

  function choose(next: boolean) {
    if (next === on) return;
    const prev = on;
    setOn(next);
    setSoundsEnabled(next);
    start(async () => {
      const res = await setSounds(next);
      if (res?.error) {
        setOn(prev);
        setSoundsEnabled(prev);
        toast.error(res.error);
      } else toast.success(next ? "Sounds on" : "Sounds off");
    });
  }

  return (
    <div role="radiogroup" aria-label="Sounds" className="inline-flex rounded-lg border border-line/15 p-0.5 flex-shrink-0">
      {[true, false].map((v) => {
        const sel = on === v;
        return (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={sel}
            data-sound="none"
            tabIndex={sel ? 0 : -1}
            disabled={pending}
            onClick={() => choose(v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                choose(!on);
              }
            }}
            className={`px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
              sel ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {v ? "On" : "Off"}
          </button>
        );
      })}
    </div>
  );
}
