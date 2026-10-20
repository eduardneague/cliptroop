"use client";

import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { compact } from "../lib/filters";
import { multText } from "../lib/scores";
import { familyOf } from "../lib/insights";
import { heat } from "./bits";

/*
 * The panels' charts (1.27.0): a channel's videos as bars against its usual
 * (the spike, big), when a channel posts, and a thumbnail's colours.
 */

export type Bar = { id: string; title: string; views: number | null; score: number | null; at: string; stored?: boolean };

const noop = () => () => {};
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Videos as bars, oldest left, each in its heat colour (quiet below 2×), a
 * dashed line at the channel's usual. Square-root heights: a 30× hit still
 * leaves its neighbours readable. Pointing at a bar says which video it is;
 * clicking opens it.
 */
export function BarsChart({ bars, usual, focus, height = 180, onPick, label }: { bars: Bar[]; usual: number | null; focus?: string | null; height?: number; onPick?: (id: string) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.views ?? 0));
  const scale = (v: number) => Math.sqrt(Math.max(0, v) / max);
  const n = bars.length;
  if (n < 2) return <p className="text-[12.5px] text-ink-faint">Not enough of the channel&rsquo;s videos are stored yet.</p>;
  const gapPct = n > 40 ? 0.25 : 0.35;
  const uy = usual ? (1 - scale(usual)) * 100 : null;
  const h = hover !== null ? bars[hover] : null;
  return (
    <div className="relative" ref={box}>
      <div className="relative" style={{ height }} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-0 flex items-end" style={{ gap: `${gapPct}%` }}>
          {bars.map((b, i) => {
            const hh = heat(b.score);
            const on = b.id === focus;
            const hot = (b.score ?? 0) >= 2;
            return (
              <button
                key={b.id}
                type="button"
                tabIndex={-1}
                aria-hidden
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => b.stored !== false && onPick?.(b.id)}
                className="spike-bar relative flex-1 min-w-[2px] h-full flex items-end group/bar"
                style={{ animationDelay: `${Math.min(i, 40) * 14}ms` }}
              >
                <span
                  className="block w-full rounded-t-[3px] transition-[filter] group-hover/bar:brightness-110"
                  style={{
                    height: `${Math.max(1.5, scale(b.views ?? 0) * 100)}%`,
                    background: on ? hh.solid : hot ? hh.solid : "rgb(var(--ink) / 0.16)",
                    opacity: focus && !on && hot ? 0.55 : 1,
                    outline: on ? "2px solid rgb(var(--ink))" : undefined,
                    outlineOffset: on ? 2 : undefined,
                  }}
                />
              </button>
            );
          })}
        </div>
        {uy !== null && (
          <div className="absolute inset-x-0 pointer-events-none" style={{ top: `${uy}%` }}>
            <div className="border-t border-dashed border-ink/40" />
            <span className="absolute right-0 -top-[18px] rounded-[4px] bg-surface/90 px-1 text-[10.5px] font-semibold text-ink-soft tabular-nums">usual {compact(usual)}</span>
          </div>
        )}
        {h && (
          <div
            className="pointer-events-none absolute z-10 w-[220px] rounded-xl border border-line/15 bg-surface shadow-xl px-3 py-2 text-[12px]"
            style={{ left: `clamp(0px, calc(${((hover! + 0.5) / n) * 100}% - 110px), calc(100% - 220px))`, bottom: `calc(100% + 6px)` }}
          >
            <div className="font-semibold leading-snug line-clamp-2">{h.title}</div>
            <div className="mt-1 flex items-center gap-2 text-ink-soft">
              <span className="font-display font-semibold" style={{ color: heat(h.score).text }}>
                {multText(h.score)}
              </span>
              <span className="tabular-nums">{compact(h.views)} views</span>
              <span className="text-ink-faint">{new Date(h.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</span>
            </div>
          </div>
        )}
      </div>
      <ul className="sr-only">
        {bars.map((b) => (
          <li key={b.id}>
            {b.title}: {compact(b.views)} views, {multText(b.score)} the channel&rsquo;s usual
          </li>
        ))}
      </ul>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * When a channel posts (this device's time zone): a week of hours, darker
 * where more videos went up, a ring where the outliers did.
 */
export function PostingHeat({ dates }: { dates: { at: string; score: number | null }[] }) {
  const mounted = useMounted();
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, hits: 0 })));
    if (!mounted) return g;
    for (const d of dates) {
      const t = new Date(d.at);
      if (!Number.isFinite(t.getTime())) continue;
      const day = (t.getDay() + 6) % 7;
      const cell = g[day][t.getHours()];
      cell.n++;
      if ((d.score ?? 0) >= 3) cell.hits++;
    }
    return g;
  }, [dates, mounted]);
  const max = Math.max(1, ...grid.flat().map((c) => c.n));
  const byDay = grid.map((r) => r.reduce((s, c) => s + c.n, 0));
  const best = byDay.indexOf(Math.max(...byDay));
  const hours = grid.reduce((acc, r) => acc.map((v, i) => v + r[i].n), Array(24).fill(0) as number[]);
  const peak = hours.indexOf(Math.max(...hours));
  return (
    <div>
      <div className="grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[3px] items-center">
        {grid.map((row, d) => (
          <div key={d} className="contents">
            <span className="text-[10.5px] font-semibold text-ink-faint">{DAYS[d]}</span>
            {row.map((c, hr) => (
              <span
                key={hr}
                title={mounted ? `${DAYS[d]} ${String(hr).padStart(2, "0")}:00 · ${c.n} video${c.n === 1 ? "" : "s"}${c.hits ? `, ${c.hits} outlier${c.hits === 1 ? "" : "s"}` : ""}` : undefined}
                className="aspect-square rounded-[3px]"
                style={{
                  background: c.n ? `rgb(var(--amber) / ${(0.18 + 0.82 * (c.n / max)).toFixed(2)})` : "rgb(var(--ink) / 0.05)",
                  boxShadow: c.hits ? "inset 0 0 0 1.5px rgb(var(--violet))" : undefined,
                }}
              />
            ))}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, hr) => (
          <span key={hr} className="text-[9.5px] text-ink-faint text-center tabular-nums">
            {hr % 6 === 0 ? hr : ""}
          </span>
        ))}
      </div>
      {mounted && dates.length > 4 && (
        <p className="mt-2 text-[12px] text-ink-soft">
          Posts most on <span className="font-semibold text-ink">{DAYS[best]}</span>, around <span className="font-semibold text-ink">{peak}:00</span> your time.
          <span className="ml-2 inline-flex items-center gap-1 text-ink-faint">
            <span className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ boxShadow: "inset 0 0 0 1.5px rgb(var(--violet))" }} aria-hidden /> an outlier went up
          </span>
        </p>
      )}
    </div>
  );
}

