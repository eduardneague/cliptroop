"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setLook } from "@/app/(dashboard)/settings/actions";
import { DEFAULT_LOOK, LOOK_KEY, OLD_GLASS_KEY, WASH_VARS, lookAttributes, readLook, type GlassScope, type GlassStyle, type Look } from "@/lib/look";
import { changeLook } from "@/lib/look-screen";
import { BLENDS, THEME_WASHES, hexToRgb, type WashId } from "@/lib/washes";
import { useToast } from "./toast-provider";

/*
 * The glass look (1.27.5; styles, where it goes, the side bar and how
 * see-through it is in 1.28.0; the colours behind it in 1.29.2): saved on
 * the account (profiles.glass_*, migrations 0092 / 0093 / 0096) and kept on
 * the device ("vp-look") so it's on screen before the page paints (the
 * script in app/layout.tsx; "paint" in the saved value is what that script
 * puts on <html>). <html> carries data-glass, data-glass-style,
 * data-glass-scope, data-glass-sidebar, data-glass-wash, data-glass-opaque,
 * --glass-level and the wash's colours; the CSS is in globals.css.
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
  const set = (k: "glass" | "glassStyle" | "glassScope" | "glassSidebar" | "glassWash" | "glassOpaque" | "glassLight", v: string | undefined) => {
    if (v) root.dataset[k] = v;
    else delete root.dataset[k];
  };
  set("glass", a.glass);
  set("glassStyle", a.glassStyle);
  set("glassScope", a.glassScope);
  set("glassSidebar", a.glassSidebar);
  set("glassWash", a.glassWash);
  set("glassOpaque", a.glassOpaque);
  set("glassLight", a.glassLight);
  root.style.setProperty("--glass-level", a.level);
  for (const k of WASH_VARS) {
    const v = a.vars?.[k];
    if (v) root.style.setProperty(k, v);
    else root.style.removeProperty(k);
  }
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify({ ...l, paint: { wash: a.glassWash ?? null, vars: a.vars ?? null } }));
    localStorage.removeItem(OLD_GLASS_KEY);
  } catch {
    /* private mode: the attributes still apply for this visit */
  }
  window.dispatchEvent(new CustomEvent<Look>(EVENT, { detail: l }));
}

/** The account's look, with this device's colours behind the glass when the account can't keep them yet (before 0096). */
function withDeviceWash(l: Look): Look {
  const { washStored, ...rest } = l;
  if (washStored !== false) return rest;
  const d = deviceLook();
  return { ...rest, wash: d.wash, washColors: d.washColors };
}

