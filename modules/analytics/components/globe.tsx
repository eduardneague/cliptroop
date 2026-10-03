"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GLOBE as GlobeData } from "../lib/world-globe";
import { countryName } from "./world-map";

/*
 * A 3D globe of a number per country (views, followers…): drag to spin it,
 * it turns slowly on its own (not with "reduce motion"), hover a country for
 * its numbers. Drawn on a canvas with an orthographic projection — the far
 * side shows faintly through the sea. Same colours as the flat map: one hue,
 * 5 steps by quantile. Outlines ship with the app (lib/world-globe.ts), loaded
 * as their own chunk the first time a globe shows. No libraries, no gradients.
 */

type Country = { c: string | null; rings: Ring[]; center: [number, number] };
type Ring = { sl: Float32Array; cl: Float32Array; sp: Float32Array; cp: Float32Array; hole: boolean };

const RAD = Math.PI / 180;
const STEPS = [0.18, 0.34, 0.52, 0.74, 1];

let worldPromise: Promise<Country[]> | null = null;
function loadGlobe() {
  worldPromise ??= import("../lib/world-globe")
    .then((m) => decode(m.GLOBE))
    .catch((e) => {
      worldPromise = null;
      throw e;
    });
  return worldPromise;
}

/** "dx,dy,…" rings → sin/cos tables, with long edges split so they curve with the sphere. */
function decode(data: typeof GlobeData): Country[] {
  return data.map(({ c, g }) => {
    let best: { len: number; x: number; y: number; z: number } = { len: 0, x: 0, y: 0, z: 1 };
    const rings: Ring[] = [];
    for (const poly of g.split("|")) {
      poly.split(";").forEach((ringStr, ri) => {
        const nums = ringStr.split(",").map(Number);
        const pts: [number, number][] = [];
        let x = 0;
        let y = 0;
        for (let i = 0; i < nums.length; i += 2) {
          x += nums[i];
          y += nums[i + 1];
          const lon = x / 10;
          const lat = y / 10;
          const prev = pts[pts.length - 1];
          if (prev) {
            let dl = lon - prev[0];
            if (dl > 180) dl -= 360;
            if (dl < -180) dl += 360;
            const steps = Math.ceil(Math.max(Math.abs(dl), Math.abs(lat - prev[1])) / 2);
            for (let s = 1; s < steps; s++) pts.push([prev[0] + (dl * s) / steps, prev[1] + ((lat - prev[1]) * s) / steps]);
          }
          pts.push([lon, lat]);
        }
        const n = pts.length;
        const ring: Ring = { sl: new Float32Array(n), cl: new Float32Array(n), sp: new Float32Array(n), cp: new Float32Array(n), hole: ri > 0 };
        let vx = 0;
        let vy = 0;
        let vz = 0;
        pts.forEach(([lon, lat], i) => {
          ring.sl[i] = Math.sin(lon * RAD);
          ring.cl[i] = Math.cos(lon * RAD);
          ring.sp[i] = Math.sin(lat * RAD);
          ring.cp[i] = Math.cos(lat * RAD);
          vx += ring.cp[i] * ring.cl[i];
          vy += ring.cp[i] * ring.sl[i];
          vz += ring.sp[i];
        });
        rings.push(ring);
        if (ri === 0 && n > best.len) best = { len: n, x: vx, y: vy, z: vz };
      });
    }
    const center: [number, number] = [Math.atan2(best.y, best.x) / RAD, Math.atan2(best.z, Math.hypot(best.x, best.y)) / RAD];
    return { c, rings, center };
  });
}

/** Graticule: meridians every 30°, parallels every 30°, as sin/cos rings (open lines). */
const GRATICULE: Ring[] = (() => {
  const line = (pts: [number, number][]): Ring => ({
    sl: Float32Array.from(pts, (p) => Math.sin(p[0] * RAD)),
    cl: Float32Array.from(pts, (p) => Math.cos(p[0] * RAD)),
    sp: Float32Array.from(pts, (p) => Math.sin(p[1] * RAD)),
    cp: Float32Array.from(pts, (p) => Math.cos(p[1] * RAD)),
    hole: false,
  });
  const out: Ring[] = [];
  for (let lon = -180; lon < 180; lon += 30) out.push(line(Array.from({ length: 41 }, (_, i) => [lon, -80 + i * 4] as [number, number])));
  for (const lat of [-60, -30, 0, 30, 60]) out.push(line(Array.from({ length: 91 }, (_, i) => [-180 + i * 4, lat] as [number, number])));
  return out;
})();

