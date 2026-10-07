"use client";

import { PendingLink, usePendingNav } from "@/components/ui/pending-nav";
import { TEAM_TABS } from "./skeletons";

/**
 * Team settings tabs (kept in the address: /team?tab=defaults). Inside
 * <PendingNav> a clicked tab is underlined at once (and its content turns
 * into a skeleton) while it loads.
 */
export function TeamTabs({ active, showDefaults }: { active: string; showDefaults: boolean }) {
  const shown = usePendingNav().pending ?? active;
  return (
    <nav className="flex items-center gap-1 border-b border-line/15 overflow-x-auto no-scrollbar -mx-1 px-1" aria-label="Team settings">
      {TEAM_TABS.filter((t) => !("masterOnly" in t) || showDefaults).map((t) => {
        const on = t.id === shown;
        return (
          <PendingLink
            key={t.id}
            href={`/team?tab=${t.id}`}
            navKey={t.id}
            aria-current={on ? "page" : undefined}
            className={`relative px-3.5 h-11 inline-flex items-center text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {t.label}
            <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
          </PendingLink>
        );
      })}
    </nav>
  );
}
