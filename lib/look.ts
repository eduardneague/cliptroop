import { DEFAULT_CUSTOM, cleanColors, isWash, washVars, type WashId } from "./washes";

/**
 * The glass look's choices (1.27.5, more in 1.28.0 and 1.29.2), shared by
 * the account (profiles.glass_* columns, migrations 0092 / 0093 / 0096), this
 * device (localStorage "vp-look", read by the first-paint script in
 * app/layout.tsx) and the Settings controls. Pure: no React, no database.
 *
 *  - on:      glass at all (off by default). Off means nothing is
 *             see-through anywhere, wallpapers and profiles included (1.29.2).
 *  - style:   "simple" (1.27.5's frosted panes), "liquid" (like iOS 26's
 *             Liquid Glass: clear panes, a light on the rim you point at,
 *             floating bars) or "halo" (1.29.3: soft glass with the colours
 *             behind it glowing round the edges)
 *  - scope:   "cards" (cards, bars and the main pop-ups) or "everywhere"
 *             (every pop-up, menu, toast and floating box too)
 *  - sidebar: the side bar as see-through as the cards (else nearly solid)
 *  - level:   how see-through, 0 (solid) … 100 (nearly clear); 50 by default
 *  - wash, washColors: the colours behind the glass (lib/washes.ts, 1.29.2)
 *  - light:   Liquid's light that follows the pointer over widgets, pop-ups
 *             and bars (1.45.0: on by default; off, none of it is drawn)
 */

export type GlassStyle = "simple" | "liquid" | "halo";
export type GlassScope = "cards" | "everywhere";
export type Look = {
  on: boolean;
  style: GlassStyle;
  scope: GlassScope;
  sidebar: boolean;
  level: number;
  wash: WashId;
  washColors: [string, string, string];
  /** 1.45.0: Liquid's light that follows the pointer (on unless switched off). */
  light: boolean;
  /** False when the account can't keep the colours yet (a database before 0096): this device's own are used. */
  washStored?: false;
};

export const DEFAULT_LOOK: Look = { on: false, style: "simple", scope: "cards", sidebar: false, level: 50, wash: "theme", washColors: DEFAULT_CUSTOM, light: true };
export const LOOK_KEY = "vp-look";
/** 1.27.5 kept only "on" here; still read when there's no "vp-look" yet. */
export const OLD_GLASS_KEY = "vp-glass";

export const isGlassStyle = (v: unknown): v is GlassStyle => v === "simple" || v === "liquid" || v === "halo";
export const isGlassScope = (v: unknown): v is GlassScope => v === "cards" || v === "everywhere";
export const clampLevel = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : DEFAULT_LOOK.level);

/** Anything stored (a database row, a parsed localStorage value) as a Look; missing parts are the defaults. */
export function readLook(raw: unknown): Look {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const on = r.on ?? r.glass_ui;
  const style = r.style ?? r.glass_style;
  const scope = r.scope ?? r.glass_scope;
  const sidebar = r.sidebar ?? r.glass_sidebar;
  const level = r.level ?? r.glass_level;
  const wash = r.wash ?? r.glass_wash;
  const colors = r.washColors ?? r.glass_wash_colors;
  const light = r.light ?? r.glass_light;
  return {
    on: on === true,
    style: isGlassStyle(style) ? style : DEFAULT_LOOK.style,
    scope: isGlassScope(scope) ? scope : DEFAULT_LOOK.scope,
    sidebar: sidebar === true,
    level: clampLevel(level),
    wash: isWash(wash) ? wash : DEFAULT_LOOK.wash,
    washColors: cleanColors(colors),
    light: light !== false,
  };
}

/** A partial change from Settings, checked (unknown keys and bad values are dropped). */
export function cleanLookPatch(patch: unknown): Partial<Look> {
  const p = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const out: Partial<Look> = {};
  if (typeof p.on === "boolean") out.on = p.on;
  if (isGlassStyle(p.style)) out.style = p.style;
  if (isGlassScope(p.scope)) out.scope = p.scope;
  if (typeof p.sidebar === "boolean") out.sidebar = p.sidebar;
  if (typeof p.level === "number" && Number.isFinite(p.level)) out.level = clampLevel(p.level);
  if (isWash(p.wash)) out.wash = p.wash;
  if (Array.isArray(p.washColors)) out.washColors = cleanColors(p.washColors);
  if (typeof p.light === "boolean") out.light = p.light;
  return out;
}

/** The database columns for a change ("theme", the default wash, is stored as null). */
export function lookColumns(p: Partial<Look>): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (p.on !== undefined) c.glass_ui = p.on;
  if (p.style !== undefined) c.glass_style = p.style;
  if (p.scope !== undefined) c.glass_scope = p.scope;
  if (p.sidebar !== undefined) c.glass_sidebar = p.sidebar;
  if (p.level !== undefined) c.glass_level = p.level;
  if (p.wash !== undefined) c.glass_wash = p.wash === "theme" ? null : p.wash;
  if (p.washColors !== undefined) c.glass_wash_colors = p.washColors;
  if (p.light !== undefined) c.glass_light = p.light;
  return c;
}

/** The CSS variables a wash sets on <html> (all of them, so a change clears the old ones). */
export const WASH_VARS = ["--wash-light", "--wash-dark", "--wash-1", "--wash-2", "--wash-3"] as const;

export type LookAttributes = {
  glass?: "on";
  glassStyle?: "liquid" | "halo";
  glassScope?: "everywhere";
  glassSidebar?: "clear";
  /** The colours behind the glass, when they aren't the theme's own. */
  glassWash?: "none" | "one" | "three";
  /** Solid (the slider at 0): no blur is worked out at all. */
  glassOpaque?: "on";
  /** 1.45.0: Liquid's pointer light switched off. */
  glassLight?: "off";
  /** --glass-level, 0–1. */
  level: string;
  /** The wash's colours ("r g b"), when it has its own. */
  vars?: Partial<Record<(typeof WASH_VARS)[number], string>>;
};

/** What goes on <html>: data attributes (absent = the default), the see-through level as a 0–1 number and the wash's colours. */
export function lookAttributes(l: Look): LookAttributes {
  if (!l.on) return { level: String(l.level / 100) };
  const w = washVars(l.wash, l.washColors);
  return {
    glass: "on",
    ...(l.style === "liquid" ? { glassStyle: "liquid" as const } : l.style === "halo" ? { glassStyle: "halo" as const } : {}),
    ...(l.scope === "everywhere" ? { glassScope: "everywhere" as const } : {}),
    ...(l.sidebar ? { glassSidebar: "clear" as const } : {}),
    ...(w.kind === "none" ? { glassWash: "none" as const } : w.kind === "one" ? { glassWash: "one" as const } : w.kind === "three" ? { glassWash: "three" as const } : {}),
    ...(l.level === 0 ? { glassOpaque: "on" as const } : {}),
    ...(l.style === "liquid" && !l.light ? { glassLight: "off" as const } : {}),
    level: String(l.level / 100),
    ...(w.kind === "one"
      ? { vars: { "--wash-light": w.light, "--wash-dark": w.dark } }
      : w.kind === "three"
        ? { vars: { "--wash-1": w.colors[0], "--wash-2": w.colors[1], "--wash-3": w.colors[2] } }
        : {}),
  };
}
