"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";

/**
 * The website's pages on a phone (1.33.0): a <details> under a menu button.
 * It closes when a page opens (the header stays put between pages, so it
 * would stay open), on Escape and when you tap outside it.
 */
export function SiteMenu({ links, current }: { links: readonly { href: string; label: string }[]; current?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, []);
  return (
    <details ref={ref} className="site-menu md:hidden">
      <summary
        aria-label="Menu"
        className="list-none w-10 h-10 rounded-xl border border-line/15 inline-flex items-center justify-center text-ink-soft hover:text-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber [&::-webkit-details-marker]:hidden"
      >
        <MenuIcon className="site-menu-open w-5 h-5" />
        <CloseIcon className="site-menu-close w-4 h-4" />
      </summary>
      <nav aria-label="Site" className="absolute left-0 right-0 top-16 border-b border-line/10 bg-paper shadow-[0_18px_30px_-24px_rgb(0_0_0/0.45)]">
        <ul className="max-w-6xl mx-auto px-4 py-2 divide-y divide-line/10">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={current === l.href ? "page" : undefined}
                className={`flex items-center h-12 text-[16px] ${current === l.href ? "text-amber font-semibold" : "text-ink"}`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
