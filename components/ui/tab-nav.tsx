import Link from "next/link";

/** Underlined tabs kept in the address (?tab=…), e.g. Team and account settings. */
export function TabNav({ base, active, tabs, label }: { base: string; active: string; tabs: { id: string; label: string }[]; label: string }) {
  return (
    <nav className="flex items-center gap-1 border-b border-line/15 overflow-x-auto no-scrollbar -mx-1 px-1" aria-label={label}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={`${base}?tab=${t.id}`}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={`relative px-3.5 h-11 inline-flex items-center text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {t.label}
            <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
          </Link>
        );
      })}
    </nav>
  );
}
