"use client";

import { APP_NAME } from "@/lib/brand";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLatest, useScrollLock } from "@/lib/hooks/use-scroll-lock";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_ITEMS, DEVELOPER, MORE_ITEMS, NAV_GROUPS } from "@/lib/nav-items";
import { AppsIcon, ChevronRightIcon, LogoutIcon, SettingsIcon } from "./icons";
import { ClipLogo } from "./clip-logo";
import { openWhatsNew, SparkIcon } from "./whats-new";
import { LogoutButton } from "@/components/ui/logout-button";

/**
 * Icons are quiet grey at rest (one consistent menu), and light up in their
 * own colour when you point at them or you're there: shorts orange, long
 * videos blue, meetings violet, everything else the amber accent.
 */
const ACCENT: Record<string, { on: string; hover: string }> = {
  "/shorts": { on: "text-short", hover: "group-hover:text-short" },
  "/videos": { on: "text-long", hover: "group-hover:text-long" },
  "/meetings": { on: "text-violet", hover: "group-hover:text-violet" },
};
const accent = (href: string) => ACCENT[href] ?? { on: "text-amber", hover: "group-hover:text-amber" };

/** A line under each place in the phone's More list (1.28.0). */
const HINT: Record<string, string> = {
  "/outliers": "What's taking off in your niche",
  "/meetings": "Plan them, answer, follow up",
  "/posting": "What's going out, and what went out",
  "/analytics": "Every platform's numbers",
  "/objectives": "The team's goals and projections",
  "/team": "People, roles and defaults",
  "/developer": "Status, usage and tools",
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop sidebar navigation, in groups, with the current section highlighted. */
export function SidebarNav({ developer = false }: { developer?: boolean }) {
  const pathname = usePathname();
  const groups = developer ? [...NAV_GROUPS, { label: "Developer", items: [DEVELOPER] }] : NAV_GROUPS;
  return (
    <nav className="flex flex-col select-none" aria-label="Main">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className={gi ? "mt-4" : ""}>
          {g.label && <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{g.label}</div>}
          <div className="flex flex-col gap-0.5">
            {g.items.map(({ href, label, Icon }) => {
              const on = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  data-tour={`nav-${href.slice(1)}`}
                  aria-current={on ? "page" : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold transition-colors ${
                    on ? "bg-surface-2 text-ink" : "text-ink-soft hover:bg-surface-2/70 hover:text-ink"
                  }`}
                >
                  <span aria-hidden className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-[2px] bg-amber transition-all duration-200 ${on ? "h-4 opacity-100" : "h-0 opacity-0"}`} />
                  <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200 ${on ? accent(href).on : `text-ink-faint ${accent(href).hover}`}`} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Phone bottom bar: the four most used places + More (everything else). */
export function BottomNavItems({ developer = false }: { developer?: boolean }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const moreItems = developer ? [...MORE_ITEMS, DEVELOPER] : MORE_ITEMS;
  const moreActive = moreItems.some((i) => isActive(pathname, i.href)) || isActive(pathname, "/settings");
  // Close the sheet when you go somewhere.
  useEffect(() => setMore(false), [pathname]);

  const item = (active: boolean) =>
    `relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors active:scale-95 ${active ? "text-amber" : "text-ink-faint"}`;
  return (
    <>
      {BOTTOM_ITEMS.map(({ href, shortLabel, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} data-tour={`nav-${href.slice(1)}`} data-on={active ? "" : undefined} aria-current={active ? "page" : undefined} className={item(active)}>
            <span aria-hidden className={`nav-tick absolute top-0 h-[2.5px] w-8 rounded-[2px] bg-amber transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
            <Icon className={`w-[22px] h-[22px] ${active ? accent(href).on : ""}`} strokeWidth={active ? 2 : 1.75} />
            <span className="text-[10px] font-semibold">{shortLabel}</span>
          </Link>
        );
      })}
      <button type="button" data-tour="nav-more" data-on={moreActive ? "" : undefined} onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} className={item(moreActive)}>
        <span aria-hidden className={`nav-tick absolute top-0 h-[2.5px] w-8 rounded-[2px] bg-amber transition-opacity ${moreActive ? "opacity-100" : "opacity-0"}`} />
        <AppsIcon className="w-[22px] h-[22px]" strokeWidth={moreActive ? 2 : 1.75} />
        <span className="text-[10px] font-semibold">More</span>
      </button>
      {more && <MoreSheet onClose={() => setMore(false)} pathname={pathname} items={moreItems} />}
    </>
  );
}

function MoreSheet({ onClose, pathname, items }: { onClose: () => void; pathname: string; items: typeof MORE_ITEMS }) {
  const close = useLatest(onClose);
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return createPortal(
    <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true" aria-label="More">
      <div className="absolute inset-0 bg-black/45 animate-[fadein_.15s_ease]" onClick={onClose} aria-hidden />
      <div className="glass-pane absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll rounded-t-3xl border-t border-line/15 bg-surface shadow-2xl px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] animate-[sheetup_.28s_var(--ease-out)]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-[3px] bg-line/25" aria-hidden />
        <div className="flex items-center gap-2 px-1 mb-3">
          <ClipLogo size={26} />
          <span className="font-display font-semibold text-[15px]">{APP_NAME}</span>
        </div>
        {/* A list, one place a row with what it's for (1.28.0: the grid's last row was uneven). */}
        <ul className="rounded-2xl border border-line/10 divide-y divide-line/10 overflow-hidden">
          {items.map(({ href, label, Icon }) => {
            const on = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onClose}
                  aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 min-h-[60px] py-2 transition-colors active:bg-surface-2 ${on ? "bg-amber/10" : ""}`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${on ? "bg-amber/15" : "bg-surface-2"}`}>
                    <Icon className={`w-5 h-5 ${on ? accent(href).on : "text-ink-soft"}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold leading-tight">{label}</span>
                    {HINT[href] && <span className="block text-[12px] text-ink-faint leading-snug truncate">{HINT[href]}</span>}
                  </span>
                  <ChevronRightIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 rounded-2xl border border-line/10 divide-y divide-line/10 overflow-hidden">
          <Link href="/settings" onClick={onClose} className="flex items-center gap-3 px-4 h-12 text-[14px] font-semibold">
            <SettingsIcon className="w-5 h-5 text-ink-soft" />
            Settings
          </Link>
          <button
            type="button"
            onClick={() => {
              onClose();
              setTimeout(openWhatsNew, 150);
            }}
            className="w-full flex items-center gap-3 px-4 h-12 text-[14px] font-semibold text-left"
          >
            <SparkIcon className="w-5 h-5 text-amber" />
            What&rsquo;s new
          </button>
          <LogoutButton className="w-full flex items-center gap-3 px-4 h-12 text-[14px] font-semibold text-red text-left">
            <LogoutIcon className="w-5 h-5" />
            Log out
          </LogoutButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
