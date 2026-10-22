"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tabsThatFit } from "@/lib/tab-fit";
import { AnchoredMenu } from "./anchored-menu";
import { ChevronDownIcon } from "./icons";

/*
 * A row of underlined tabs on a computer (1.30.1): when they don't all fit,
 * the last ones go under "More" at its end, so the row never slides
 * sideways (no scroll arrows at its ends). When the tab you're on is one of
 * them, More shows its name, underlined. Phones keep the row to swipe
 * through.
 *
 * Put it last inside the tabs' <nav> (which needs `relative`). It works with
 * the tabs as they are (links or buttons): it reads each one's data-label
 * (else its text) and data-count, and opens one by clicking it, so whatever
 * the tab does on a click still happens.
 */

type Hidden = { i: number; label: string; count: string | null; on: boolean };

const COMPUTER = "(hover: hover) and (pointer: fine)";
/** "More" and its arrow. */
const MORE_W = 84;
/** The arrow next to the name of the tab you're on, under More. */
const ARROW_W = 22;

export function TabOverflow() {
  const host = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState<Hidden[]>([]);
  const [open, setOpen] = useState(false);
  const last = useRef("");
  // The tab that was on last time (phones bring a newly picked one into view).
  const shown = useRef(-1);

  const tabsOf = (): HTMLElement[] => {
    const nav = host.current?.parentElement;
    return nav ? ([...nav.children].filter((e) => e !== host.current) as HTMLElement[]) : [];
  };

  const fit = () => {
    const nav = host.current?.parentElement;
    if (!nav) return;
    const tabs = tabsOf();
    let k = tabs.length;
    const active = tabs.findIndex((t) => t.getAttribute("aria-current") === "page");
    if (window.matchMedia(COMPUTER).matches) {
      const cs = getComputedStyle(nav);
      const widths = tabs.map((t) => t.offsetWidth);
      const more = Math.max(MORE_W, active >= 0 ? widths[active] + ARROW_W : 0);
      k = tabsThatFit({ widths, gap: parseFloat(cs.columnGap) || 0, room: nav.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), more });
    } else if (active >= 0 && active !== shown.current) {
      // Phones: the row slides, and the tab you're on is brought into view (once each time it changes).
      const t = tabs[active];
      if (t.offsetLeft < nav.scrollLeft || t.offsetLeft + t.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = Math.max(0, t.offsetLeft - 24);
    }
    shown.current = active;
    const next: Hidden[] = [];
    tabs.forEach((t, i) => {
      if (i < k) return t.removeAttribute("data-overflow");
      t.setAttribute("data-overflow", "");
      next.push({ i, label: t.dataset.label || (t.textContent ?? "").trim(), count: t.dataset.count || null, on: t.getAttribute("aria-current") === "page" });
    });
    const key = JSON.stringify(next);
    if (key !== last.current) {
      last.current = key;
      setHidden(next);
    }
  };
  const fitRef = useRef(fit);
  fitRef.current = fit;

  // After every change to the row (the tab you're on, a count): before it's drawn.
  useLayoutEffect(() => fitRef.current());
  useEffect(() => {
    const nav = host.current?.parentElement;
    if (!nav) return;
    const ro = new ResizeObserver(() => fitRef.current());
    ro.observe(nav);
    const mq = window.matchMedia(COMPUTER);
    const onMq = () => fitRef.current();
    mq.addEventListener("change", onMq);
    // Its web font arriving changes the tabs' widths.
    document.fonts?.ready.then(() => fitRef.current()).catch(() => {});
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", onMq);
    };
  }, []);

  const current = hidden.find((h) => h.on) ?? null;
  return (
    <span ref={host} data-tab-more="" className={hidden.length ? "flex flex-shrink-0" : "hidden"}>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative px-3 sm:px-3.5 h-11 inline-flex items-center gap-1 text-[14px] font-semibold whitespace-nowrap transition-colors ${current ? "text-ink" : "text-ink-soft hover:text-ink"}`}
      >
        {current ? current.label : "More"}
        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-[2px] bg-amber transition-opacity ${current ? "opacity-100" : "opacity-0"}`} />
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={btn} width={220} label="More">
        <div className="p-1.5">
          {hidden.map((h) => (
            <button
              key={h.i}
              type="button"
              role="menuitem"
              aria-current={h.on ? "page" : undefined}
              onClick={() => {
                setOpen(false);
                tabsOf()[h.i]?.click();
              }}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 h-10 text-left text-[13.5px] font-semibold hover:bg-surface-2 ${h.on ? "text-ink" : "text-ink-soft"}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.on ? "bg-amber" : "bg-transparent"}`} aria-hidden />
              <span className="flex-1 truncate">{h.label}</span>
              {h.count && <span className="text-[11.5px] tabular-nums text-ink-faint">{h.count}</span>}
            </button>
          ))}
        </div>
      </AnchoredMenu>
    </span>
  );
}
