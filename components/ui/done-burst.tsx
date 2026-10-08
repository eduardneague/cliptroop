"use client";

import { useEffect, useState } from "react";

/**
 * The big "All done" tick (ring draws, tick draws, sparks, then it fades
 * after ~2 s). Shown over everything, never blocks a click. Used when a
 * script's Staging is done and when a report is sent; use it for moments
 * that finish something. Re-show it by changing its `key`.
 * Styles: `.done-burst` / `.done-check` in globals.css (calm when motion is off).
 */
export function DoneBurst({ title = "All done", subtitle }: { title?: string; subtitle?: React.ReactNode }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 2100);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  const sparks = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center pointer-events-none" aria-hidden>
      <div className="done-burst flex flex-col items-center gap-3 rounded-3xl bg-surface shadow-2xl ring-1 ring-line/10 px-10 py-8">
        <svg viewBox="0 0 60 60" className="done-check w-24 h-24 overflow-visible">
          <circle className="disc" cx="30" cy="30" r="24" fill="rgb(var(--green) / 0.14)" />
          <circle className="ring" cx="30" cy="30" r="24" fill="none" stroke="rgb(var(--green))" strokeWidth="3.5" strokeLinecap="round" transform="rotate(-90 30 30)" />
          <path className="tick" d="M19 31 l7.5 7.5 L41.5 22.5" fill="none" stroke="rgb(var(--green))" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" style={{ "--len": 48 } as React.CSSProperties} />
          {sparks.map((a, k) => (
            <circle key={a} className="spark" cx="30" cy="30" r="2" fill={k % 2 ? "rgb(var(--amber))" : "rgb(var(--green))"} style={{ "--a": `${a}deg`, "--d": `${(k % 3) * 40}ms` } as React.CSSProperties} />
          ))}
        </svg>
        <div className="text-center">
          <div className="font-display text-[19px] font-bold">{title}</div>
          {subtitle && <div className="text-[12.5px] text-ink-soft">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
