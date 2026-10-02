"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { CheckIcon, ChevronDownIcon, CloseIcon } from "@/components/ui/icons";
import { PlatformIcon } from "./platform-icon";
import type { Platform } from "../lib/constants";

export type FilterItem = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  count?: number;
  platform?: Platform;
  /** "check" = on/off · "radio" = one of a group */
  kind: "check" | "radio";
};
export type FilterSection = { title: string; items: FilterItem[] };
export type ActiveChip = { key: string; label: string; clearHref: string };

/**
 * One "Filters" button (same on phone, tablet and desktop) opening a
 * keyboard-navigable menu: ↑/↓ to move, Enter to apply, Esc to close.
 * Active filters show as removable chips beside the button.
 */
export function FiltersMenu({ sections, chips }: { sections: FilterSection[]; chips: ActiveChip[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenuKeyboard(open, menu, btn, close);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || menu.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function toggle() {
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const w = 280;
      setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8) });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) toggle();
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
          chips.length ? "border-amber/50 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
        }`}
      >
        Filters{chips.length ? ` · ${chips.length}` : ""}
        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.clearHref}
          scroll={false}
          className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-line/15 pl-2.5 pr-1.5 h-7 text-[12px] font-semibold text-ink hover:border-line/30"
          aria-label={`Remove filter: ${c.label}`}
        >
          {c.label}
          <CloseIcon className="w-3 h-3 text-ink-soft" />
        </Link>
      ))}

      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label="Filters"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[80] w-[280px] max-h-[70vh] overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-line/15 bg-surface shadow-2xl p-1 animate-[modalin_.12s_ease]"
          >
            {sections.map((sec, i) => (
              <div key={sec.title} className={i > 0 ? "mt-1 pt-1 border-t border-line/10" : ""}>
                <div className="px-3 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-soft">{sec.title}</div>
                {sec.items.map((it) => (
                  <Link
                    key={it.key}
                    href={it.href}
                    scroll={false}
                    role={it.kind === "check" ? "menuitemcheckbox" : "menuitemradio"}
                    aria-checked={it.active}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                  >
                    {it.platform ? (
                      <PlatformIcon platform={it.platform} className="w-5 h-5 rounded-[5px]" />
                    ) : it.kind === "check" ? (
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${it.active ? "bg-amber border-amber" : "border-line/40"}`}>
                        {it.active && <CheckIcon className="w-3 h-3 text-white" />}
                      </span>
                    ) : (
                      <span className={`w-4 h-4 rounded-full border-2 ${it.active ? "border-amber bg-amber shadow-[inset_0_0_0_2px_rgb(var(--surface))]" : "border-line/40"}`} />
                    )}
                    <span className="flex-1">{it.label}</span>
                    {it.count !== undefined && <span className="text-[12px] text-ink-soft tabular-nums">{it.count}</span>}
                    {it.platform && it.active && <CheckIcon className="w-4 h-4 text-amber" />}
                  </Link>
                ))}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
