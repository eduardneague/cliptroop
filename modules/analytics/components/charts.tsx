"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, LIVE_ICON_PATH, SHORTS_ICON_PATH, VIDEO_ICON_PATH } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { SocialPlatform } from "@/lib/social/providers";
import { KIND_LABEL, KIND_PLURAL, type VideoKind } from "../lib/kinds";

/*
 * Small SVG charts for Analytics (no chart library). Rules followed:
 * 2px lines, ≤24px bars with a 4px rounded end and a 2px gap between
 * stacked parts, hairline grid, one y-axis, legend for 2+ series, text in
 * text colours (the coloured mark beside it carries identity), a crosshair
 * tooltip on lines and a per-column tooltip on bars, keyboard too.
 */

export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : Math.round(n).toLocaleString("en-US"));
export function fmtCompact(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

/** Clean axis maximum and ticks (0, 1K, 2K…). */
/** The last point with a number (-1: none). Days after it have no data yet. */
function lastNum(xs: readonly (number | null | undefined)[]): number {
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i] !== null && xs[i] !== undefined && Number.isFinite(xs[i])) return i;
  return -1;
}

function niceScale(max: number, count = 4) {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  // From 1 up, steps are whole numbers (counts never get "2.5" or "0.5" ticks).
  const whole = (s: number) => max < 1 || Number.isInteger(Math.round(s * 1e9) / 1e9);
  const step = Math.max(max >= 1 ? 1 : 0, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && whole(s)) ?? 10 * mag);
  const top = Math.round(Math.ceil(max / step) * step * 1e6) / 1e6;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max: top, ticks };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export type Series = {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  /** Points worked out rather than counted (1.22.0): drawn dashed, and said in the tooltip. */
  est?: boolean[];
};

/**
 * What was posted at a point on a chart (videos, by kind). 1.22.0: one icon
 * per point under the chart (the kind's icon for one video, the count for
 * more), and pointing at it lists them, like YouTube Studio.
 */
export type MarkKind = VideoKind;
export type Mark = {
  title: string;
  kind: MarkKind;
  /** For the list: which video, where it opens, its picture and when it was posted. */
  id?: string;
  platform?: SocialPlatform;
  thumbnail?: string | null;
  at?: string | null;
  href?: string;
};
export const MARK_COLOR: Record<MarkKind, string> = { short: "rgb(var(--short))", long: "rgb(var(--long))", live: "rgb(var(--chart-live))", post: "rgb(var(--ink-faint))" };
const MARK_ORDER: MarkKind[] = ["short", "long", "live", "post"];
const MARK_PATH: Record<Exclude<MarkKind, "post">, string> = { short: SHORTS_ICON_PATH, long: VIDEO_ICON_PATH, live: LIVE_ICON_PATH };

