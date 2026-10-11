"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Audience retention: the share of viewers still watching at each point of
 * a video (0% → 100% of its length). Lines at even steps; a 100% line marks
 * "everyone" (Shorts can go above it when people rewatch). Hover or arrow
 * keys for the numbers at a point.
 */

export type CurveSeries = { key: string; label: string; color: string; values: (number | null)[] };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
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

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

export function RetentionChart({ series, height = 240, ariaLabel, duration }: { series: CurveSeries[]; height?: number; ariaLabel: string; duration?: number | null }) {
  const [box, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const peak = Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const top = Math.ceil(peak * 4) / 4;
  const left = 40;
  const right = 12;
  const padTop = 10;
  const bottom = 26;
  const iw = Math.max(10, width - left - right);
  const ih = height - padTop - bottom;
  const x = (i: number) => left + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => padTop + ih - (v / top) * ih;
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
  const ticks: number[] = [];
  for (let t = 0; t <= top + 0.001; t += top > 1.5 ? 0.5 : 0.25) ticks.push(Math.round(t * 100) / 100);
  const at = (clientX: number, el: SVGElement) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left - left) / iw) * (n - 1))));
  };
  const posLabel = (i: number) => {
    const p = n <= 1 ? 0 : i / (n - 1);
    const sec = duration ? Math.round(p * duration) : null;
    return `${Math.round(p * 100)}% in${sec !== null ? ` · ${sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`}` : ""}`;
  };
  return (
    <div ref={box} className="relative select-none">
      {width > 0 && n > 1 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-lg"
          onPointerMove={(e) => setHover(at(e.clientX, e.currentTarget))}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover((h) => h ?? 0)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? 0) - 1));
            if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={left + iw} y1={y(t)} y2={y(t)} stroke={t === 1 ? "rgb(var(--line) / 0.22)" : "rgb(var(--line) / 0.08)"} strokeDasharray={t === 1 ? "3 3" : undefined} strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-faint text-[10.5px] tabular-nums">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <text key={p} x={left + p * iw} y={height - 8} textAnchor={p === 0 ? "start" : p === 1 ? "end" : "middle"} className="fill-ink-faint text-[10.5px]">
              {Math.round(p * 100)}%
            </text>
          ))}
          {series.map((s) => (
            <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padTop} y2={padTop + ih} stroke="rgb(var(--line) / 0.25)" strokeWidth={1} />
              {series.map((s) => (s.values[hover] !== null && s.values[hover] !== undefined ? <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="rgb(var(--surface))" strokeWidth={2} /> : null))}
            </g>
          )}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] rounded-xl border border-line/15 bg-surface shadow-xl px-3 py-2 text-[12px]"
          style={{ left: x(hover) > width - 190 ? Math.max(0, x(hover) - 180) : x(hover) + 12, top: padTop }}
        >
          <div className="text-[11px] font-semibold text-ink-faint mb-1">{posLabel(hover)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 py-0.5">
              <span className="w-3 h-[2px] rounded-[1px] flex-shrink-0" style={{ background: s.color }} />
              <span className="font-bold tabular-nums text-ink">{pct(s.values[hover] ?? null)}</span>
              <span className="text-ink-soft truncate">{s.label}</span>
            </div>
          ))}
          <div className="mt-1 pt-1 border-t border-line/10 text-[10.5px] text-ink-faint">still watching</div>
        </div>
      )}
    </div>
  );
}

/** A tiny curve for a table row (no axes). */
export function MiniCurve({ values, color = "rgb(var(--amber))", width = 64, height = 22 }: { values: (number | null)[]; color?: string; width?: number; height?: number }) {
  const n = values.length;
  const peak = Math.max(1, ...values.filter((v): v is number => v !== null));
  if (n < 2) return null;
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    const px = (i / (n - 1)) * (width - 2) + 1;
    const py = height - 1 - (v / peak) * (height - 2);
    d += `${pen ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`;
    pen = true;
  });
  return (
    <svg width={width} height={height} aria-hidden className="block">
      <line x1={1} x2={width - 1} y1={height - 1 - (1 / peak) * (height - 2)} y2={height - 1 - (1 / peak) * (height - 2)} stroke="rgb(var(--line) / 0.18)" strokeDasharray="2 2" strokeWidth={1} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
