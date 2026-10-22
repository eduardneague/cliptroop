"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { MASCOT_NAME } from "@/lib/brand";
import { sounds } from "@/lib/sounds";

/*
 * Clip's runner (1.29.7): the secret behind seven quick taps on Clip in My
 * tasks' "All done for today!". Like the dinosaur game: Clip runs from a
 * runaway film reel. Jump (Space, ↑, a click or a tap; hold for a higher
 * jump) over coffee cups, film cans and tripods; jump over a low drone but
 * stay under a high one. It gets faster as it goes, a chime every 100
 * points, and your best stays on this device.
 *
 * One canvas, drawn only while the game moves (a still frame otherwise) and
 * stopped when the tab is hidden. This file loads only when the secret is
 * found (next/dynamic in tasks-widget.tsx), so the dashboard doesn't carry it.
 */

const BEST_KEY = "vp-clip-runner-best";
// Clip's own colours (components/ui/mascot.tsx): the same in light and dark.
const CLIP_INK = "#2B2118";
const CLIP_CREAM = "#FFF4E6";
const CLIP_AMBER = "#E8630D";

type Kind = "cup" | "can" | "tripod" | "droneLow" | "droneHigh";
/** An obstacle, in world units (the scene is 100 units tall): left edge, width, height, bottom above the ground. */
type Ob = { kind: Kind; x: number; w: number; h: number; y: number };
type Phase = "ready" | "run" | "over";

const SIZE: Record<Kind, { w: number; h: number; y: number }> = {
  cup: { w: 6, h: 8, y: 0 },
  can: { w: 10, h: 6, y: 0 },
  tripod: { w: 7, h: 15, y: 0 },
  // Low: jump over it. High: run under it (jumping hits it).
  droneLow: { w: 11, h: 5, y: 6 },
  droneHigh: { w: 11, h: 5, y: 17.5 },
};
const GROUND = 84;
const GRAVITY = 380;
const JUMP = 132;
const CLIP_W = 11;

