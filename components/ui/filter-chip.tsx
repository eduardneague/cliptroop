"use client";

import { PendingLink, usePendingNav } from "./pending-nav";

/**
 * A step filter chip on a list page (1.27.5): it lights up the moment it's
 * clicked (inside <PendingNav>, the list shows its skeleton meanwhile)
 * instead of waiting for the new list. Neutral and quiet; colour only on
 * the one that's on.
 */
export function FilterChip({
  href,
  navKey,
  active,
  label,
  count,
  color = null,
  tall = false,
}: {
  href: string;
  navKey: string;
  active: boolean;
  label: string;
  count: number;
  /** A small square in the step's colour (the shorts list). */
  color?: string | null;
  /** 36 px tall (the shorts list) instead of the compact chip. */
  tall?: boolean;
}) {
  const { pending } = usePendingNav();
  const on = pending ? pending === navKey : active;
  return (
    <PendingLink
      href={href}
      navKey={navKey}
      aria-current={on ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 ${tall ? "h-9" : "py-1.5"} text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
        on ? "bg-ink text-paper" : count === 0 ? "text-ink-faint/70 hover:bg-surface-2 hover:text-ink-soft" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {color && <span className="w-1.5 h-1.5 rounded-[2px] flex-shrink-0" style={{ background: color, opacity: count ? 1 : 0.45 }} aria-hidden />}
      {label}
      <span className={`text-[11px] tabular-nums font-medium ${on ? "text-paper/60" : "text-ink-faint"}`}>{count}</span>
    </PendingLink>
  );
}
