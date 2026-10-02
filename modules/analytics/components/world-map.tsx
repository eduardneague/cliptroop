"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NUMERIC_TO_ALPHA2 } from "../lib/iso-countries";

/*
 * World map of a number per country (views, followers…), drawn in SVG with
 * the Equal Earth projection. The country shapes (Natural Earth, public
 * domain, via the world-atlas package) load once from the jsDelivr CDN in
 * the browser; if that fails the list beside the map still has every number.
 * Colour: one hue (amber), lighter → darker in 5 steps (more = darker).
 */

const MAP_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type Geometry = { type: "Polygon" | "MultiPolygon"; id?: string | number; arcs: number[][] | number[][][] };
type Topology = {
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: { countries: { geometries: Geometry[] } };
};
type Shape = { code: string | null; d: string };

let shapesPromise: Promise<{ shapes: Shape[]; w: number; h: number }> | null = null;

// Equal Earth (Šavrič, Patterson, Jenny 2018).
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
function project(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180;
  const p = Math.asin(M * Math.sin((lat * Math.PI) / 180));
  const p2 = p * p;
  const p6 = p2 * p2 * p2;
  return [(l * Math.cos(p)) / (M * (A1 + 3 * A2 * p2 + p6 * (7 * A3 + 9 * A4 * p2))), -(p * (A1 + A2 * p2 + p6 * (A3 + A4 * p2)))];
}

function loadShapes() {
  shapesPromise ??= fetch(MAP_URL)
    .then((r) => {
      if (!r.ok) throw new Error("map");
      return r.json() as Promise<Topology>;
    })
    .then((t) => {
      const [sx, sy] = t.transform?.scale ?? [1, 1];
      const [tx, ty] = t.transform?.translate ?? [0, 0];
      const arcs = t.arcs.map((arc) => {
        let x = 0;
        let y = 0;
        return arc.map(([dx, dy]) => {
          if (t.transform) {
            x += dx;
            y += dy;
            return project(x * sx + tx, y * sy + ty);
          }
          return project(dx, dy);
        });
      });
      const ring = (idx: number[]) => {
        const pts: [number, number][] = [];
        idx.forEach((i, k) => {
          const a = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
          pts.push(...(k ? a.slice(1) : a));
        });
        return pts;
      };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const raw = t.objects.countries.geometries
        .filter((g) => (g.type === "Polygon" || g.type === "MultiPolygon") && Array.isArray(g.arcs))
        .filter((g) => String(g.id) !== "010") // Antarctica: nobody watches from there
        .map((g) => {
          const polys = (g.type === "Polygon" ? [g.arcs] : g.arcs) as number[][][];
          const rings = polys.flatMap((poly) => poly.map(ring));
          for (const r of rings)
            for (const [x, y] of r) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          const id = g.id === undefined ? null : String(g.id).padStart(3, "0");
          return { code: id ? NUMERIC_TO_ALPHA2[id] ?? null : null, rings };
        });
      const W = 1000;
      const k = W / (maxX - minX);
      const H = Math.round((maxY - minY) * k);
      const shapes = raw.map((s) => ({
        code: s.code,
        d: s.rings.map((r) => "M" + r.map(([x, y]) => `${((x - minX) * k).toFixed(1)},${((y - minY) * k).toFixed(1)}`).join("L") + "Z").join(""),
      }));
      return { shapes, w: W, h: H };
    })
    .catch((e) => {
      shapesPromise = null;
      throw e;
    });
  return shapesPromise;
}

const STEPS = [0.16, 0.32, 0.5, 0.72, 1];

export function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function WorldMap({ data, format, label }: { data: { code: string; value: number }[]; format: (n: number) => string; label: string }) {
  const [map, setMap] = useState<{ shapes: Shape[]; w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    loadShapes()
      .then((m) => alive && setMap(m))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const values = useMemo(() => new Map(data.map((d) => [d.code, d.value])), [data]);
  const total = useMemo(() => data.reduce((a, d) => a + d.value, 0), [data]);
  // 5 steps by quantile, so a few huge countries don't wash out the rest.
  const cuts = useMemo(() => {
    const vs = data.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
    if (!vs.length) return [];
    return [0.2, 0.4, 0.6, 0.8].map((q) => vs[Math.min(vs.length - 1, Math.floor(q * vs.length))]);
  }, [data]);
  const step = (v: number) => cuts.filter((c) => v > c).length;

  if (failed) return <p className="text-[12.5px] text-ink-faint py-6 text-center">The map couldn&rsquo;t load. Every country is in the list.</p>;
  if (!map) return <div className="skeleton rounded-xl w-full aspect-[2.1/1]" aria-hidden />;
  return (
    <div ref={box} className="relative">
      <svg viewBox={`0 0 ${map.w} ${map.h}`} className="w-full h-auto block" role="img" aria-label={label}>
        {map.shapes.map((s, i) => {
          const v = s.code ? values.get(s.code) ?? 0 : 0;
          const on = hover?.code === s.code && !!s.code;
          return (
            <path
              key={i}
              d={s.d}
              fill={v > 0 ? `rgb(var(--amber) / ${STEPS[step(v)]})` : "rgb(var(--line) / 0.08)"}
              stroke={on ? "rgb(var(--ink))" : "rgb(var(--surface))"}
              strokeWidth={on ? 1.6 : 0.6}
              onPointerMove={(e) => {
                if (!s.code) return;
                const r = box.current!.getBoundingClientRect();
                setHover({ code: s.code, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
              onPointerLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 rounded-xl border border-line/15 bg-surface shadow-xl px-3 py-2 text-[12px]" style={{ left: Math.min(hover.x + 12, (box.current?.clientWidth ?? 300) - 170), top: hover.y + 12 }}>
          <div className="font-semibold text-ink">{countryName(hover.code)}</div>
          <div className="text-ink-soft">
            <b className="text-ink tabular-nums">{format(values.get(hover.code) ?? 0)}</b>
            {total > 0 && ` · ${(((values.get(hover.code) ?? 0) / total) * 100).toFixed(1)}%`}
          </div>
        </div>
      )}
      {cuts.length > 0 && (
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
