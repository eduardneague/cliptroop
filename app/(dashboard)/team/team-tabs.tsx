import Link from "next/link";

const TABS = [
  { id: "members", label: "Members" },
  { id: "defaults", label: "Defaults", masterOnly: true },
  { id: "accounts", label: "Connected accounts" },
  { id: "appearance", label: "Appearance" },
  { id: "team", label: "Team" },
] as const;

/** Team settings tabs (kept in the address: /team?tab=defaults). */
export function TeamTabs({ active, showDefaults }: { active: string; showDefaults: boolean }) {
  return (
    <nav className="flex items-center gap-1 border-b border-line/15 overflow-x-auto no-scrollbar -mx-1 px-1" aria-label="Team settings">
      {TABS.filter((t) => !("masterOnly" in t) || showDefaults).map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={`/team?tab=${t.id}`}
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