/** Keeps this device on the account's look (chosen on another device, say); null = not known (the database before 0092). */
export function GlassSync({ look }: { look: Look | null }) {
  const key = look ? JSON.stringify(look) : "";
  useEffect(() => {
    applyLook(look ? withDeviceWash(look) : deviceLook());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <LiquidLight />;
}

/** What can catch Liquid's light: widgets, the main pop-ups, the phone tab bar, the floating top bar (1.31.9; the CSS draws it on these). */
const LIT = ".dash-item, .glass-pane, [data-shell='bottom-nav'], [data-shell='header']";

/**
 * Liquid's light (1.28.0; 1.29.3: on the pane you point at only). The rim of
 * the widget, pop-up or tab bar under the pointer lights up where the
 * pointer is (--mx / --my on that pane, in its own coordinates), in your
 * colours (globals.css). One listener for the page, a frame at a time, one
 * pane touched; nothing when the look isn't Liquid, on touch, when motion is
 * off, or (1.45.0) when the light is switched off in Preferences → Glass.
 */
function LiquidLight() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;
    let pane: HTMLElement | null = null;
    const paint = () => {
      frame = 0;
      if (!pane) return;
      const r = pane.getBoundingClientRect();
      pane.style.setProperty("--mx", `${Math.round(x - r.left)}px`);
      pane.style.setProperty("--my", `${Math.round(y - r.top)}px`);
    };
    const onMove = (e: PointerEvent) => {
      if (root.dataset.glassStyle !== "liquid" || root.dataset.glassLight === "off" || e.pointerType === "touch") return;
      if (root.dataset.motion === "off" || (root.dataset.motion !== "on" && reduce.matches)) return;
      pane = e.target instanceof Element ? (e.target.closest(LIT) as HTMLElement | null) : null;
      if (!pane) return;
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

const STYLES: Record<GlassStyle, { name: string; note: string }> = {
  simple: { name: "Simple", note: "Soft frosted cards and bars" },
  liquid: { name: "Liquid", note: "Clear like iOS, a light on the edge you point at, floating bars" },
  halo: { name: "Halo", note: "Soft glass, your colours glowing round the edges" },
};

/** The three styles side by side, each drawn small: a few cards over a colour wash. */
function StyleCard({ style, on, onPick }: { style: GlassStyle; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={`group text-left rounded-xl border p-2 transition-all ${on ? "border-amber ring-2 ring-amber/30" : "border-line/15 hover:border-line/30"}`}
    >
      <span className="glass-sample relative block h-16 sm:h-20 rounded-lg overflow-hidden" data-sample={style} aria-hidden>
        <span className="glass-sample-card absolute left-2.5 top-2.5 w-[46%] h-[42%]" />
        <span className="glass-sample-card absolute right-2.5 top-2.5 w-[38%] h-[70%]" />
        <span className="glass-sample-bar absolute left-2.5 bottom-2 w-[52%] h-[22%]" />
      </span>
      <span className="mt-2 px-0.5 block text-[13px] font-semibold">{STYLES[style].name}</span>
      <span className="hidden sm:block px-0.5 text-[11.5px] text-ink-faint">{STYLES[style].note}</span>
    </button>
  );
}

/** One wash in the picker: a little picture of its colours over the paper. */
function WashSwatch({ id, name, on, onPick, style, three, none }: { id: string; name: string; on: boolean; onPick: () => void; style?: React.CSSProperties; three?: boolean; none?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      data-wash={id}
      onClick={onPick}
      className={`group text-left rounded-xl border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${on ? "border-amber ring-2 ring-amber/30" : "border-line/15 hover:border-line/30"}`}
    >
      <span className="wash-swatch block h-10 rounded-lg border border-line/10" data-three={three ? "" : undefined} data-none={none ? "" : undefined} style={style} aria-hidden />
      <span className="mt-1 px-0.5 block text-[11px] font-semibold truncate">{name}</span>
    </button>
  );
}

/**
 * The colours behind the glass (1.29.2): your theme's, another theme's, a
 * blend, your own three, or none. Picking one shows it at once; your own
 * colours are saved once you stop changing them.
 */
function WashPicker({ look, change }: { look: Look; change: (patch: Partial<Look>, done?: string) => void }) {
  const [colors, setColors] = useState(look.washColors);
  useEffect(() => setColors(look.washColors), [look.washColors]);
  const pick = (wash: WashId) => look.wash !== wash && change({ wash });
  const three = (c: readonly string[]) => ({ "--w1": hexToRgb(c[0]), "--w2": hexToRgb(c[1]), "--w3": hexToRgb(c[2]) }) as React.CSSProperties;
  return (
    <div role="radiogroup" aria-label="Colours behind the glass" className="mt-3 grid gap-2 grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]">
      <WashSwatch id="theme" name="Your theme" on={look.wash === "theme"} onPick={() => pick("theme")} />
      {THEME_WASHES.map((w) => (
        <WashSwatch key={w.id} id={w.id} name={w.name} on={look.wash === w.id} onPick={() => pick(w.id)} style={{ "--wl": w.light, "--wd": w.dark } as React.CSSProperties} />
      ))}
      {BLENDS.map((b) => (
        <WashSwatch key={b.id} id={b.id} name={b.name} on={look.wash === b.id} onPick={() => pick(b.id)} three style={three(b.colors)} />
      ))}
      <div className={`col-span-2 rounded-xl border p-1.5 ${look.wash === "custom" ? "border-amber ring-2 ring-amber/30" : "border-line/15"}`}>
        <button type="button" role="radio" aria-checked={look.wash === "custom"} onClick={() => pick("custom")} className="block w-full text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
          <span className="wash-swatch block h-10 rounded-lg border border-line/10" data-three="" style={three(colors)} aria-hidden />
        </button>
        <span className="mt-1 flex items-center gap-1.5 px-0.5">
          <span className="text-[11px] font-semibold flex-1 truncate">Your own</span>
          {colors.map((c, i) => (
            <input
              key={i}
              type="color"
              value={c}
              aria-label={`Colour ${i + 1}`}
              onChange={(e) => {
                const next = colors.map((x, k) => (k === i ? e.target.value.toLowerCase() : x)) as Look["washColors"];
                setColors(next);
                change({ wash: "custom", washColors: next });
              }}
              className="wash-pick w-6 h-6 rounded-md border border-line/20 bg-transparent cursor-pointer"
            />
          ))}
        </span>
      </div>
    </div>
  );
}

/** Settings → Preferences → Glass: on or off, and (when on) its style, where it goes, the side bar, how see-through and the colours behind it. */
export function GlassSettings({ initial }: { initial: Look }) {
  const toast = useToast();
  const [look, setLookState] = useState<Look>(initial);
  // Before 0096 the colours live on this device only: show the ones it has.
  useEffect(() => {
    if (initial.washStored === false) setLookState(withDeviceWash(initial));
  }, [initial]);
  const [, start] = useTransition();
  // The slider and your own colours: saved once they stop changing.
  const later = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<Partial<Look>>({});
  // Off and back on brings back the colours you had.
  const lastWash = useRef<WashId>(initial.wash === "none" ? "theme" : initial.wash);
  // Changed somewhere else (another tab): follow it.
  useEffect(() => {
    const follow = (e: Event) => setLookState((e as CustomEvent<Look>).detail);
    window.addEventListener(EVENT, follow);
    return () => {
      window.removeEventListener(EVENT, follow);
      if (later.current) clearTimeout(later.current);
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
    if (next.wash !== "none") lastWash.current = next.wash;
    setLookState(next);
    // Glass on or off, or another style, restyles every pane: Clip covers it (1.29.8). The rest is light enough to show at once.
    if ("on" in patch || "style" in patch) changeLook("glass", () => applyLook(next));
    else applyLook(next);
    const keys = Object.keys(patch);
    if (keys.every((k) => k === "level" || k === "washColors" || (k === "wash" && patch.wash === "custom" && patch.washColors))) {
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      if (later.current) clearTimeout(later.current);
      later.current = setTimeout(() => {
        const p = pendingPatch.current;
        pendingPatch.current = {};
        save(p);
      }, 500);
      return;
    }
    save(patch, done);
  }

  // Phones: the words above the choice (side by side they squeezed to a word a line).
  const row = "flex flex-col items-start sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mt-4 pt-4 border-t border-line/10";
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">Glass</h2>
          <div className="mt-1 text-[11.5px] text-ink-faint">See-through cards and bars across the whole app, over your wallpaper or a soft wash of colour. Off, everything is solid.</div>
        </div>
        <Segments label="Glass" value={look.on ? "on" : "off"} options={[{ v: "off", label: "Off" }, { v: "on", label: "On" }]} onChange={(v) => change({ on: v === "on" }, v === "on" ? "Glass on" : "Glass off")} />
      </div>
      {look.on && (
        <div className="mt-4 pl-0 sm:pl-4 sm:border-l-2 sm:border-amber/30 animate-[fadein_.2s_ease]">
          <div className="text-[12.5px] font-semibold mb-2">Style</div>
          <div role="radiogroup" aria-label="Glass style" className="grid grid-cols-3 gap-2 sm:gap-3">
            {(["simple", "liquid", "halo"] as const).map((s) => (
              <StyleCard key={s} style={s} on={look.style === s} onPick={() => look.style !== s && change({ style: s }, `${STYLES[s].name} glass`)} />
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
          {look.style === "liquid" && (
            // 1.45.0, the owner: "a setting to be able to turn off the light following your mouse across widgets and the app".
            <div className={row}>
              <div>
                <div className="text-[12.5px] font-semibold">Light that follows the pointer</div>
                <div className="text-[11.5px] text-ink-faint">{look.light ? "The edge of the card, menu or bar you point at lights up where the pointer is." : "Off: cards and bars stay still under the pointer."}</div>
              </div>
              <Segments label="Light that follows the pointer" value={look.light ? "on" : "off"} options={[{ v: "off", label: "Off" }, { v: "on", label: "On" }]} onChange={(v) => change({ light: v === "on" }, v === "on" ? "Pointer light on" : "Pointer light off")} />
            </div>
          )}
          <label className="block mt-4 pt-4 border-t border-line/10">
            <span className="flex items-center justify-between text-[12.5px] font-semibold mb-1">
              <span>How see-through</span>
              <span className="text-ink-faint font-medium tabular-nums">{look.level}%</span>
            </span>
            <input type="range" min={0} max={100} step={5} value={look.level} onChange={(e) => change({ level: Number(e.target.value) })} className="w-full accent-[rgb(var(--amber))]" aria-describedby="glass-level-hint" />
            <span id="glass-level-hint" className="flex justify-between text-[11px] text-ink-faint">
              <span>Solid</span>
              <span>Nearly clear</span>
            </span>
            <span className="block mt-1 text-[11px] text-ink-faint">Over a wallpaper that would make the words hard to read, the panes keep just enough colour for them.</span>
          </label>
          <div className="mt-4 pt-4 border-t border-line/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[12.5px] font-semibold">Colours behind the glass</div>
                <div className="text-[11.5px] text-ink-faint">A soft wash the glass shows. Your theme&rsquo;s, any other theme&rsquo;s, a blend or your own three. Wallpapers show instead where you have one.</div>
              </div>
              <Segments
                label="Colours behind the glass"
                value={look.wash === "none" ? "off" : "on"}
                options={[{ v: "off", label: "Off" }, { v: "on", label: "On" }]}
                onChange={(v) => change({ wash: v === "off" ? "none" : lastWash.current })}
              />
            </div>
            {look.wash !== "none" && <WashPicker look={look} change={change} />}
          </div>
        </div>
      )}
    </div>
  );
}
