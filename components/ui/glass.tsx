"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setLook } from "@/app/(dashboard)/settings/actions";
import { DEFAULT_LOOK, LOOK_KEY, OLD_GLASS_KEY, lookAttributes, readLook, type GlassScope, type GlassStyle, type Look } from "@/lib/look";
import { useToast } from "./toast-provider";

/*
 * The glass look (1.27.5; styles, where it goes, the side bar and how
 * see-through it is in 1.28.0): saved on the account (profiles.glass_*,
 * migrations 0092 / 0093) and kept on the device ("vp-look") so it's on
 * screen before the page paints (the script in app/layout.tsx). <html>
 * carries data-glass, data-glass-style, data-glass-scope,
 * data-glass-sidebar and --glass-level; the CSS is in globals.css.
 */

const EVENT = "vp-look-change";

function deviceLook(): Look {
  try {
    const saved = localStorage.getItem(LOOK_KEY);
    if (saved) return readLook(JSON.parse(saved));
    return { ...DEFAULT_LOOK, on: localStorage.getItem(OLD_GLASS_KEY) === "on" };
  } catch {
    return DEFAULT_LOOK;
  }
}

function applyLook(l: Look) {
  const root = document.documentElement;
  const a = lookAttributes(l);
  const set = (k: "glass" | "glassStyle" | "glassScope" | "glassSidebar", v: string | undefined) => {
    if (v) root.dataset[k] = v;
    else delete root.dataset[k];
  };
  set("glass", a.glass);
  set("glassStyle", a.glassStyle);
  set("glassScope", a.glassScope);
  set("glassSidebar", a.glassSidebar);
  root.style.setProperty("--glass-level", a.level);
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(l));
    localStorage.removeItem(OLD_GLASS_KEY);
  } catch {
    /* private mode: the attributes still apply for this visit */
  }
  window.dispatchEvent(new CustomEvent<Look>(EVENT, { detail: l }));
}

