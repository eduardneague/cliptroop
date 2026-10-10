"use client";

import { useEffect, useRef } from "react";
import { motionReduced } from "./count-up";

/*
 * Confetti, drawn on one full-screen canvas (no library). Mounted once in the
 * app shell (<ConfettiHost />); anything fires it with confetti() or the big
 * celebration with cheer(). Pieces are paper rectangles, ribbons, circles and
 * little stars that tumble (they flip as they turn), drift with the air and
 * fall. Nothing is drawn when animations are off (Settings or the device),
 * and the canvas only exists while pieces are flying.
 */

const EVENT = "vp:confetti";
export const CONFETTI_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6", "#e34948", "#f5c542"];

export type ConfettiBurst = {
  /** Where it starts, as a share of the screen (0 to 1). Default: the middle, a little up. */
  x?: number;
  y?: number;
  /** Direction in degrees (-90 = straight up) and how wide the spray is. */
  angle?: number;
  spread?: number;
  count?: number;
  /** Starting speed in px a second. */
  speed?: number;
  colors?: string[];
  /** Fall from the top edge instead (a gentle shower for `duration` ms). */
  rain?: boolean;
  duration?: number;
};

/** Throws a burst (or a shower) of confetti. Safe to call anywhere; does nothing on the server. */
export function confetti(burst: ConfettiBurst = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ConfettiBurst>(EVENT, { detail: burst }));
}

/** The big one: two cannons from the bottom corners, a pop in the middle, then a shower. */
export function cheer(colors?: string[]) {
  const c = colors?.length ? [...colors, ...CONFETTI_COLORS.slice(0, 5)] : CONFETTI_COLORS;
  confetti({ x: 0.02, y: 1, angle: -62, spread: 34, count: 110, speed: 1550, colors: c });
  confetti({ x: 0.98, y: 1, angle: -118, spread: 34, count: 110, speed: 1550, colors: c });
  setTimeout(() => confetti({ x: 0.5, y: 0.34, angle: -90, spread: 360, count: 90, speed: 720, colors: c }), 260);
  setTimeout(() => confetti({ rain: true, count: 120, duration: 2200, colors: c }), 650);
}

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  shape: 0 | 1 | 2 | 3;
  rot: number;
  vr: number;
  flip: number;
  vf: number;
  wobble: number;
  vw: number;
  life: number;
  delay: number;
};

const GRAVITY = 1100; // px/s²
const DRAG = 1.25; // velocity lost per second (share)
const MAX = 700;

function makePieces(b: ConfettiBurst, W: number, H: number): Piece[] {
  const colors = b.colors?.length ? b.colors : CONFETTI_COLORS;
  const count = Math.min(MAX, Math.max(1, Math.round(b.count ?? 120)));
  const out: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const shape = (Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 2 : Math.random() < 0.7 ? 1 : 3) as Piece["shape"];
    const size = 6 + Math.random() * 6;
    const p: Piece = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      w: shape === 2 ? size * 0.45 : size,
      h: shape === 2 ? size * 2.1 : shape === 0 ? size * 0.62 : size,
      color: colors[i % colors.length],
      shape,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 12,
      flip: Math.random() * Math.PI * 2,
      vf: 5 + Math.random() * 9,
      wobble: Math.random() * Math.PI * 2,
      vw: 2 + Math.random() * 4,
      life: 0,
      delay: 0,
    };
    if (b.rain) {
      p.x = Math.random() * W;
      p.y = -20 - Math.random() * 60;
      p.vx = (Math.random() - 0.5) * 120;
      p.vy = 80 + Math.random() * 160;
      p.delay = Math.random() * ((b.duration ?? 2000) / 1000);
    } else {
      const angle = ((b.angle ?? -90) + (Math.random() - 0.5) * (b.spread ?? 70)) * (Math.PI / 180);
      const speed = (b.speed ?? 1100) * (0.45 + Math.random() * 0.75);
      p.x = (b.x ?? 0.5) * W + (Math.random() - 0.5) * 16;
      p.y = (b.y ?? 0.4) * H + (Math.random() - 0.5) * 16;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
    }
    out.push(p);
  }
  return out;
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** The one canvas. Put it once near the root of the app. */
export function ConfettiHost() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pieces = useRef<Piece[]>([]);
  const frame = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let dpr = 1;
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };

    const tick = (t: number) => {
      const dt = Math.min(0.035, (t - (last.current || t)) / 1000) || 0.016;
      last.current = t;
      const W = window.innerWidth;
      const H = window.innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const next: Piece[] = [];
      for (const p of pieces.current) {
        if (p.delay > 0) {
          p.delay -= dt;
          next.push(p);
          continue;
        }
        p.life += dt;
        p.vx -= p.vx * DRAG * dt;
        p.vy -= p.vy * DRAG * dt * (p.vy < 0 ? 1 : 0.55);
        p.vy += GRAVITY * dt * (p.vy > 260 ? 0.25 : 1);
        p.wobble += p.vw * dt;
        p.x += (p.vx + Math.sin(p.wobble) * 38) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
        if (p.y > H + 40 || p.x < -60 || p.x > W + 60 || p.life > 9) continue;
        const fade = p.life > 6 ? Math.max(0, 1 - (p.life - 6) / 3) : 1;
        // Tumbling paper: squash along one axis as it flips (its back a little see-through).
        const flip = Math.cos(p.flip);
        ctx.save();
        ctx.globalAlpha = fade * (flip < 0 ? 0.78 : 1);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.max(0.08, Math.abs(flip)));
        ctx.fillStyle = p.color;
        if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 3) {
          star(ctx, p.w * 0.62);
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
        next.push(p);
      }
      pieces.current = next;
      if (next.length) frame.current = requestAnimationFrame(tick);
      else {
        frame.current = 0;
        canvas.style.display = "none";
      }
    };

    const onBurst = (e: Event) => {
      if (motionReduced()) return;
      const b = (e as CustomEvent<ConfettiBurst>).detail ?? {};
      if (canvas.style.display === "none" || !pieces.current.length) size();
      canvas.style.display = "block";
      pieces.current = [...pieces.current, ...makePieces(b, window.innerWidth, window.innerHeight)].slice(-MAX);
      if (!frame.current) {
        last.current = 0;
        frame.current = requestAnimationFrame(tick);
      }
    };
    const onResize = () => {
      if (pieces.current.length) size();
    };
    window.addEventListener(EVENT, onBurst);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener(EVENT, onBurst);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="fixed inset-0 w-full h-full pointer-events-none z-[400]" style={{ display: "none" }} />;
}
