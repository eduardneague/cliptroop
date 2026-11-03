"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type StepScene = { id: string; label: string; title: string; text: string; facts: readonly string[]; more: { href: string; label: string } };

/**
 * The home page's steps (1.46.0, in place of 1.45.0's scrolling timeline, which the owner found hard to follow): six
 * named steps in a row, the open one's words and demo below. It moves on by itself every few seconds while it's on
 * screen (the bar under the step fills as it goes), stops while you point at it or use the keyboard in it, and any
 * step opens with a click. With animations off nothing moves on its own: the bars aren't shown and you pick.
 * Every step's words are in the page (the others hidden), for search engines and screen readers alike.
 */
export function StepsClient({ scenes, visuals }: { scenes: readonly StepScene[]; visuals: React.ReactNode[] }) {
  const [open, setOpen] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // Only while it's on screen.
  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => el.toggleAttribute("data-visible", e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const go = (i: number, focus = false) => {
    const n = (i + scenes.length) % scenes.length;
    setOpen(n);
    if (focus) tabs.current[n]?.focus();
  };

  return (
    <div ref={root} className="steps">
      <div role="tablist" aria-label="The steps" className="steps-tabs grid grid-flow-col auto-cols-[minmax(10.5rem,1fr)] lg:grid-cols-6 lg:auto-cols-auto gap-2 overflow-x-auto snap-x scroll-pl-4 sm:scroll-pl-0 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {scenes.map((s, i) => (
          <button
            key={s.id}
            ref={(b) => {
              tabs.current[i] = b;
            }}
            type="button"
            role="tab"
            id={`step-tab-${s.id}`}
            aria-selected={open === i}
            aria-controls={`step-${s.id}`}
            tabIndex={open === i ? 0 : -1}
            onClick={() => go(i)}
            onKeyDown={(e) => {
              const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? scenes.length - 1 : null;
              if (to === null) return;
              e.preventDefault();
              go(to, true);
            }}
            className="steps-tab snap-start text-left rounded-2xl px-4 pt-3.5 pb-3 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            <span className="flex items-baseline gap-2">
              <span className="ld-scene-mark text-[16px] text-amber tabular-nums">{i + 1}</span>
              <span className="font-display text-[19px] font-semibold leading-tight">{s.label}</span>
            </span>
            <span className="steps-bar mt-3 block h-[3px] rounded-full bg-line/12 overflow-hidden" aria-hidden>
              <span
                className="steps-fill block h-full rounded-full bg-amber"
                data-state={i < open ? "done" : i === open ? "on" : "next"}
                onAnimationEnd={() => {
                  if (i === open) go(open + 1);
                }}
              />
            </span>
          </button>
        ))}
      </div>

      {scenes.map((s, i) => (
        <div
          key={s.id}
          role="tabpanel"
          id={`step-${s.id}`}
          aria-labelledby={`step-tab-${s.id}`}
          hidden={open !== i}
          className={`steps-panel mt-8 sm:mt-10 gap-8 lg:grid-cols-12 lg:gap-12 items-center ${open === i ? "grid" : "hidden"}`}
        >
          <div className="lg:col-span-5">
            <h3 className="font-display text-[30px] sm:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em]">{s.title}</h3>
            <p className="mt-4 text-[16.5px] leading-relaxed text-ink-soft">{s.text}</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {s.facts.map((f) => (
                <li key={f} className="rounded-lg border border-line/15 px-3 h-8 inline-flex items-center text-[13px] text-ink-soft">
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
              <Link href={s.more.href} className="site-link font-semibold">
                More about {s.more.label}
              </Link>
              {i < scenes.length - 1 && (
                <button type="button" onClick={() => go(i + 1)} className="text-ink-soft hover:text-ink font-semibold">
                  Next: {scenes[i + 1].label}
                </button>
              )}
            </p>
          </div>
          <div className="lg:col-span-7">{visuals[i]}</div>
        </div>
      ))}
    </div>
  );
}
