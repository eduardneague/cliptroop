"use client";

import { useEffect, useState, useTransition } from "react";
import { setGlass } from "@/app/(dashboard)/settings/actions";
import { useToast } from "./toast-provider";

/*
 * The glass look (1.27.5): frosted, see-through cards and bars over a soft
 * wash of your colour theme, across the whole app. Off by default. Saved on
 * the account (profiles.glass_ui, migration 0092) and kept on the device
 * ("vp-glass") so it's on screen before the page paints (the script in
 * app/layout.tsx); <html data-glass> switches it, the CSS is in globals.css.
 */

export const GLASS_KEY = "vp-glass";
const EVENT = "vp-glass-change";

function apply(on: boolean) {
  const root = document.documentElement;
  if (on) root.dataset.glass = "on";
  else delete root.dataset.glass;
  try {
    if (on) localStorage.setItem(GLASS_KEY, "on");
    else localStorage.removeItem(GLASS_KEY);
  } catch {
    /* private mode: the attribute still applies for this visit */
  }
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: on }));
}

/** Keeps this device on the account's choice (made on another device, say). */
export function GlassSync({ on }: { on: boolean | null }) {
  useEffect(() => {
    // Unknown (the database before 0092): this device's own choice.
    let v = on;
    if (v === null) {
      try {
        v = localStorage.getItem(GLASS_KEY) === "on";
      } catch {
        v = false;
      }
    }
    apply(v);
  }, [on]);
  return null;
}

/** Settings → Preferences → Glass: Off / On. */
export function GlassChoice({ on: initial }: { on: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => {
    const follow = (e: Event) => setOn(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, follow);
    return () => window.removeEventListener(EVENT, follow);
  }, []);

  function choose(next: boolean) {
    if (next === on) return;
    const prev = on;
    setOn(next);
    apply(next);
    start(async () => {
      const res = await setGlass(next);
      if (res?.error) {
        // Not saved on the account: it stays on this device (and says so), unless it couldn't be saved at all.
        if (res.deviceOnly) toast.success(res.error);
        else {
          setOn(prev);
          apply(prev);
          toast.error(res.error);
        }
      } else toast.success(next ? "Glass on" : "Glass off");
    });
  }

  return (
    <div role="radiogroup" aria-label="Glass" className="inline-flex rounded-lg border border-line/15 p-0.5 flex-shrink-0">
      {[false, true].map((v) => {
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
