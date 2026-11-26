"use client";

import { PendingLink, usePendingNav } from "@/components/ui/pending-nav";

/**
 * Sponsorships' tabs (1.57.0): all of them, the affiliates, the reviews, the paid ones, each with how many. One list
 * underneath (a sponsorship can be more than one kind: it's in each of its tabs); the tab is in the address (?type=)
 * with the other filters kept. A clicked tab is underlined at once while its list comes (inside <PendingNav>).
 */
export type KindTab = { key: string; label: string; count: number; href: string; color: string | null; active: boolean };

export function KindTabs({ tabs }: { tabs: KindTab[] }) {
  const { pending } = usePendingNav();
  const going = pending && tabs.some((t) => `kind:${t.key}` === pending) ? pending : null;
  return (
    <nav aria-label="Kinds of sponsorship" className="relative flex items-center gap-1 border-b border-line/15 overflow-x-auto no-scrollbar -mx-1 px-1 mb-5">
      {tabs.map((t) => {
        const on = going ? going === `kind:${t.key}` : t.active;
        return (
          <PendingLink
            key={t.key || "all"}
            href={t.href}
            navKey={`kind:${t.key}`}
            aria-current={on ? "page" : undefined}
            className={`relative px-3.5 h-11 inline-flex items-center gap-2 text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {t.color && <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: t.color, opacity: t.count ? 1 : 0.45 }} aria-hidden />}
            {t.label}
            <span className={`text-[12px] tabular-nums font-medium ${on ? "text-ink-soft" : "text-ink-faint"}`}>{t.count}</span>
            <span aria-hidden className={`absolute left-2 right-2 bottom-0 h-[2.5px] rounded-t-[2px] bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
          </PendingLink>
        );
      })}
    </nav>
  );
}