const rgb = (v: string, a = 1) => {
  const p = v.trim().split(/[\s,]+/).filter(Boolean);
  return p.length >= 3 ? `rgb(${p[0]} ${p[1]} ${p[2]} / ${a})` : `rgb(120 120 120 / ${a})`;
};
const pad = (n: number) => String(Math.floor(n)).padStart(5, "0");

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export default function ClipRunner({ onClose }: { onClose: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<{ score: number; best: number; record: boolean } | null>(null);
  const controls = useRef<{ press: () => void; release: () => void }>({ press: () => {}, release: () => {} });

  useEffect(() => {
    const canvas = cv.current;
    const box = wrap.current;
    const ctx0 = canvas?.getContext("2d");
    if (!canvas || !box || !ctx0) return;
    const ctx: CanvasRenderingContext2D = ctx0;
    box.focus({ preventScroll: true });

    const css = getComputedStyle(document.documentElement);
    const col = {
      ink: rgb(css.getPropertyValue("--ink")),
      soft: rgb(css.getPropertyValue("--ink-soft")),
      faint: rgb(css.getPropertyValue("--ink-faint")),
      line: rgb(css.getPropertyValue("--line"), 0.35),
      cloud: rgb(css.getPropertyValue("--line"), 0.12),
      amber: rgb(css.getPropertyValue("--amber")),
      surface: rgb(css.getPropertyValue("--surface")),
    };
    const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

    let W = 300;
    let H = 160;
    let u = 1.6;
    let raf = 0;
    let last = 0;
    let phaseNow: Phase = "ready";
    // The game.
    let t = 0;
    let speed = 62;
    let score = 0;
    let flash = 0;
    let y = 0;
    let vy = 0;
    let holding = false;
    let obs: Ob[] = [];
    let toNext = 70;
    let groundOff = 0;
    let reelX = -3;
    let reelSpin = 0;
    let caught = 0;
    let best = readBest();
    const clouds = [0, 1, 2].map((k) => ({ x: 40 + k * 70, y: 14 + k * 9, s: 0.7 + k * 0.25 }));

    const worldW = () => W / u;
    const clipX = () => Math.max(20, worldW() * 0.2);

    const resize = () => {
      const r = box.getBoundingClientRect();
      W = Math.max(220, r.width);
      H = Math.max(140, r.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      u = H / 100;
      draw();
    };

    // ---- drawing (all in world units: x right, y down from the top) ----
    const P = (n: number) => n * u;
    // A rounded rectangle in pixels (a plain one where the browser has no roundRect).
    const box2 = (x: number, yy: number, w: number, h: number, r: number) => {
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, yy, w, h, r);
      else ctx.rect(x, yy, w, h);
    };
    const rr = (x: number, yy: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      box2(P(x), P(yy), P(w), P(h), P(r));
    };

    function drawClip(x: number, feet: number, time: number) {
      const air = y > 0.01;
      const out = phaseNow === "over";
      const k = phaseNow === "run" && !air ? Math.sin(time * 20) : 0;
      ctx.lineCap = "round";
      // Legs (tucked in the air) and arms swinging the other way.
      ctx.strokeStyle = CLIP_INK;
      ctx.lineWidth = P(1.5);
      ctx.beginPath();
      if (air) {
        ctx.moveTo(P(x + 3.5), P(feet - 2.6));
        ctx.lineTo(P(x + 2.2), P(feet - 0.8));
        ctx.moveTo(P(x + 7.5), P(feet - 2.6));
        ctx.lineTo(P(x + 8.8), P(feet - 1.2));
      } else {
        ctx.moveTo(P(x + 3.5), P(feet - 2.8));
        ctx.lineTo(P(x + 3.5 + k * 2.2), P(feet));
        ctx.moveTo(P(x + 7.5), P(feet - 2.8));
        ctx.lineTo(P(x + 7.5 - k * 2.2), P(feet));
      }
      ctx.moveTo(P(x + 0.4), P(feet - 7));
      ctx.lineTo(P(x - 2 - k * 1.2), P(feet - 5.2 - (air ? 2.5 : 0)));
      ctx.moveTo(P(x + CLIP_W - 0.4), P(feet - 7));
      ctx.lineTo(P(x + CLIP_W + 2 + k * 1.2), P(feet - 5.2 - (air ? 2.5 : 0)));
      ctx.stroke();
      // The board.
      const top = feet - 2.6 - 10;
      rr(x, top, CLIP_W, 10, 2);
      ctx.fillStyle = CLIP_CREAM;
      ctx.fill();
      ctx.lineWidth = P(0.9);
      ctx.strokeStyle = CLIP_INK;
      ctx.stroke();
      // The striped band, then the clapper arm (open in the air, snapped shut on the ground).
      ctx.save();
      rr(x, top, CLIP_W, 2.6, 1.2);
      ctx.clip();
      ctx.fillStyle = CLIP_INK;
      ctx.fillRect(P(x), P(top), P(CLIP_W), P(2.6));
      ctx.fillStyle = CLIP_AMBER;
      for (let s = 0; s < 4; s++) {
        ctx.beginPath();
        ctx.moveTo(P(x + 1 + s * 3), P(top + 2.6));
        ctx.lineTo(P(x + 2.4 + s * 3), P(top));
        ctx.lineTo(P(x + 3.6 + s * 3), P(top));
        ctx.lineTo(P(x + 2.2 + s * 3), P(top + 2.6));
        ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(P(x), P(top - 0.4));
      ctx.rotate(air && !out ? -0.42 : 0);
      ctx.beginPath();
      box2(0, P(-2.4), P(CLIP_W + 0.4), P(2.4), P(0.8));
      ctx.fillStyle = CLIP_INK;
      ctx.fill();
      ctx.fillStyle = CLIP_AMBER;
      for (let s = 0; s < 4; s++) ctx.fillRect(P(1.2 + s * 3), P(-2.4), P(1.3), P(2.4));
      ctx.restore();
      // The face: eyes (crosses when caught) and a smile.
      ctx.fillStyle = CLIP_INK;
      ctx.strokeStyle = CLIP_INK;
      if (out) {
        ctx.lineWidth = P(0.7);
        for (const ex of [x + 3.8, x + 7.4]) {
          ctx.beginPath();
          ctx.moveTo(P(ex - 0.9), P(top + 4.3));
          ctx.lineTo(P(ex + 0.9), P(top + 6.1));
          ctx.moveTo(P(ex + 0.9), P(top + 4.3));
          ctx.lineTo(P(ex - 0.9), P(top + 6.1));
          ctx.stroke();
        }
      } else {
        for (const ex of [x + 3.8, x + 7.4]) {
          ctx.beginPath();
          ctx.ellipse(P(ex), P(top + 5.2), P(0.8), P(1.1), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.lineWidth = P(0.6);
      ctx.beginPath();
      if (out) ctx.arc(P(x + 5.6), P(top + 8.6), P(1.2), Math.PI * 1.15, Math.PI * 1.85);
      else ctx.arc(P(x + 5.6), P(top + 6.9), P(1.3), Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }

    function drawOb(o: Ob, time: number) {
      const bottom = GROUND - o.y;
      const top = bottom - o.h;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (o.kind === "cup") {
        ctx.fillStyle = col.soft;
        ctx.beginPath();
        ctx.moveTo(P(o.x), P(top + 1.5));
        ctx.lineTo(P(o.x + o.w), P(top + 1.5));
        ctx.lineTo(P(o.x + o.w - 0.9), P(bottom));
        ctx.lineTo(P(o.x + 0.9), P(bottom));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = col.soft;
        ctx.lineWidth = P(0.8);
        ctx.beginPath();
        ctx.arc(P(o.x + o.w + 0.4), P(top + 4.2), P(1.4), -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        // Steam.
        ctx.strokeStyle = col.faint;
        ctx.lineWidth = P(0.5);
        for (const sx of [o.x + 2, o.x + 4]) {
          ctx.beginPath();
          ctx.moveTo(P(sx), P(top));
          ctx.quadraticCurveTo(P(sx + 1.2), P(top - 1.6 - Math.sin(time * 6 + sx) * 0.4), P(sx), P(top - 3));
          ctx.stroke();
        }
      } else if (o.kind === "can") {
        rr(o.x, top, o.w, o.h, 1.2);
        ctx.fillStyle = col.soft;
        ctx.fill();
        ctx.fillStyle = col.surface;
        ctx.beginPath();
        ctx.arc(P(o.x + o.w / 2), P(top + o.h / 2), P(1.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = col.surface;
        ctx.lineWidth = P(0.45);
        rr(o.x + 0.9, top + 0.9, o.w - 1.8, o.h - 1.8, 0.8);
        ctx.stroke();
      } else if (o.kind === "tripod") {
        ctx.strokeStyle = col.soft;
        ctx.lineWidth = P(0.9);
        const cx = o.x + o.w / 2;
        ctx.beginPath();
        ctx.moveTo(P(cx), P(top + 4));
        ctx.lineTo(P(o.x), P(bottom));
        ctx.moveTo(P(cx), P(top + 4));
        ctx.lineTo(P(o.x + o.w), P(bottom));
        ctx.moveTo(P(cx), P(top + 4));
        ctx.lineTo(P(cx), P(bottom));
        ctx.stroke();
        rr(cx - 3.2, top, 6.4, 4, 0.8);
        ctx.fillStyle = col.ink;
        ctx.fill();
        ctx.fillStyle = col.amber;
        ctx.beginPath();
        ctx.arc(P(cx + 2.2), P(top + 2), P(0.7), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // A drone: body, arms, spinning rotors, a blinking light.
        const cx = o.x + o.w / 2;
        rr(cx - 3, top + 1.6, 6, 2.6, 1);
        ctx.fillStyle = col.ink;
        ctx.fill();
        ctx.strokeStyle = col.ink;
        ctx.lineWidth = P(0.6);
        ctx.beginPath();
        ctx.moveTo(P(o.x + 1.2), P(top + 1));
        ctx.lineTo(P(o.x + o.w - 1.2), P(top + 1));
        ctx.stroke();
        const blade = 1.4 + Math.abs(Math.sin(time * 40)) * 1.2;
        ctx.lineWidth = P(0.45);
        for (const rx of [o.x + 1.2, o.x + o.w - 1.2]) {
          ctx.beginPath();
          ctx.moveTo(P(rx - blade), P(top + 0.5));
          ctx.lineTo(P(rx + blade), P(top + 0.5));
          ctx.stroke();
        }
        if (Math.sin(time * 9) > 0) {
          ctx.fillStyle = col.amber;
          ctx.beginPath();
          ctx.arc(P(cx), P(top + 4.6), P(0.55), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawReel(x: number) {
      const r = 13;
      const cy = GROUND - r;
      ctx.save();
      ctx.translate(P(x), P(cy));
      ctx.rotate(reelSpin);
      ctx.beginPath();
      ctx.arc(0, 0, P(r), 0, Math.PI * 2);
      ctx.fillStyle = col.ink;
      ctx.fill();
      ctx.fillStyle = col.surface;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * P(7), Math.sin(a) * P(7), P(3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, P(1.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // A strip of film trailing behind it.
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = P(1.6);
      ctx.beginPath();
      ctx.moveTo(P(x - r), P(GROUND - 1));
      ctx.lineTo(P(x - r - 30), P(GROUND - 1));
      ctx.stroke();
    }

    function draw(time = performance.now() / 1000) {
      ctx.clearRect(0, 0, W, H);
      // Clouds, slower than the ground.
      ctx.fillStyle = col.cloud;
      for (const c of clouds) {
        ctx.beginPath();
        ctx.ellipse(P(c.x), P(c.y), P(7 * c.s), P(2.4 * c.s), 0, 0, Math.PI * 2);
        ctx.ellipse(P(c.x + 4 * c.s), P(c.y - 1.4 * c.s), P(4.5 * c.s), P(2.4 * c.s), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // The ground, and pebbles going by.
      ctx.strokeStyle = col.line;
      ctx.lineWidth = Math.max(1, P(0.5));
      ctx.beginPath();
      ctx.moveTo(0, P(GROUND));
      ctx.lineTo(W, P(GROUND));
      ctx.stroke();
      ctx.fillStyle = col.line;
      for (let gx = -groundOff; gx < worldW(); gx += 9) {
        ctx.fillRect(P(gx), P(GROUND + 3 + ((gx * 7) % 3)), P(1.8), Math.max(1, P(0.4)));
      }
      for (const o of obs) drawOb(o, time);
      drawReel(reelX);
      drawClip(clipX() + (phaseNow === "over" ? -caught * 2 : 0), GROUND - y, time);
      // The score, top right; it blinks when it passes a hundred.
      ctx.font = `600 ${Math.max(11, P(5))}px ${MONO}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      const blink = flash > 0 && Math.floor(flash * 8) % 2 === 0;
      ctx.fillStyle = blink ? col.amber : col.soft;
      ctx.fillText(pad(score), W - P(4), P(4));
      if (best > 0) {
        const w = ctx.measureText(pad(score)).width;
        ctx.fillStyle = col.faint;
        ctx.fillText(`HI ${pad(best)}`, W - P(4) - w - P(4), P(4));
      }
    }

    // ---- the game ----
    function spawn() {
      const later = score > 120;
      const r = Math.random();
      const kind: Kind = later && r < 0.14 ? "droneHigh" : later && r < 0.28 ? "droneLow" : r < 0.55 ? "cup" : r < 0.8 ? "can" : "tripod";
      const s = SIZE[kind];
      obs.push({ kind, x: worldW() + 4, ...s });
      const min = 46 + speed * 0.38;
      toNext = min + Math.random() * (min * 0.9);
    }

    function hit(o: Ob) {
      const cx = clipX();
      const a = { l: cx + 1.4, r: cx + CLIP_W - 1.4, b: y + 0.4, t: y + 2.6 + 10 + 1.2 };
      const b = { l: o.x + 0.8, r: o.x + o.w - 0.8, b: o.y + 0.6, t: o.y + o.h - 0.6 };
      return a.l < b.r && a.r > b.l && a.b < b.t && a.t > b.b;
    }

    function update(dt: number) {
      t += dt;
      speed = 62 + Math.min(88, t * 1.5);
      const step = speed * dt;
      // Clip.
      vy -= GRAVITY * dt;
      y = Math.max(0, y + vy * dt);
      if (y === 0 && vy < 0) vy = 0;
      // The world goes by.
      groundOff = (groundOff + step) % 9;
      for (const c of clouds) {
        c.x -= step * 0.18 * c.s;
        if (c.x < -14) c.x = worldW() + 10 + Math.random() * 30;
      }
      for (const o of obs) o.x -= step;
      obs = obs.filter((o) => o.x + o.w > -5);
      toNext -= step;
      if (toNext <= 0) spawn();
      reelSpin += step / 13;
      reelX = -3 + Math.sin(t * 3) * 1.2;
      // Points.
      const before = Math.floor(score / 100);
      score += step * 0.12;
      if (Math.floor(score / 100) > before) {
        flash = 0.7;
        sounds.point();
      }
      flash = Math.max(0, flash - dt);
      if (obs.some(hit)) end();
    }

    function end() {
      phaseNow = "over";
      caught = 0;
      sounds.hit();
      const record = score > best;
      if (record) {
        best = Math.floor(score);
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {}
      }
      setResult({ score: Math.floor(score), best, record });
      setPhase("over");
    }

    // The reel catches up after a fall, then the scene stands still.
    function updateOver(dt: number) {
      caught = Math.min(1, caught + dt * 2);
      reelX += (clipX() - 6 - reelX) * Math.min(1, dt * 5);
      reelSpin += dt * 4;
      y = Math.max(0, y - 60 * dt);
    }

    function frame(now: number) {
      const dt = last ? Math.min(0.034, (now - last) / 1000) : 0;
      last = now;
      if (phaseNow === "run") update(dt);
      else if (phaseNow === "over") updateOver(dt);
      draw(now / 1000);
      if (phaseNow === "run" || (phaseNow === "over" && caught < 1)) raf = requestAnimationFrame(frame);
      else raf = 0;
    }
    const go = () => {
      if (raf || document.visibilityState !== "visible") return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    function start() {
      t = 0;
      speed = 62;
      score = 0;
      flash = 0;
      y = 0;
      vy = 0;
      obs = [];
      toNext = 60;
      reelX = -3;
      caught = 0;
      phaseNow = "run";
      setPhase("run");
      setResult(null);
      go();
    }

    controls.current = {
      press: () => {
        if (phaseNow !== "run") {
          if (phaseNow === "ready" || caught >= 1) start();
          return;
        }
        holding = true;
        if (y === 0) {
          vy = JUMP;
          sounds.jump();
        }
      },
      release: () => {
        // Let go early: a lower jump.
        if (holding && vy > 58) vy = 58;
        holding = false;
      },
    };

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(box);
    resize();
    const onVis = () => {
      if (document.visibilityState === "visible") go();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ro?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    // A button (Play again, Close) handles its own Enter and Space.
    if (e.target instanceof HTMLElement && e.target.closest("button")) return;
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W" || (e.key === "Enter" && phase !== "run")) {
      e.preventDefault();
      if (!e.repeat) controls.current.press();
    }
  };
  const keyUp = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") controls.current.release();
  };

  return (
    <div
      ref={wrap}
      tabIndex={0}
      role="application"
      aria-label={`${MASCOT_NAME}'s runner. Space or a tap to jump, Esc to close.`}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      className="clip-runner relative h-full min-h-[150px] w-full overflow-hidden rounded-lg outline-none select-none touch-none animate-[fadein_.25s_ease]"
    >
      <canvas
        ref={cv}
        className="absolute inset-0"
        onPointerDown={(e) => {
          e.preventDefault();
          wrap.current?.focus({ preventScroll: true });
          controls.current.press();
        }}
        onPointerUp={() => controls.current.release()}
        onPointerCancel={() => controls.current.release()}
        aria-hidden
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the game"
        className="absolute top-1.5 left-1.5 w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2"
      >
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
      {phase === "ready" && (
        <div className="absolute inset-x-0 top-[14%] flex flex-col items-center text-center px-6 pointer-events-none">
          <p className="font-display text-[17px] font-semibold">{MASCOT_NAME} is on the run!</p>
          <p className="mt-0.5 text-[12px] text-ink-soft">A runaway film reel is right behind. Tap or press Space to jump, hold for higher.</p>
        </div>
      )}
      {phase === "over" && result && (
        <div className="absolute inset-x-0 top-[10%] flex flex-col items-center text-center px-6" aria-live="polite">
          <p className="font-display text-[17px] font-semibold">Caught by the reel!</p>
          <p className="mt-0.5 text-[12.5px] text-ink-soft tabular-nums">
            {result.score} points · {result.record ? "a new best!" : `best ${result.best}`}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button type="button" onClick={() => controls.current.press()} className="rounded-lg bg-amber text-white px-3 h-8 text-[12.5px] font-bold hover:brightness-110">
              Play again
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Back to my tasks
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
