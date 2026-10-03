"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WORLD as WorldShapes } from "../lib/world-shapes";

/*
 * A heat map of a number per country (views, followers…). The country
 * shapes ship with the app (lib/world-shapes.ts: Natural Earth, already
 * projected), loaded as their own small chunk the first time a map shows,
 * so nothing is fetched from another website.
 * Colour: one hue (amber), lighter → darker in 5 steps (more = darker),
 * steps by quantile so one huge country doesn't wash out the rest.
 */

type World = typeof WorldShapes;
let worldPromise: Promise<World> | null = null;
function loadWorld() {
  worldPromise ??= import("../lib/world-shapes")
    .then((m) => m.WORLD)
    .catch((e) => {
      worldPromise = null;
      throw e;
    });
  return worldPromise;
}

const STEPS = [0.18, 0.34, 0.52, 0.74, 1];

let names: Intl.DisplayNames | null = null;
export function countryName(code: string) {
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export function WorldMap({
  data,
  format,
  label,
  empty,
  compact = false,
}: {
  data: { code: string; value: number }[];
  format: (n: number) => string;
  label: string;
  /** Shown over a grey map while there are no numbers yet. */
  empty?: string;
  /** Small version (dashboard widget): no legend. */
  compact?: boolean;
}) {
  const [world, setWorld] = useState<World | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    loadWorld()
      .then((m) => alive && setWorld(m))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const values = useMemo(() => new Map(data.map((d) => [d.code, d.value])), [data]);
  const total = useMemo(() => data.reduce((a, d) => a + d.value, 0), [data]);
  const cuts = useMemo(() => {
    const vs = data
      .map((d) => d.value)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    if (!vs.length) return [];
    return [0.2, 0.4, 0.6, 0.8].map((q) => vs[Math.min(vs.length - 1, Math.floor(q * vs.length))]);
  }, [data]);
  const step = (v: number) => cuts.filter((c) => v > c).length;
  const fill = (code: string | null) => {
    const v = code ? values.get(code) ?? 0 : 0;
    return v > 0 ? `rgb(var(--amber) / ${STEPS[step(v)]})` : "rgb(var(--line) / 0.09)";
  };

  if (failed) return <p className="text-[12.5px] text-ink-faint py-6 text-center">The map couldn&rsquo;t load. Every country is in the list.</p>;
  if (!world) return <div className="skeleton rounded-xl w-full aspect-[2.28/1]" aria-hidden />;
  const hovered = hover ? world.shapes.find((s) => s.c === hover.code) : null;
  const noData = !data.some((d) => d.value > 0);
  return (
    <div ref={box} className="relative" onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${world.w} ${world.h}`} className="w-full h-auto block" role="img" aria-label={label}>
        {world.shapes.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill={fill(s.c)}
            stroke="rgb(var(--surface))"
            strokeWidth={0.6}
            strokeLinejoin="round"
            onPointerMove={(e) => {
              if (!s.c || noData) return setHover(null);
              const r = box.current!.getBoundingClientRect();
              setHover({ code: s.c, x: e.clientX - r.left, y: e.clientY - r.top });
            }}
          />
        ))}
        {/* The hovered country on top, outlined, so its border isn't hidden by its neighbours. */}
        {hovered && <path d={hovered.d} fill={fill(hovered.c)} stroke="rgb(var(--ink))" strokeWidth={1.4} strokeLinejoin="round" pointerEvents="none" />}
      </svg>
      {noData && empty && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <p className="rounded-xl border border-line/15 bg-surface px-4 py-2.5 text-[12.5px] text-ink-soft text-center max-w-xs shadow-sm">{empty}</p>
        </div>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-line/15 bg-surface shadow-xl px-3 py-2 text-[12px] whitespace-nowrap"
          style={{ left: Math.max(0, Math.min(hover.x + 12, (box.current?.clientWidth ?? 300) - 170)), top: hover.y + 14 }}
        >
          <div className="font-semibold text-ink">{countryName(hover.code)}</div>
          <div className="text-ink-soft">
            <b className="text-ink tabular-nums">{format(values.get(hover.code) ?? 0)}</b>
            {total > 0 && ` · ${(((values.get(hover.code) ?? 0) / total) * 100).toFixed(1)}%`}
          </div>
        </div>
      )}
      {!compact && cuts.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-faint">
          <span>Fewer</span>
          <span className="flex gap-0.5" aria-hidden>
            {STEPS.map((o) => (
              <span key={o} className="w-6 h-2.5 rounded-[3px]" style={{ background: `rgb(var(--amber) / ${o})` }} />
            ))}
          </span>
          <span>More</span>
        </div>
      )}
    </div>
  );
}