/** A thumbnail's main colours as swatches, with their family names. */
export function Swatches({ colors, size = "md" }: { colors: string[] | null; size?: "sm" | "md" }) {
  if (!colors?.length) return null;
  const sz = size === "sm" ? "w-5 h-5" : "w-9 h-9";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {colors.slice(0, 5).map((c, i) => (
        <span key={`${c}-${i}`} title={`${c} · ${familyOf(c)}`} className={`${sz} rounded-md ring-1 ring-line/15`} style={{ background: c }} />
      ))}
    </div>
  );
}

/** A small horizontal bar for a share (0…1), with the label and value. */
export function ShareBar({ label, value, sub, color = "rgb(var(--amber))", max = 1 }: { label: React.ReactNode; value: number; sub?: React.ReactNode; color?: string; max?: number }) {
  const id = useId();
  return (
    <div className="min-w-0" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span id={id} className="truncate text-ink-soft">
          {label}
        </span>
        <span className="font-semibold tabular-nums flex-shrink-0">{sub}</span>
      </div>
      <div className="mt-1 h-2 rounded-[3px] bg-line/[0.07] overflow-hidden">
        <div className="h-full rounded-[3px]" style={{ width: `${Math.max(2, Math.min(100, (value / Math.max(max, 1e-9)) * 100))}%`, background: color }} />
      </div>
    </div>
  );
}

/** A lift as words and colour: 1.8× is good news, 0.6× isn't. */
export function Lift({ lift, n, className = "" }: { lift: number | null | undefined; n?: number; className?: string }) {
  if (lift === null || lift === undefined || !Number.isFinite(lift)) return <span className={`text-ink-faint ${className}`}>–</span>;
  const good = lift >= 1.15;
  const bad = lift <= 0.87;
  return (
    <span title={n !== undefined ? `From ${n} videos` : undefined} className={`font-display font-semibold tabular-nums ${good ? "text-green" : bad ? "text-red" : "text-ink-soft"} ${className}`}>
      {multText(lift)}
    </span>
  );
}

/** A title's score (1–99) as a ring. */
export function ScoreDial({ score, size = 56 }: { score: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "rgb(var(--green))" : score >= 55 ? "rgb(var(--blue))" : score >= 45 ? "rgb(var(--ink-soft))" : "rgb(var(--red))";
  return (
    <span className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Title score ${score} out of 100`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--ink) / 0.08)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} style={{ transition: "stroke-dasharray .5s var(--ease-out)" }} />
      </svg>
      <span className="absolute font-display font-semibold tabular-nums" style={{ fontSize: size * 0.34 }}>
        {score}
      </span>
    </span>
  );
}
