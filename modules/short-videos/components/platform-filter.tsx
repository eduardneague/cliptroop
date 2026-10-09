"use client";

import { PlatformIcon } from "./platform-icon";
import { PLATFORMS, PLATFORM_META, type Platform } from "../lib/constants";

export type PlatformChoice = "all" | Platform;

/**
 * One row of platform chips: "All" and one per platform, each with how many
 * posts it has. Click one to see only it, click it again (or All) for
 * everything. Same look as Analytics → Content.
 *
 * `compact`: icons and counts only, for small boxes (the dashboard widget);
 * platforms without posts are left out there. `iconsOnly` (with compact):
 * no counts either, for the narrowest boxes (the count is in the tooltip).
 */
export function PlatformFilter({
  value,
  onChange,
  counts,
  total,
  compact = false,
  iconsOnly = false,
  className = "",
}: {
  value: PlatformChoice;
  onChange: (v: PlatformChoice) => void;
  counts: Partial<Record<Platform, number>>;
  total: number;
  compact?: boolean;
  iconsOnly?: boolean;
  className?: string;
}) {
  const bare = compact && iconsOnly;
  const shown = compact ? PLATFORMS.filter((p) => (counts[p] ?? 0) > 0 || value === p) : PLATFORMS;
  return (
    <div className={`flex items-center ${compact ? "gap-1" : "gap-2 max-sm:gap-1.5 flex-wrap"} ${className}`} role="group" aria-label="Platform">
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={value === "all"}
        className={`inline-flex items-center rounded-full border font-semibold transition-colors flex-shrink-0 ${
          compact ? "gap-1 px-2 h-6 text-[11px]" : "gap-1.5 px-3 max-sm:px-2.5 h-8 text-[12px]"
        } ${value === "all" ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
        title={bare ? `All: ${total}` : undefined}
      >
        All
        {!bare && <span className={`font-medium tabular-nums ${value === "all" ? "text-paper/60" : "text-ink-faint"}`}>{total}</span>}
      </button>
      {shown.map((p) => {
        const n = counts[p] ?? 0;
        const on = value === p;
        const name = PLATFORM_META[p].name;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            aria-label={compact ? `${name}: ${n}` : undefined}
            title={compact ? `${name}: ${n}` : undefined}
            onClick={() => onChange(on ? "all" : p)}
            className={`inline-flex items-center rounded-full border font-semibold transition-colors flex-shrink-0 ${
              bare ? "p-0.5 h-6" : compact ? "gap-1 pl-0.5 pr-1.5 h-6 text-[11px]" : "gap-2 pl-1 pr-3 max-sm:pr-2.5 max-sm:gap-1.5 h-8 text-[12px]"
            } ${on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)]" : "border-line/15 bg-surface/50 hover:bg-surface"}`}
          >
            <PlatformIcon platform={p} className={`${compact ? "w-[18px] h-[18px]" : "w-6 h-6"} rounded-full ${n || on ? "" : "opacity-40 grayscale"}`} />
            {/* Phones: icon and count (the name stays for screen readers), so all five fit on one line. */}
            {!compact && <span className="text-ink max-sm:sr-only">{name}</span>}
            {!bare && <span className={`font-medium tabular-nums ${on ? "text-ink" : "text-ink-faint"}`}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
