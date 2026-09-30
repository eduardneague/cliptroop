"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav-items";

/** Shorts and long videos always show in their own colors. */
const KIND_COLOR: Record<string, string> = { "/shorts": "text-short", "/videos": "text-long" };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop sidebar navigation, with the current section highlighted. */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, Icon, available }) =>
        available ? (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold transition-colors ${
              isActive(pathname, href)
                ? "bg-surface-2 text-ink"
                : "text-ink-soft hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Icon
              className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                KIND_COLOR[href] ?? (isActive(pathname, href) ? "text-amber" : "text-ink-faint group-hover:text-ink-soft")
              }`}
            />
            {label}
          </Link>
        ) : (
          <div
            key={href}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold text-ink-faint cursor-default"
            title="Coming soon"
          >
            <Icon className="w-[18px] h-[18px] flex-shrink-0 opacity-60" />
            {label}
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-ink-faint/70">
              Soon
            </span>
          </div>
        )
      )}
    </nav>
  );
}

/** Mobile bottom bar — same destinations, thumb-sized targets. */
export function BottomNavItems() {
  const pathname = usePathname();

  return (
    <>
      {NAV_ITEMS.map(({ href, shortLabel, Icon, available }) => {
        const active = isActive(pathname, href);
        if (!available) {
          return (
            <div
              key={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-ink-faint/60"
              aria-disabled
            >
              <Icon className={`w-[22px] h-[22px] ${KIND_COLOR[href] ?? ""}`} />
              <span className="text-[10px] font-semibold">{shortLabel}</span>
            </div>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors active:scale-95 ${
              active ? "text-amber" : "text-ink-faint"
            }`}
          >
            <span
              className={`absolute top-0 h-[2.5px] w-8 rounded-full bg-amber transition-opacity ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
            <Icon className={`w-[22px] h-[22px] ${KIND_COLOR[href] ?? ""}`} strokeWidth={active ? 2 : 1.75} />
            <span className="text-[10px] font-semibold">{shortLabel}</span>
          </Link>
        );
      })}
    </>
  );
}
