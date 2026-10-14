"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, PauseIcon, TrophyIcon } from "@/components/ui/icons";
import { useCountUp } from "@/components/ui/count-up";
import { inARow, streakLine, unitWord, type StreakSlot, type WinStreak } from "../lib/streak";

/*
 * The win streak's pieces (1.18.0), shared by the dashboard widget, the
 * Objectives page and the celebration: the flame (lit while there's a
 * streak), the strip of the latest days or weeks, the page's card. The flame
 * and the won squares keep their own orange in every colour theme (like the
 * daily word's tiles): it's the streak's colour.
 */

/** The flame. Lit: orange, flickering (when animations are on); out: grey. */
export function StreakFlame({ lit, size = 40, flicker = true, className = "" }: { lit: boolean; size?: number; flicker?: boolean; className?: string }) {
  const id = `fl${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 40" width={size * 0.8} height={size} className={`flex-shrink-0 overflow-visible ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb627" />
          <stop offset="1" stopColor="#ff5f0f" />
        </linearGradient>
        <linearGradient id={`${id}i`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="1" stopColor="#ffc83d" />
        </linearGradient>
      </defs>
      <g className={lit && flicker ? "streak-flame" : undefined}>
        <path
          fill={lit ? `url(#${id}o)` : "rgb(var(--line) / 0.22)"}
          d="M16 2C17.5 7.5 22 10.5 25 14.5C27.6 18 29 21.6 29 25.5C29 33 23.2 38.5 16 38.5C8.8 38.5 3 33 3 25.5C3 21 4.8 17.2 7.6 14.2C8.2 17.2 9.6 19.4 11.8 20.6C11 13.6 12.6 7.2 16 2Z"
        />
        <path
          className={lit && flicker ? "streak-flame-in" : undefined}
          fill={lit ? `url(#${id}i)` : "rgb(var(--line) / 0.12)"}
          d="M16 18.5C17 21.5 19.6 23.2 21 25.4C22 27 22.6 28.6 22.6 30.3C22.6 34 19.7 36.6 16 36.6C12.3 36.6 9.4 34 9.4 30.3C9.4 27.9 10.4 25.9 12 24.4C12.3 26 13.1 27.1 14.3 27.7C14 24.4 14.6 21.2 16 18.5Z"
        />
      </g>
    </svg>
  );
}

const STATE_WORD: Record<StreakSlot["state"], string> = {
  won: "won",
  missed: "no win",
  off: "off (every goal switched off)",
  open: "no win yet",
  future: "to come",
  before: "before the streak's first goal",
};

/**
 * The latest days (this week, Monday to Sunday) or weeks/months, oldest
 * first: won ones orange with a tick, today's still open dashed, days off
 * with a pause sign. A square that turns won while you look pops.
 */