/** Keeps this device on the account's look (chosen on another device, say); null = not known (the database before 0092). */
export function GlassSync({ look }: { look: Look | null }) {
  const key = look ? JSON.stringify(look) : "";
  useEffect(() => {
    applyLook(look ?? deviceLook());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <LiquidLight />;
}

/**
 * Liquid's light (1.28.0): the bright spot on the glass follows the pointer,
 * like light catching real glass as it moves. One listener for the page,
 * a frame at a time, nothing when the look isn't Liquid or motion is off.
 */
function LiquidLight() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      root.style.setProperty("--lx", `${Math.round(x)}px`);
      root.style.setProperty("--ly", `${Math.round(y)}px`);
    };
    const onMove = (e: PointerEvent) => {
      if (root.dataset.glassStyle !== "liquid" || e.pointerType === "touch") return;
      if (root.dataset.motion === "off" || (root.dataset.motion !== "on" && reduce.matches)) return;
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

/** A row of two or three choices (the app's segmented control). */
function Segments<T extends string>({ value, options, onChange, label, disabled }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line/15 p-0.5 flex-shrink-0">
      {options.map((o) => {
        const sel = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={sel}
            data-sound="none"
            tabIndex={sel ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = options.findIndex((x) => x.v === value);
              onChange(options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length].v);
            }}
            className={`px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:opacity-60 ${
              sel ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The two styles side by side, each drawn small: a few cards over a colour wash. */
function StyleCard({ style, on, onPick }: { style: GlassStyle; on: boolean; onPick: () => void }) {
  const liquid = style === "liquid";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={`group text-left rounded-xl border p-2 transition-all ${on ? "border-amber ring-2 ring-amber/30" : "border-line/15 hover:border-line/30"}`}
    >
      <span className="glass-sample relative block h-20 rounded-lg overflow-hidden" data-sample={style} aria-hidden>
        <span className="glass-sample-card absolute left-2.5 top-2.5 w-[46%] h-[42%]" />
        <span className="glass-sample-card absolute right-2.5 top-2.5 w-[38%] h-[70%]" />
        <span className="glass-sample-bar absolute left-2.5 bottom-2 w-[52%] h-[22%]" />
      </span>
      <span className="mt-2 px-0.5 block text-[13px] font-semibold">{liquid ? "Liquid" : "Simple"}</span>
      <span className="block px-0.5 text-[11.5px] text-ink-faint">{liquid ? "Like iOS: bright edges, light that follows the pointer, floating bars" : "Soft frosted cards and bars"}</span>
    </button>
  );
}

/** Settings → Preferences → Glass: on or off, and (when on) its style, where it goes, the side bar and how see-through. */
export function GlassSettings({ initial }: { initial: Look }) {
  const toast = useToast();
  const [look, setLookState] = useState<Look>(initial);
  const [, start] = useTransition();
  const levelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Changed somewhere else (another tab): follow it.
  useEffect(() => {
    const follow = (e: Event) => setLookState((e as CustomEvent<Look>).detail);
    window.addEventListener(EVENT, follow);
    return () => {
      window.removeEventListener(EVENT, follow);
      if (levelTimer.current) clearTimeout(levelTimer.current);
    };
  }, []);

  function save(patch: Partial<Look>, done?: string) {
    start(async () => {
      const res = await setLook(patch);
      if (res?.error) {
        if (res.deviceOnly) toast.success(res.error);
        else toast.error(res.error);
      } else if (done) toast.success(done);
    });
  }

  function change(patch: Partial<Look>, done?: string) {
    const next = { ...look, ...patch };
    setLookState(next);
    applyLook(next);
    if (patch.level !== undefined && Object.keys(patch).length === 1) {
      // The slider: saved once it stops moving.
      if (levelTimer.current) clearTimeout(levelTimer.current);
      levelTimer.current = setTimeout(() => save({ level: patch.level }), 500);
      return;
    }
    save(patch, done);
  }

  const row = "flex items-center justify-between gap-4 mt-4 pt-4 border-t border-line/10";
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[13.5px] font-semibold">Glass</div>
          <div className="text-[11.5px] text-ink-faint">See-through cards and bars over a soft wash of your colours, across the whole app. Works with every colour theme, light and dark.</div>
        </div>
        <Segments label="Glass" value={look.on ? "on" : "off"} options={[{ v: "off", label: "Off" }, { v: "on", label: "On" }]} onChange={(v) => change({ on: v === "on" }, v === "on" ? "Glass on" : "Glass off")} />
      </div>
      {look.on && (
        <div className="mt-4 pl-0 sm:pl-4 sm:border-l-2 sm:border-amber/30 animate-[fadein_.2s_ease]">
          <div className="text-[12.5px] font-semibold mb-2">Style</div>
          <div role="radiogroup" aria-label="Glass style" className="grid grid-cols-2 gap-3 max-w-md">
            {(["simple", "liquid"] as const).map((s) => (
              <StyleCard key={s} style={s} on={look.style === s} onPick={() => look.style !== s && change({ style: s }, s === "liquid" ? "Liquid glass" : "Simple glass")} />
            ))}
          </div>
          <div className={row}>
            <div>
              <div className="text-[12.5px] font-semibold">Where</div>
              <div className="text-[11.5px] text-ink-faint">{look.scope === "everywhere" ? "Every pop-up, menu, message and box too." : "Cards, bars and the main pop-ups."}</div>
            </div>
            <Segments<GlassScope> label="Where glass goes" value={look.scope} options={[{ v: "cards", label: "Cards and bars" }, { v: "everywhere", label: "Everywhere" }]} onChange={(v) => change({ scope: v })} />
          </div>
          <div className={row}>
            <div>
              <div className="text-[12.5px] font-semibold">Side bar</div>
              <div className="text-[11.5px] text-ink-faint">See-through like the cards, or nearly solid.</div>
            </div>
            <Segments label="Side bar" value={look.sidebar ? "clear" : "solid"} options={[{ v: "solid", label: "Solid" }, { v: "clear", label: "See-through" }]} onChange={(v) => change({ sidebar: v === "clear" })} />
          </div>
          <label className="block mt-4 pt-4 border-t border-line/10">
            <span className="flex items-center justify-between text-[12.5px] font-semibold mb-1">
              <span>How see-through</span>
              <span className="text-ink-faint font-medium tabular-nums">{look.level}%</span>
            </span>
            <input type="range" min={0} max={100} step={5} value={look.level} onChange={(e) => change({ level: Number(e.target.value) })} className="w-full accent-[rgb(var(--amber))]" aria-describedby="glass-level-hint" />
            <span id="glass-level-hint" className="flex justify-between text-[11px] text-ink-faint">
              <span>Frosted</span>
              <span>Clear</span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
