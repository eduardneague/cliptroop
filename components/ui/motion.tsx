"use client";

import { useEffect, useState, useTransition } from "react";
import { setAnimations } from "@/app/(dashboard)/settings/actions";
import { useToast } from "./toast-provider";

const KEY = "vp-motion";
/** null = match the device, true = always on, false = always off. */
export type MotionPref = boolean | null;

function apply(pref: MotionPref) {
  try {
    const root = document.documentElement;
    if (pref === null) {
      delete root.dataset.motion;
      localStorage.removeItem(KEY);
    } else {
      root.dataset.motion = pref ? "on" : "off";
      localStorage.setItem(KEY, pref ? "on" : "off");
    }
  } catch {
    /* private mode: the attribute still applies for this visit */
  }
}

/** Keeps this device in line with the account's animation setting. */
export function MotionSync({ pref }: { pref: MotionPref }) {
  useEffect(() => apply(pref), [pref]);
  return null;
}

const CHOICES: { value: MotionPref; label: string }[] = [
  { value: null, label: "Match device" },
  { value: true, label: "On" },
  { value: false, label: "Off" },
];

/** Settings → Preferences → Animations. */
export function AnimationsChoice({ pref }: { pref: MotionPref }) {
  const [value, setValue] = useState<MotionPref>(pref);
  const [pending, start] = useTransition();
  const toast = useToast();

  function choose(next: MotionPref) {
    if (next === value) return;
    const prev = value;
    setValue(next);
    apply(next);
    start(async () => {
      const res = await setAnimations(next);
      if (res?.error) {
        setValue(prev);
        apply(prev);
        toast.error(res.error);
      } else toast.success(next === null ? "Animations follow your device" : next ? "Animations on" : "Animations off");
    });
  }

  return (
    <div role="radiogroup" aria-label="Animations" className="inline-flex rounded-lg border border-line/15 p-0.5 flex-shrink-0">
      {CHOICES.map((c, i) => {
        const on = value === c.value;
        return (
          <button
            key={c.label}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={pending}
            onClick={() => choose(c.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const next = CHOICES[(i + (e.key === "ArrowRight" ? 1 : -1) + CHOICES.length) % CHOICES.length];
                choose(next.value);
                (e.currentTarget.parentElement?.children[CHOICES.indexOf(next)] as HTMLElement | undefined)?.focus();
              }
            }}
            className={`px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
              on ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