export function StreakStrip({ slots, size = "md", className = "" }: { slots: StreakSlot[]; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "sm" ? "w-[22px] h-[22px] rounded-[5px]" : size === "lg" ? "w-9 h-9 rounded-lg" : "w-7 h-7 rounded-md";
  const tick = size === "sm" ? "w-3 h-3" : size === "lg" ? "w-[18px] h-[18px]" : "w-3.5 h-3.5";
  // Squares that were open and are won now: pop once.
  const before = useRef<Map<string, StreakSlot["state"]> | null>(null);
  const [popped, setPopped] = useState<Set<string>>(new Set());
  useEffect(() => {
    const prev = before.current;
    before.current = new Map(slots.map((s) => [s.start, s.state]));
    if (!prev) return;
    const fresh = slots.filter((s) => s.state === "won" && prev.get(s.start) && prev.get(s.start) !== "won").map((s) => s.start);
    if (!fresh.length) return;
    setPopped(new Set(fresh));
    const t = setTimeout(() => setPopped(new Set()), 900);
    return () => clearTimeout(t);
  }, [slots]);

  return (
    <ol className={`flex items-start justify-between gap-1 ${className}`} aria-label="The latest periods">
      {slots.map((s) => {
        const title = `${s.title}: ${s.state === "won" && s.wins > 1 ? `${s.wins} wins` : STATE_WORD[s.state]}`;
        return (
          <li key={s.start} className="flex flex-col items-center gap-1 min-w-0" title={title}>
            <span
              className={`${box} flex items-center justify-center flex-shrink-0 ${popped.has(s.start) ? "streak-pop" : ""} ${
                s.state === "won"
                  ? "streak-won text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]"
                  : s.state === "open"
                    ? "border-2 border-dashed border-[#ff8a1f]/70"
                    : s.state === "off"
                      ? "bg-teal/12 text-teal"
                      : s.state === "missed"
                        ? "bg-line/10"
                        : s.state === "future"
                          ? "border border-line/15"
                          : "border border-dashed border-line/10"
              }`}
            >
              {s.state === "won" ? <CheckIcon className={tick} /> : s.state === "off" ? <PauseIcon className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} /> : null}
              <span className="sr-only">{title}</span>
            </span>
            <span className={`text-[10px] leading-none tabular-nums ${s.current ? "font-bold text-ink" : s.state === "before" || s.state === "future" ? "text-ink-faint/70" : "text-ink-faint"}`} aria-hidden>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The number, counting up when it grows (the flame beside it). */
export function StreakCount({ s, size = 34, className = "" }: { s: WinStreak; size?: number; className?: string }) {
  const shown = useCountUp(s.current);
  return (
    <span className={`font-display font-semibold leading-none tabular-nums ${s.current ? "" : "text-ink-soft"} ${className}`} style={{ fontSize: size }}>
      {shown}
    </span>
  );
}

/**
 * The Objectives page's streak, in its own card (1.18.1): the flame and the
 * count in words, the best run, the strip with the line about what's next,
 * and the wins of the last 30 days. Beside the overview on wide screens (a
 * column), across under it on the rest (a row; a column again on phones).
 */
export function StreakCard({ s, wins30, action, className = "" }: { s: WinStreak; wins30: number; action?: React.ReactNode; className?: string }) {
  return (
    <section aria-label="Win streak" className={`rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0 grid gap-x-6 gap-y-3 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] md:items-center xl:grid-cols-1 xl:items-stretch xl:content-center ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        <StreakFlame lit={s.current > 0} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] text-ink-soft">Win streak</div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <StreakCount s={s} size={30} />
            <span className="text-[13px] font-semibold text-ink-soft truncate">{unitWord(s.unit, s.current)} in a row</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0 md:hidden xl:block">
          <div className="text-[11.5px] text-ink-soft">Best</div>
          <div className="font-display text-[18px] font-semibold tabular-nums leading-tight">{s.best}</div>
        </div>
      </div>
      <div className="min-w-0">
        <StreakStrip slots={s.slots} size="sm" className="max-w-[320px]" />
        <p className={`mt-2 text-[12px] leading-snug ${s.safe ? "text-green" : s.current > 0 ? "text-ink-soft" : "text-ink-faint"}`}>{streakLine(s)}</p>
      </div>
      <div className="flex md:flex-col xl:flex-row items-center md:items-end xl:items-center gap-x-4 gap-y-1.5 flex-wrap xl:pt-3 xl:border-t xl:border-line/10">
        <span className="hidden md:inline xl:hidden text-[12.5px] text-ink-soft">
          Best <b className="font-display text-[16px] font-semibold text-ink tabular-nums">{s.best}</b>
        </span>
        <a href="#wins" className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft hover:text-ink whitespace-nowrap">
          <TrophyIcon className="w-4 h-4 text-gold" />
          <b className="text-ink font-semibold tabular-nums">{wins30}</b> {wins30 === 1 ? "win" : "wins"} in 30 days
        </a>
        {action}
      </div>
    </section>
  );
}

/** "3 days in a row", "No streak yet". */
export const streakTitle = (s: WinStreak) => (s.current > 0 ? inARow(s) : s.total > 0 ? "No streak right now" : "No streak yet");
