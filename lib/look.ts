/**
 * The glass look's choices (1.27.5, more in 1.28.0), shared by the account
 * (profiles.glass_* columns, migrations 0092 / 0093), this device (localStorage
 * "vp-look", read by the first-paint script in app/layout.tsx) and the
 * Settings controls. Pure: no React, no database.
 *
 *  - on:      glass at all (off by default)
 *  - style:   "simple" (1.27.5's frosted panes) or "liquid" (like iOS 26's
 *             Liquid Glass: bright rims, a sheen that follows the pointer,
 *             floating bars)
 *  - scope:   "cards" (cards, bars and the main pop-ups) or "everywhere"
 *             (every pop-up, menu, toast and floating box too)
 *  - sidebar: the side bar as see-through as the cards (else nearly solid)
 *  - level:   how see-through, 0–100 (50 by default)
 */

export type GlassStyle = "simple" | "liquid";
export type GlassScope = "cards" | "everywhere";
export type Look = { on: boolean; style: GlassStyle; scope: GlassScope; sidebar: boolean; level: number };

export const DEFAULT_LOOK: Look = { on: false, style: "simple", scope: "cards", sidebar: false, level: 50 };
export const LOOK_KEY = "vp-look";
/** 1.27.5 kept only "on" here; still read when there's no "vp-look" yet. */
export const OLD_GLASS_KEY = "vp-glass";

export const isGlassStyle = (v: unknown): v is GlassStyle => v === "simple" || v === "liquid";
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
  return {
    on: on === true,
    style: isGlassStyle(style) ? style : DEFAULT_LOOK.style,
    scope: isGlassScope(scope) ? scope : DEFAULT_LOOK.scope,
    sidebar: sidebar === true,
    level: clampLevel(level),
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
  return out;
}

/** The database columns for a change. */
export function lookColumns(p: Partial<Look>): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (p.on !== undefined) c.glass_ui = p.on;
  if (p.style !== undefined) c.glass_style = p.style;
  if (p.scope !== undefined) c.glass_scope = p.scope;
  if (p.sidebar !== undefined) c.glass_sidebar = p.sidebar;
  if (p.level !== undefined) c.glass_level = p.level;
  return c;
}

/** What goes on <html>: data attributes (absent = the default) and the see-through level as a 0–1 number. */
export function lookAttributes(l: Look): { glass?: "on"; glassStyle?: "liquid"; glassScope?: "everywhere"; glassSidebar?: "clear"; level: string } {
  if (!l.on) return { level: String(l.level / 100) };
  return {
    glass: "on",
    ...(l.style === "liquid" ? { glassStyle: "liquid" as const } : {}),
    ...(l.scope === "everywhere" ? { glassScope: "everywhere" as const } : {}),
    ...(l.sidebar ? { glassSidebar: "clear" as const } : {}),
    level: String(l.level / 100),
  };
}