/** The sidebar's icon for a kind as a small inline picture (tooltips, legends, lists). */
export function MarkIcon({ kind, className = "w-3.5 h-3.5" }: { kind: MarkKind; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} flex-shrink-0`} aria-hidden>
      {kind === "post" ? <rect x="5" y="5" width="14" height="14" rx="3.5" fill={MARK_COLOR.post} /> : <path d={MARK_PATH[kind]} fill={MARK_COLOR[kind]} fillRule="evenodd" />}
    </svg>
  );
}

/** "13 Shorts, 1 long video and 1 live stream". */
export function kindCounts(items: { kind: MarkKind }[]): string {
  const parts = MARK_ORDER.map((k) => {
    const c = items.filter((x) => x.kind === k).length;
    if (!c) return null;
    const one = KIND_LABEL[k].toLowerCase();
    return `${c} ${c === 1 ? (k === "short" ? "Short" : one) : k === "short" ? "Shorts" : KIND_PLURAL[k]}`;
  }).filter((x): x is string => !!x);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
}

const markTime = (at: string | null | undefined, withDay: boolean) => {
  if (!at) return "";
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("en-US", withDay ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { hour: "numeric", minute: "2-digit" });
};

/**
 * The icon under a point of the chart where videos were posted: one video
 * shows its kind's icon, more show how many. Pointing at it (or focusing it,
 * or tapping it) opens the list: how many of each kind, each one with its
 * picture, when it went up, and a link to its analytics.
 */
function PostedMark({ items, left, top, size, when, withDay }: { items: Mark[]; left: number; top: number; size: number; when: string; withDay: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const shut = useRef<number | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const kinds = MARK_ORDER.filter((k) => items.some((m) => m.kind === k));
  const main = kinds.length ? kinds.reduce((a, b) => (items.filter((m) => m.kind === b).length > items.filter((m) => m.kind === a).length ? b : a)) : "post";
  const cancel = () => {
    if (shut.current) window.clearTimeout(shut.current);
    shut.current = null;
  };
  const show = () => {
    cancel();
    setOpen(true);
  };
  const hide = (ms = 160) => {
    cancel();
    shut.current = window.setTimeout(() => setOpen(false), ms);
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const w = 320;
      const up = r.top > 360 || r.top > window.innerHeight - r.bottom;
      setPos({ left: Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8), top: up ? r.top - 8 : r.bottom + 8, up });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  useEffect(() => () => cancel(), []);
  const label = `${items.length} video${items.length === 1 ? "" : "s"} posted ${when}`;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
        onFocus={show}
        onBlur={(e) => {
          if (!pop.current?.contains(e.relatedTarget as Node | null)) hide(80);
        }}
        onClick={() => (open ? setOpen(false) : show())}
        className="absolute z-[2] flex items-center justify-center rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-amber transition-transform hover:scale-110"
        style={{ left: left - size / 2, top, width: size, height: size }}
      >
        {items.length === 1 ? (
          <MarkIcon kind={items[0].kind} className="w-full h-full" />
        ) : (
          <span
            className="w-full h-full rounded-[4px] flex items-center justify-center text-[9.5px] font-bold tabular-nums leading-none"
            // (1.23.1: its own fill and number colours, readable in both themes.)
            style={{ background: `rgb(var(--mark-${main}))`, color: "rgb(var(--on-mark))" }}
          >
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label={label}
            onPointerEnter={(e) => e.pointerType === "mouse" && cancel()}
            onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
            className="fixed z-[140] w-[320px] max-w-[calc(100vw-16px)] rounded-xl border border-line/15 bg-surface shadow-2xl animate-[fadein_.12s_ease]"
            style={{ left: pos.left, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          >
            <div className="px-3.5 pt-3 pb-2 border-b border-line/10">
              <p className="text-[13px] font-semibold">
                {items.length} video{items.length === 1 ? "" : "s"} posted
              </p>
              <p className="text-[11.5px] text-ink-faint mt-0.5">
                {when}
                {kinds.length ? ` · ${kindCounts(items)}` : ""}
              </p>
            </div>
            <ul className="max-h-[300px] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll py-1">
              {items.slice(0, 40).map((m, k) => {
                const tall = m.kind === "short" || m.kind === "post";
                const inner = (
                  <>
                    <span className={`relative rounded-md overflow-hidden bg-surface-2 flex-shrink-0 ${tall ? "w-7 h-10" : "w-14 h-8"}`}>
                      {m.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <MarkIcon kind={m.kind} className="w-4 h-4" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold leading-snug line-clamp-2">{m.title || "Untitled"}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint min-w-0">
                        <MarkIcon kind={m.kind} className="w-3 h-3" />
                        {m.platform && <PlatformIcon platform={m.platform} className="w-3 h-3 rounded-[3px]" />}
                        <span className="truncate">
                          {KIND_LABEL[m.kind]}
                          {m.at ? ` · ${markTime(m.at, withDay)}` : ""}
                        </span>
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={m.id ?? k}>
                    {m.href ? (
                      <Link href={m.href} className="flex items-center gap-2.5 px-3.5 py-1.5 hover:bg-surface-2 focus-visible:bg-surface-2 outline-none">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2.5 px-3.5 py-1.5">{inner}</div>
                    )}
                  </li>
                );
              })}
              {items.length > 40 && <li className="px-3.5 py-1.5 text-[11.5px] text-ink-faint">and {items.length - 40} more</li>}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}

/** Legend: a short line (lines) or a swatch (bars) + the name, in text colour. */
export function Legend({ items, shape = "line" }: { items: { key: string; label: string; color: string; dashed?: boolean }[]; shape?: "line" | "rect" }) {
  if (items.length < 2) return null;
  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px] text-ink-soft" role="list">
      {items.map((s) => (
        <span key={s.key} role="listitem" className="inline-flex items-center gap-1.5">
          {shape === "line" ? (
            s.dashed ? (
              <svg width="16" height="2" aria-hidden className="overflow-visible">
                <line x1="1" x2="15" y1="1" y2="1" stroke={s.color} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
              </svg>
            ) : (
              <span className="w-4 h-[2px] rounded-[1px]" style={{ background: s.color }} aria-hidden />
            )
          ) : (
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          )}
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** "+12%" / "−8%" next to a value and the one before (no colour when there's nothing to compare). */
function Change({ now, prev }: { now: number | null; prev: number | null }) {
  if (now === null || prev === null || prev === 0) return null;
  const pct = ((now - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return <span className="ml-auto text-[10.5px] font-semibold text-ink-faint">same</span>;
  return <span className={`ml-auto text-[10.5px] font-bold tabular-nums ${pct > 0 ? "text-green" : "text-red"}`}>{`${pct > 0 ? "+" : "−"}${Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}%`}</span>;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  // Keeps inside the chart: flips to the left of the pointer near the right edge.
  const left = x > width - 190 ? Math.max(0, x - 180) : x + 12;
  return (
    <div className="pointer-events-none absolute z-10 min-w-[150px] max-w-[220px] rounded-xl border border-line/15 bg-surface shadow-xl px-3 py-2 text-[12px]" style={{ left, top: Math.max(0, y) }}>
      {children}
    </div>
  );
}

/**
 * Lines over time: one per series (+ an optional grey "previous period"
 * line). Crosshair + tooltip on hover/focus, ← → keys move it.
 */
export function LineChart({
  labels,
  series,
  previous,
  format = fmtCompact,
  height = 240,
  ariaLabel,
  onPick,
  pickHint = "Click for this day's videos",
  tips,
  area = false,
  marks,
  markLabel = "Posted",
  markDays = true,
  gaps = "bridge",
}: {
  labels: string[];
  series: Series[];
  previous?: { label: string; values: (number | null)[] } | null;
  format?: (n: number | null) => string;
  height?: number;
  ariaLabel: string;
  /** Click (or Enter on) a point: its index (e.g. to open that day's videos). */
  onPick?: (index: number) => void;
  pickHint?: string;
  /** The tooltip's title for each point (default: its label), e.g. the whole date. */
  tips?: string[];
  /** A soft fill under a single line. */
  area?: boolean;
  /** Icons under the line where videos were posted: one per point, listing them when pointed at. */
  marks?: { i: number; items: Mark[] }[];
  markLabel?: string;
  /** The marks' times with their day (days, weeks…) or just the time (hours). */
  markDays?: boolean;
  /**
   * Points without a number between two with one (1.22.0): "bridge" joins
   * them with a faint dashed line, so a stretch with missing days still reads
   * as one line instead of loose pieces; "break" leaves the gap.
   */
  gaps?: "bridge" | "break";
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId().replace(/:/g, "");
  const n = labels.length;
  // Where each line's numbers end (1.29.0): the points after are days with no data yet, not zeros.
  const lastOf = series.map((s) => lastNum(s.values));
  const all = [...series.flatMap((s) => s.values), ...(previous?.values ?? [])].filter((v): v is number => v !== null);
  const { max, ticks } = niceScale(Math.max(0, ...all));
  const left = Math.max(32, String(format(max)).length * 7 + 10);
  const right = 14;
  const top = 10;
  const markAt = useMemo(() => new Map((marks ?? []).filter((m) => m.items.length).map((m) => [m.i, m.items])), [marks]);
  const bottom = 26 + (markAt.size ? 22 : 0);
  const iw = Math.max(10, width - left - right);
  const ih = height - top - bottom;
  const x = (i: number) => left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => top + ih - (v / max) * ih;
  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  // A line whose points are partly worked out: solid between counted points, dashed where either end is estimated.
  const parts = (vals: (number | null)[], est?: boolean[]) => {
    if (!est?.some(Boolean)) return { solid: path(vals), dashed: "" };
    let solid = "";
    let dashed = "";
    let last: number | null = null;
    vals.forEach((v, i) => {
      if (v === null) {
        last = null;
        return;
      }
      if (last !== null) {
        const seg = `M${x(last).toFixed(1)},${y(vals[last]!).toFixed(1)}L${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        if (est[last] || est[i]) dashed += seg;
        else solid += seg;
      }
      last = i;
    });
    return { solid, dashed };
  };
  // Across the gaps: from the last point before one to the first after it.
  const bridges = (vals: (number | null)[]) => {
    let d = "";
    let last: number | null = null;
    vals.forEach((v, i) => {
      if (v === null) return;
      if (last !== null && i - last > 1) d += `M${x(last).toFixed(1)},${y(vals[last]!).toFixed(1)}L${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      last = i;
    });
    return d;
  };
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const indexAt = (clientX: number, el: SVGElement) => {
    const r = el.getBoundingClientRect();
    const px = clientX - r.left;
    return Math.max(0, Math.min(n - 1, Math.round(((px - left) / iw) * (n - 1))));
  };
  const pick = (clientX: number, el: SVGElement) => setHover(indexAt(clientX, el));
  return (
    <div ref={box} className="relative select-none">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className={`block outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-lg ${onPick ? "cursor-pointer" : ""}`}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          onClick={onPick ? (e) => onPick(indexAt(e.clientX, e.currentTarget)) : undefined}
          onFocus={() => setHover((h) => h ?? n - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n - 1) - 1));
            if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? 0) + 1));
            if (onPick && (e.key === "Enter" || e.key === " ") && hover !== null) {
              e.preventDefault();
              onPick(hover);
            }
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={left + iw} y1={y(t)} y2={y(t)} stroke="rgb(var(--line) / 0.08)" strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[10.5px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % step === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-ink-faint text-[10.5px]">
                {i === n - 1 || n - 1 - i >= step * 0.6 ? l : ""}
              </text>
            ) : null
          )}
          {area && series.length === 1 && (
            <>
              <defs>
                <linearGradient id={`fill${gradId}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={series[0].color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={series[0].color} stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* One closed shape per unbroken stretch of the line. */}
              {(() => {
                const runs: number[][] = [];
                series[0].values.forEach((v, i) => {
                  if (v === null) return;
                  const last = runs[runs.length - 1];
                  if (last && last[last.length - 1] === i - 1) last.push(i);
                  else runs.push([i]);
                });
                return runs
                  .filter((r) => r.length > 1)
                  .map((r) => (
                    <path
                      key={r[0]}
                      d={`M${x(r[0]).toFixed(1)},${(top + ih).toFixed(1)}${r.map((i) => `L${x(i).toFixed(1)},${y(series[0].values[i]!).toFixed(1)}`).join("")}L${x(r[r.length - 1]).toFixed(1)},${(top + ih).toFixed(1)}Z`}
                      fill={`url(#fill${gradId})`}
                    />
                  ));
              })()}
            </>
          )}
          {previous && <path d={path(previous.values)} fill="none" stroke="rgb(var(--ink-faint) / 0.7)" strokeWidth={1.5} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />}
          {gaps === "bridge" &&
            series.map((s) => {
              const d = bridges(s.values);
              return d ? <path key={`b${s.key}`} d={d} fill="none" stroke={s.color} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="3 4" strokeLinecap="round" /> : null;
            })}
          {series.map((s) => {
            const d = parts(s.values, s.est);
            return (
              <g key={s.key}>
                <path d={d.solid} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {d.dashed && <path d={d.dashed} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />}
              </g>
            );
          })}
          {/* A lone point (one day of data) still shows. */}
          {series.map((s) =>
            s.values.map((v, i) => (v !== null && (s.values[i - 1] ?? null) === null && (s.values[i + 1] ?? null) === null ? <circle key={`${s.key}${i}`} cx={x(i)} cy={y(v)} r={3} fill={s.color} /> : null))
          )}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + ih} stroke="rgb(var(--line) / 0.25)" strokeWidth={1} />
              {series.map((s) =>
                s.values[hover] !== null ? <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="rgb(var(--surface))" strokeWidth={2} /> : null
              )}
            </g>
          )}
        </svg>
      )}
      {/* The videos posted, one icon per point (1.22.0), each opening its list; points too close together share one (a phone's 28 days). */}
      {width > 0 &&
        (() => {
          const gap = n > 1 ? iw / (n - 1) : iw;
          const size = Math.max(12, Math.min(16, gap - 2));
          const groups: { at: number[]; items: Mark[] }[] = [];
          for (const [i, items] of [...markAt.entries()].sort((a, b) => a[0] - b[0])) {
            const g = groups[groups.length - 1];
            if (g && x(i) - x(g.at[0]) < size + 3) {
              g.at.push(i);
              g.items.push(...items);
            } else groups.push({ at: [i], items: [...items] });
          }
          const name = (i: number) => tips?.[i] ?? labels[i] ?? "";
          return groups.map((g) => {
            const a = g.at[0];
            const z = g.at[g.at.length - 1];
            return <PostedMark key={`m${a}`} items={g.items} left={(x(a) + x(z)) / 2} top={top + ih + 4} size={size} when={a === z ? name(a) : `${name(a)} – ${name(z)}`} withDay={markDays || a !== z} />;
          });
        })()}
      {hover !== null && width > 0 && (
        <Tooltip x={x(hover)} y={top} width={width}>
          <div className="text-[11px] font-semibold text-ink-faint mb-1">{tips?.[hover] ?? labels[hover]}</div>
          {series.every((s, k) => s.values[hover] === null && hover > lastOf[k]) ? (
            <div className="py-0.5 text-ink-soft">No data yet</div>
          ) : (
            series.map((s, k) => (
              <div key={s.key} className="flex items-center gap-2 py-0.5">
                <span className="w-3 h-[2px] rounded-[1px] flex-shrink-0" style={{ background: s.color }} />
                {s.values[hover] === null && hover > lastOf[k] ? <span className="text-ink-faint">No data yet</span> : <span className="font-bold tabular-nums text-ink">{format(s.values[hover])}</span>}
                <span className="text-ink-soft truncate">{s.label}</span>
                {s.est?.[hover] && <span className="ml-auto text-[10px] font-semibold text-ink-faint">estimated</span>}
              </div>
            ))
          )}
          {previous && (
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-3 h-[2px] rounded-[1px] flex-shrink-0 bg-ink-faint/60" />
              <span className="font-bold tabular-nums text-ink">{format(previous.values[hover] ?? null)}</span>
              <span className="text-ink-soft truncate">{previous.label}</span>
              {series.length === 1 && <Change now={series[0].values[hover]} prev={previous.values[hover] ?? null} />}
            </div>
          )}
          {markAt.get(hover) && (
            <div className="mt-1 pt-1 border-t border-line/10 flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-faint">
              <MarkIcon kind={markAt.get(hover)![0].kind} className="w-3 h-3" />
              {markLabel}: {kindCounts(markAt.get(hover)!)}
            </div>
          )}
          {onPick && <div className="mt-1 pt-1 border-t border-line/10 text-[10.5px] text-ink-faint">{pickHint}</div>}
        </Tooltip>
      )}
    </div>
  );
}

