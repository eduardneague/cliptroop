"use client";

import type React from "react";

/*
 * The dashboard's filters (1.35.1): the chips Followers and Views had (1.34.4, 1.34.5), now shared, so Upcoming
 * shorts and Upcoming longs look the same (the owner: "i want the filters to look the same as the followers and
 * views"). One row is one choice, a radio group: the picked chip is ink on paper, arrow keys move between them, and a
 * click ticks (SoundSync plays a tick for any role="radio" or role="checkbox", like the other widgets' switches).
 */

/** A chip's look; `tight` for the narrowest widgets (all of a row still fits on one line). */
export const chipClass = (on: boolean, tight = false) =>
  `inline-flex items-center gap-1.5 rounded-lg ${tight ? "px-1" : "px-1.5"} h-7 text-[11.5px] font-semibold whitespace-nowrap flex-shrink-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber ${
    on ? "bg-ink text-paper" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
  }`;

export type ChipOption<T extends string> = {
  id: T;
  /** What it is, with its number, for screen readers and the tooltip ("Instagram: 4 shorts"). */
  name: string;
  /** What it shows: a logo, a face, a word. */
  face: React.ReactNode;
  /** Shown after the face when the widget is wide enough (`counts`). */
  count?: React.ReactNode;
};

export function FilterChips<T extends string>({
  label,
  options,
  value,
  onPick,
  counts = false,
  tight = false,
  className = "",
}: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onPick: (v: T) => void;
  counts?: boolean;
  tight?: boolean;
  className?: string;
}) {
  // Tab lands on the picked chip (on the first, if what's saved isn't among them).
  const at = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div role="radiogroup" aria-label={label} className={`flex items-center gap-1 ${className}`}>
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === at ? 0 : -1}
            aria-label={o.name}
            title={o.name}
            onClick={() => onPick(o.id)}
            onKeyDown={(e) => {
              const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const k = (i + step + options.length) % options.length;
              onPick(options[k].id);
              (e.currentTarget.parentElement?.children[k] as HTMLElement | undefined)?.focus();
            }}
            className={chipClass(on, tight)}
          >
            {o.face}
            {counts && o.count !== undefined && <span className="tabular-nums">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