type View = { lon: number; lat: number };
const cssColor = (styles: CSSStyleDeclaration, name: string, alpha = 1) => `rgb(${styles.getPropertyValue(name).trim() || "128 128 128"} / ${alpha})`;
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export function Globe({
  data,
  format,
  label,
  empty,
  compact = false,
  tooltip,
  focus = null,
  maxSize = 460,
  onHover,
}: {
  data: { code: string; value: number }[];
  format: (n: number) => string;
  label: string;
  /** Shown over the globe while there are no numbers yet. */
  empty?: string;
  /** Small version (dashboard widget): no legend. */
  compact?: boolean;
  /** Richer hover card (e.g. every platform for that country). */
  tooltip?: (code: string) => React.ReactNode;
  /** Turn to this country (hovering the list beside it). */
  focus?: string | null;
  maxSize?: number;
  onHover?: (code: string | null) => void;
}) {
  const [world, setWorld] = useState<Country[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState(0);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ lon: 15, lat: 25 });
  const paths = useRef<{ c: string | null; path: Path2D }[]>([]);
  const anim = useRef<{ from: View; to: View; start: number } | null>(null);
  const drag = useRef<{ x: number; y: number; t: number; vx: number; vy: number; x0: number; y0: number } | null>(null);
  const spin = useRef({ velocity: 0, pausedUntil: 0, inView: true, hovering: false });
  const hoverCode = useRef<string | null>(null);
  // Zoom: 1 = the whole globe, up to 6× (scroll wheel, the +/− buttons, or + and − keys).
  const zoom = useRef({ now: 1, target: 1 });
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGlobe()
      .then((w) => alive && setWorld(w))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // The globe is as wide as its box allows (square), up to maxSize.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize(Math.max(120, Math.min(maxSize, el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxSize]);

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
  const noData = !data.some((d) => d.value > 0);

  const draw = useCallback(() => {
    const cv = canvas.current;
    if (!cv || !world || !size) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(size * dpr)) {
      cv.width = Math.round(size * dpr);
      cv.height = Math.round(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const st = getComputedStyle(cv);
    const cx = size / 2;
    const cy = size / 2;
    const R = (size / 2 - 8) * zoom.current.now;
    const { lon, lat } = view.current;
    const cl0 = Math.cos(lon * RAD);
    const sl0 = Math.sin(lon * RAD);
    const cp0 = Math.cos(lat * RAD);
    const sp0 = Math.sin(lat * RAD);

    // Project a ring once: screen x/y and depth z (z > 0 faces us).
    const project = (r: Ring) => {
      const n = r.sl.length;
      const X = new Float32Array(n);
      const Y = new Float32Array(n);
      const Z = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const cosdl = r.cl[i] * cl0 + r.sl[i] * sl0;
        const sindl = r.sl[i] * cl0 - r.cl[i] * sl0;
        X[i] = r.cp[i] * sindl;
        Y[i] = cp0 * r.sp[i] - sp0 * r.cp[i] * cosdl;
        Z[i] = sp0 * r.sp[i] + cp0 * r.cp[i] * cosdl;
      }
      return { X, Y, Z, n };
    };
    // One side of a closed ring, cut at the horizon; the hidden part runs along the rim.
    const trace = (path: Path2D, r: Ring, side: 1 | -1) => {
      const { X, Y, Z, n } = project(r);
      let start = -1;
      for (let i = 0; i < n; i++) if (side * Z[i] > 0) { start = i; break; }
      if (start < 0) return false;
      const P = (i: number) => [cx + R * X[i], cy - R * Y[i]] as const;
      const rim = (x: number, y: number) => {
        const l = Math.hypot(x, y) || 1;
        return Math.atan2(-y / l, x / l);
      };
      path.moveTo(...P(start));
      let exit = 0;
      for (let k = 1; k <= n; k++) {
        const i = (start + k) % n;
        const p = (start + k - 1) % n;
        const vp = side * Z[p] > 0;
        const vi = side * Z[i] > 0;
        if (vp && vi) path.lineTo(...P(i));
        else if (vp !== vi) {
          const t = Z[p] / (Z[p] - Z[i]);
          const a = rim(X[p] + (X[i] - X[p]) * t, Y[p] + (Y[i] - Y[p]) * t);
          if (vp) {
            path.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
            exit = a;
          } else {
            let d = a - exit;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            path.arc(cx, cy, R, exit, a, d < 0);
            path.lineTo(...P(i));
          }
        }
      }
      path.closePath();
      return true;
    };

    // Sea, then the far side faintly (as if the globe were glass), the grid, then the near side.
    if (zoom.current.now < 1.05) {
      ctx.beginPath();
      ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
      ctx.lineWidth = 5;
      ctx.strokeStyle = cssColor(st, "--amber", 0.1);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = cssColor(st, "--surface-2");
    ctx.fill();

    const back = new Path2D();
    for (const c of world) for (const r of c.rings) trace(back, r, -1);
    ctx.fillStyle = cssColor(st, "--ink", 0.05);
    ctx.fill(back, "evenodd");

    ctx.lineWidth = 0.6;
    ctx.strokeStyle = cssColor(st, "--line", 0.16);
    ctx.beginPath();
    for (const g of GRATICULE) {
      const { X, Y, Z, n } = project(g);
      let on = false;
      for (let i = 0; i < n; i++) {
        if (Z[i] > 0) {
          const x = cx + R * X[i];
          const y = cy - R * Y[i];
          if (on) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          on = true;
        } else on = false;
      }
    }
    ctx.stroke();

    const step = (v: number) => cuts.filter((c) => v > c).length;
    const list: { c: string | null; path: Path2D }[] = [];
    const none = cssColor(st, "--ink", 0.1);
    const border = cssColor(st, "--surface");
    ctx.lineWidth = 0.6;
    ctx.lineJoin = "round";
    for (const c of world) {
      const path = new Path2D();
      let any = false;
      for (const r of c.rings) if (trace(path, r, 1)) any = true;
      if (!any) continue;
      const v = c.c ? values.get(c.c) ?? 0 : 0;
      ctx.fillStyle = v > 0 ? cssColor(st, "--amber", STEPS[step(v)]) : none;
      ctx.fill(path, "evenodd");
      ctx.strokeStyle = border;
      ctx.stroke(path);
      list.push({ c: c.c, path });
    }
    paths.current = list;
    const h = hoverCode.current ? list.find((x) => x.c === hoverCode.current) : null;
    if (h) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = cssColor(st, "--ink");
      ctx.stroke(h.path);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = cssColor(st, "--line", 0.28);
    ctx.stroke();
  }, [world, size, values, cuts]);

  // The animation loop: auto-spin, coasting after a drag, turning to a country.
  useEffect(() => {
    if (!world || !size) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const s = spin.current;
      const a = anim.current;
      let moved = false;
      const z = zoom.current;
      if (Math.abs(z.target - z.now) > 0.001) {
        z.now = reduce ? z.target : z.now + (z.target - z.now) * Math.min(1, dt / 90);
        if (Math.abs(z.target - z.now) <= 0.001) z.now = z.target;
        moved = true;
      }
      if (a) {
        const t = Math.min(1, (now - a.start) / 700);
        const e = 1 - Math.pow(1 - t, 3);
        view.current = { lon: a.from.lon + wrap(a.to.lon - a.from.lon) * e, lat: a.from.lat + (a.to.lat - a.from.lat) * e };
        if (t >= 1) anim.current = null;
        moved = true;
      } else if (!drag.current && Math.abs(s.velocity) > 0.002) {
        view.current = { ...view.current, lon: wrap(view.current.lon + s.velocity * dt) };
        s.velocity *= Math.pow(0.94, dt / 16);
        moved = true;
      } else if (!drag.current && !reduce && !s.hovering && now > s.pausedUntil && s.inView && !document.hidden) {
        view.current = { ...view.current, lon: wrap(view.current.lon - (0.006 * dt) / zoom.current.now) };
        moved = true;
      }
      if (moved || drag.current) draw();
      raf = requestAnimationFrame(tick);
    };
    draw();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [world, size, draw]);

  // Pause when scrolled away; redraw when the theme changes.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (spin.current.inView = e.isIntersecting));
    io.observe(el);
    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-palette"] });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [draw]);

  // Turn to a country when asked (hovering it in the list).
  useEffect(() => {
    if (!focus) {
      hoverCode.current = null;
      draw();
      return;
    }
    if (!world) return;
    const c = world.find((x) => x.c === focus);
    if (!c) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const to = { lon: c.center[0], lat: Math.max(-60, Math.min(60, c.center[1])) };
    spin.current.pausedUntil = performance.now() + 4000;
    hoverCode.current = focus;
    if (reduce) {
      view.current = to;
      draw();
    } else anim.current = { from: { ...view.current }, to, start: performance.now() };
  }, [focus, world, draw]);

  const ZOOM_MAX = 6;
  const zoomBy = useCallback((factor: number, at?: { x: number; y: number }) => {
    const z = zoom.current;
    const next = Math.max(1, Math.min(ZOOM_MAX, z.target * factor));
    if (next === z.target) return false;
    // Zooming in towards a point turns the globe a little towards it.
    if (at && factor > 1 && size) {
      const R = (size / 2 - 8) * z.now;
      const x = (at.x - size / 2) / R;
      const y = -(at.y - size / 2) / R;
      if (x * x + y * y < 1) {
        const zz = Math.sqrt(1 - x * x - y * y);
        const { lon, lat } = view.current;
        const cp0 = Math.cos(lat * RAD);
        const sp0 = Math.sin(lat * RAD);
        const tLat = Math.asin(Math.max(-1, Math.min(1, y * cp0 + zz * sp0))) / RAD;
        const tLon = lon + Math.atan2(x, zz * cp0 - y * sp0) / RAD;
        view.current = { lon: wrap(lon + wrap(tLon - lon) * 0.25), lat: Math.max(-70, Math.min(70, lat + (tLat - lat) * 0.25)) };
      }
    }
    z.target = next;
    spin.current.pausedUntil = performance.now() + 4000;
    setZoomed(next > 1.01);
    return true;
  }, [size]);

  // The scroll wheel zooms (a native listener: React's wheel events can't stop the page scrolling).
  // At the most zoomed-out (or in) it lets the page scroll as usual.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey && Math.abs(e.deltaY) < 1) return;
      const z = zoom.current;
      const zoomingIn = e.deltaY < 0;
      if ((zoomingIn && z.target >= ZOOM_MAX) || (!zoomingIn && z.target <= 1)) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const step = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.06 : 0.0022));
      zoomBy(step, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [zoomBy, world, size]);

  const pick = (e: React.PointerEvent) => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return null;
    const r = cv.getBoundingClientRect();
    const dpr = cv.width / r.width;
    const x = (e.clientX - r.left) * dpr;
    const y = (e.clientY - r.top) * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = paths.current.length - 1; i >= 0; i--) if (paths.current[i].c && ctx.isPointInPath(paths.current[i].path, x, y, "evenodd")) return paths.current[i].c;
    return null;
  };

  if (failed) return <p className="text-[12.5px] text-ink-faint py-6 text-center">The globe couldn&rsquo;t load. Every country is in the list.</p>;
  return (
    <div className="relative w-full">
      <div ref={box} className="relative w-full flex justify-center">
        {!world || !size ? (
          <div className="skeleton rounded-full aspect-square" style={{ width: size || 220 }} aria-hidden />
        ) : (
          <div className="relative" style={{ width: size, height: size }}>
          <canvas
            ref={canvas}
            role="img"
            aria-label={`${label}. Drag to turn the globe; scroll or press + and − to zoom.`}
            tabIndex={0}
            style={{ width: size, height: size, touchAction: "pan-y" }}
            className="block rounded-full cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), vx: 0, vy: 0, x0: e.clientX, y0: e.clientY };
              anim.current = null;
              setHover(null);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d) {
                const R = (size / 2 - 8) * zoom.current.now;
                const dx = e.clientX - d.x;
                const dy = e.clientY - d.y;
                const now = performance.now();
                const k = 1 / R / RAD;
                view.current = { lon: wrap(view.current.lon - dx * k), lat: Math.max(-70, Math.min(70, view.current.lat + dy * k)) };
                d.vx = (-dx * k) / Math.max(1, now - d.t);
                d.x = e.clientX;
                d.y = e.clientY;
                d.t = now;
                return;
              }
              const code = pick(e);
              const prev = hoverCode.current;
              hoverCode.current = code;
              if (code !== prev) {
                onHover?.(code);
                draw();
              }
              if (!code || noData) return setHover(null);
              const r = box.current!.getBoundingClientRect();
              setHover({ code, x: e.clientX - r.left, y: e.clientY - r.top });
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              if (!d) return;
              spin.current.velocity = performance.now() - d.t < 80 ? d.vx : 0;
              spin.current.pausedUntil = performance.now() + 2500;
              // A tap (phones have no hover): show that country's numbers.
              if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) {
                const code = pick(e);
                hoverCode.current = code;
                onHover?.(code);
                draw();
                if (!code || noData) return setHover(null);
                const r = box.current!.getBoundingClientRect();
                setHover({ code, x: e.clientX - r.left, y: e.clientY - r.top });
                spin.current.pausedUntil = performance.now() + 6000;
              }
            }}
            onPointerCancel={() => (drag.current = null)}
            onPointerEnter={() => (spin.current.hovering = true)}
            onPointerLeave={() => {
              spin.current.hovering = false;
              hoverCode.current = null;
              onHover?.(null);
              setHover(null);
              draw();
            }}
            onKeyDown={(e) => {
              if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") {
                e.preventDefault();
                zoomBy(e.key === "+" || e.key === "=" ? 1.5 : 1 / 1.5);
                return;
              }
              const k = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] }[e.key];
              if (!k) return;
              e.preventDefault();
              spin.current.pausedUntil = performance.now() + 4000;
              anim.current = { from: { ...view.current }, to: { lon: wrap(view.current.lon + k[0]), lat: Math.max(-70, Math.min(70, view.current.lat + k[1])) }, start: performance.now() };
            }}
          />
          {/* Zoom (phones have no wheel): +, −, and back to the whole globe. */}
          <div className={`absolute ${compact ? "right-0 bottom-0" : "right-1 bottom-1"} flex flex-col gap-1`}>
            {[
              { label: "Zoom in", text: "+", run: () => zoomBy(1.6) },
              { label: "Zoom out", text: "−", run: () => zoomBy(1 / 1.6) },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                aria-label={b.label}
                title={`${b.label} (or scroll)`}
                onClick={b.run}
                className={`${compact ? "w-6 h-6 text-[14px]" : "w-8 h-8 text-[17px]"} rounded-lg border border-line/20 bg-surface/95 text-ink font-semibold leading-none shadow-sm hover:bg-surface-2 flex items-center justify-center`}
              >
                {b.text}
              </button>
            ))}
            {zoomed && (
              <button
                type="button"
                aria-label="Whole globe"
                title="Whole globe"
                onClick={() => zoomBy(1 / ZOOM_MAX)}
                className={`${compact ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[10px]"} rounded-lg border border-line/20 bg-surface/95 text-ink-soft font-bold shadow-sm hover:bg-surface-2 hover:text-ink flex items-center justify-center`}
              >
                1×
              </button>
            )}
          </div>
          </div>
        )}
        {noData && empty && world && (
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
            <p className="rounded-xl border border-line/15 bg-surface px-4 py-2.5 text-[12.5px] text-ink-soft text-center max-w-xs shadow-sm">{empty}</p>
          </div>
        )}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-xl border border-line/15 bg-surface shadow-xl px-3 py-2 text-[12px] whitespace-nowrap"
            style={{ left: Math.max(0, Math.min(hover.x + 14, (box.current?.clientWidth ?? 300) - (tooltip ? 262 : 180))), top: hover.y + 14 }}
          >
            <div className="font-semibold text-ink">{countryName(hover.code)}</div>
            {tooltip ? (
              tooltip(hover.code)
            ) : (
              <div className="text-ink-soft">
                <b className="text-ink tabular-nums">{format(values.get(hover.code) ?? 0)}</b>
                {total > 0 && ` · ${(((values.get(hover.code) ?? 0) / total) * 100).toFixed(1)}%`}
              </div>
            )}
          </div>
        )}
      </div>
      {!compact && cuts.length > 0 && (
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-ink-faint">
          <span>Fewer</span>
          <span className="flex gap-0.5" aria-hidden>
            {STEPS.map((o) => (
              <span key={o} className="w-6 h-2.5 rounded-[3px]" style={{ background: `rgb(var(--amber) / ${o})` }} />
            ))}
          </span>
          <span>More</span>
          <span className="hidden sm:inline">· drag to turn, scroll to zoom</span>
        </div>
      )}
    </div>
  );
}