/** Stacked columns (e.g. shorts + long videos per week). Hover/focus a column for its numbers; `onPick`: click (or Enter on) one. */
export function StackedColumns({
  labels,
  tips,
  series,
  format = fmtInt,
  height = 220,
  ariaLabel,
  showTotal = true,
  onPick,
  pickHint = "Click for its videos",
}: {
  labels: string[];
  /** The tooltip's title for each column (default: its label), e.g. the day with the hour. */
  tips?: string[];
  /** The tooltip's "Total" line (off for shares, which always make 100%). */
  showTotal?: boolean;
  /** Null: no number for that column yet (1.29.0: it says "No data yet" instead of showing 0). */
  series: { key: string; label: string; color: string; values: (number | null)[] }[];
  format?: (n: number | null) => string;
  height?: number;
  ariaLabel: string;
  onPick?: (index: number) => void;
  pickHint?: string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  // Columns past every series' last number: days with no data yet.
  const last = Math.max(-1, ...series.map((s) => lastNum(s.values)));
  const empty = (i: number) => i > last && series.every((s) => s.values[i] === null || s.values[i] === undefined);
  const { max, ticks } = niceScale(Math.max(1, ...totals));
  const left = Math.max(28, String(format(max)).length * 7 + 10);
  const top = 10;
  const bottom = 26;
  const iw = Math.max(10, width - left - 8);
  const ih = height - top - bottom;
  const slot = iw / Math.max(1, n);
  const bw = Math.max(3, Math.min(24, slot * 0.62));
  const y = (v: number) => top + ih - (v / max) * ih;
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
  const GAP = 2;
  const R = 4;
  return (
    <div ref={box} className="relative select-none">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={left + iw} y1={y(t)} y2={y(t)} stroke="rgb(var(--line) / 0.08)" strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[10.5px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const cx = left + slot * i + slot / 2;
            let base = top + ih;
            let segs = series
              .map((s) => ({ s, v: s.values[i] ?? 0 }))
              .filter((x) => x.v > 0);
            // Too short to show its parts apart: one bar in the biggest part's colour (no stripes).
            if (segs.length > 1 && (totals[i] / max) * ih < segs.length * 5) {
              const big = segs.reduce((m, x) => (x.v > m.v ? x : m));
              segs = [{ s: big.s, v: totals[i] }];
            }
            return (
              <g
                key={i}
                tabIndex={0}
                role="img"
                aria-label={`${tips?.[i] ?? l}: ${empty(i) ? "no data yet" : series.map((s) => `${s.label} ${format(s.values[i] ?? 0)}`).join(", ")}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={onPick ? () => onPick(i) : undefined}
                onKeyDown={
                  onPick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPick(i);
                        }
                      }
                    : undefined
                }
                className={`outline-none ${onPick ? "cursor-pointer" : ""}`}
              >
                <rect x={cx - slot / 2} y={top} width={slot} height={ih} fill={hover === i ? "rgb(var(--line) / 0.04)" : "transparent"} />
                {segs.map(({ s, v }, k) => {
                  const h = Math.max(1, (v / max) * ih - (k ? GAP : 0));
                  const yTop = base - h;
                  const isTop = k === segs.length - 1;
                  const r = isTop ? Math.min(R, h, bw / 2) : 0;
                  const x0 = cx - bw / 2;
                  const d = `M${x0},${base}V${yTop + r}${r ? `Q${x0},${yTop} ${x0 + r},${yTop}` : ""}H${x0 + bw - r}${r ? `Q${x0 + bw},${yTop} ${x0 + bw},${yTop + r}` : ""}V${base}Z`;
                  base = yTop - GAP;
                  return <path key={s.key} d={d} fill={s.color} />;
                })}
                {(i === n - 1 || (i % step === 0 && n - 1 - i >= step * 0.6)) && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-ink-faint text-[10.5px]">
                    {l}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={left + slot * hover + slot / 2} y={top} width={width}>
          <div className="text-[11px] font-semibold text-ink-faint mb-1">{tips?.[hover] ?? labels[hover]}</div>
          {empty(hover) ? (
            <div className="py-0.5 text-ink-soft">No data yet</div>
          ) : (
            series.map((s) => (
              <div key={s.key} className="flex items-center gap-2 py-0.5">
                <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: s.color }} />
                {(s.values[hover] ?? null) === null && hover > lastNum(s.values) ? <span className="text-ink-faint">No data yet</span> : <span className="font-bold tabular-nums text-ink">{format(s.values[hover] ?? 0)}</span>}
                <span className="text-ink-soft">{s.label}</span>
              </div>
            ))
          )}
          {showTotal && series.length > 1 && !empty(hover) && <div className="mt-1 pt-1 border-t border-line/10 text-ink-soft">Total <b className="text-ink tabular-nums">{format(totals[hover])}</b></div>}
          {onPick && <div className="mt-1 pt-1 border-t border-line/10 text-[10.5px] text-ink-faint">{pickHint}</div>}
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal bars with the value at the tip (one colour: the bars are compared by length). */
export function BarList({
  items,
  format = fmtInt,
  color = "rgb(var(--amber))",
  empty = "No data yet.",
  onHover,
  active,
}: {
  items: { key: string; label: React.ReactNode; value: number | null; sub?: string; color?: string }[];
  format?: (n: number | null) => string;
  color?: string;
  empty?: string;
  /** Pointing at a row (e.g. turns the globe to that country). */
  onHover?: (key: string | null) => void;
  /** A row to show as highlighted (e.g. the country hovered on the map). */
  active?: string | null;
}) {
  const max = Math.max(0, ...items.map((i) => i.value ?? 0));
  if (!items.length) return <p className="text-[13px] text-ink-faint">{empty}</p>;
  return (
    <ul className="space-y-2" onMouseLeave={onHover ? () => onHover(null) : undefined}>
      {items.map((it) => (
        <li
          key={it.key}
          onMouseEnter={onHover ? () => onHover(it.key) : undefined}
          className={`grid grid-cols-[minmax(6rem,9rem)_1fr] sm:grid-cols-[minmax(7rem,11rem)_1fr] items-center gap-3 rounded-md transition-colors ${onHover ? "-mx-1.5 px-1.5 py-0.5 hover:bg-surface-2" : ""} ${active === it.key ? "bg-surface-2" : ""}`}
        >
          <span className="text-[13px] text-ink-soft truncate">{it.label}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="flex-1 min-w-0 h-2.5 rounded-[3px] bg-line/[0.06] overflow-hidden">
              <span className="block h-full rounded-[3px]" style={{ width: `${max ? Math.max(2, ((it.value ?? 0) / max) * 100) : 0}%`, background: it.color ?? color, opacity: it.value === null ? 0 : 1 }} />
            </span>
            <span className="w-14 text-right text-[12.5px] font-semibold tabular-nums text-ink flex-shrink-0">{format(it.value)}</span>
          </span>
          {it.sub && <span className="col-start-2 -mt-1.5 text-[11px] text-ink-faint">{it.sub}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * A headline number with its change vs the previous period. `good`:
 * which direction is good news (colours the change; an arrow + sign carry it too).
 */
export function StatTile({
  label,
  value,
  prev,
  format = fmtCompact,
  good = "up",
  unit = "",
  compare = true,
  hint,
  deltaMode = "percent",
  className = "",
}: {
  className?: string;
  label: string;
  value: number | null;
  prev?: number | null;
  format?: (n: number | null) => string;
  good?: "up" | "down" | "none";
  unit?: string;
  compare?: boolean;
  hint?: string;
  /** "points" for percentages (62% → 70% = +8 pts). */
  deltaMode?: "percent" | "points" | "absolute";
}) {
  const delta = useMemo(() => {
    if (!compare || value === null || prev === null || prev === undefined) return null;
    if (deltaMode === "points" || deltaMode === "absolute") return value - prev;
    if (prev === 0) return value === 0 ? 0 : null;
    const pct = ((value - prev) / Math.abs(prev)) * 100;
    // Rounds to 0.0%: no change worth an arrow or a colour.
    return Math.abs(pct) < 0.05 ? 0 : pct;
  }, [compare, value, prev, deltaMode]);
  const tone = delta === null || delta === 0 || good === "none" ? "text-ink-soft bg-surface-2" : (delta > 0) === (good === "up") ? "text-green bg-green/10" : "text-red bg-red/10";
  const deltaText =
    delta === null
      ? null
      : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${deltaMode === "points" ? `${Math.abs(Math.round(delta))} pts` : deltaMode === "absolute" ? `${Math.abs(Math.round(delta * 10) / 10)}${unit}` : `${Math.abs(delta) >= 10 ? Math.round(Math.abs(delta)) : Math.abs(delta).toFixed(1)}%`}`;
  return (
    <div className={`rounded-2xl border border-line/10 bg-surface p-4 min-w-0 ${className}`}>
      <div className="text-[12.5px] text-ink-soft truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-[28px] font-semibold leading-none">{format(value)}</span>
        {value !== null && unit && <span className="text-[14px] font-semibold text-ink-soft">{unit}</span>}
      </div>
      <div className="mt-2 min-h-[20px] flex items-center gap-1.5 flex-wrap">
        {deltaText && (
          <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 h-5 text-[11.5px] font-bold ${tone}`}>
            {delta! !== 0 && (
              <svg viewBox="0 0 10 10" className={`w-2.5 h-2.5 ${delta! < 0 ? "rotate-180" : ""}`} aria-hidden>
                <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
              </svg>
            )}
            {deltaText}
          </span>
        )}
        {compare && prev !== null && prev !== undefined && <span className="text-[11.5px] text-ink-faint">vs {format(prev)}{prev !== null && unit ? unit : ""}</span>}
        {hint && <span className="text-[11.5px] text-ink-faint">{hint}</span>}
      </div>
    </div>
  );
}

/** A card around a chart: title (what's plotted), optional legend/actions, then the chart. */
export function ChartCard({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0 ${className}`}>
      {/* The title keeps at least ~13rem; when the controls don't fit beside it, they drop below (phones). */}
      <div className="flex items-start gap-x-3 gap-y-2.5 mb-3 flex-wrap">
        <div className="flex-1 basis-52 min-w-0">
          <h2 className="text-[14.5px] font-semibold">{title}</h2>
          {sub && <p className="text-[12px] text-ink-faint mt-0.5">{sub}</p>}
        </div>
        {right && <div className="max-w-full min-w-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** The cards in one row; when they don't all fit, the row scrolls and arrows at its ends say there's more. */
export function CardStrip({ children, label = "Number on the chart" }: { children: React.ReactNode; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ left: false, right: false });
  const look = useCallback(() => {
    const el = box.current;
    if (!el) return;
    setEnds({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    look();
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(look);
    ro.observe(el);
    return () => ro.disconnect();
  }, [look]);
  const nudge = (d: number) => box.current?.scrollBy({ left: d * Math.max(160, (box.current?.clientWidth ?? 400) * 0.6), behavior: "smooth" });
  return (
    <div className="relative border-b border-line/10">
      <div ref={box} role="tablist" aria-label={label} onScroll={look} className="flex overflow-x-auto no-scrollbar">
        {children}
      </div>
      {ends.left && (
        <button type="button" onClick={() => nudge(-1)} aria-label="The cards before" className="absolute left-0 inset-y-0 w-9 flex items-center justify-start pl-1 bg-gradient-to-r from-surface via-surface/90 to-transparent text-ink-soft hover:text-ink">
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
      )}
      {ends.right && (
        <button type="button" onClick={() => nudge(1)} aria-label="More cards" className="absolute right-0 inset-y-0 w-9 flex items-center justify-end pr-1 bg-gradient-to-l from-surface via-surface/90 to-transparent text-ink-soft hover:text-ink">
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
