/**
 * A profile's showcases (1.28.0): which ones, where and how big, on the same
 * 12 column grid as the dashboard (modules/dashboard/grid.ts), saved on the
 * profile page (profile_pages.layout, 0093). Pure helpers, shared by the
 * page, the editor, the server action and the tests.
 */
import { COLS, compact, firstFit, type Box, type Limits } from "@/modules/dashboard/grid";
import type { Stack } from "@/modules/dashboard/layout";

export type ShowcaseType = "level" | "stats" | "contributions" | "achievements" | "specialties" | "about" | "teams" | "featured";
export type Showcase = { id: string; type: ShowcaseType; x: number; y: number; w: number; h: number; fixed?: boolean; settings?: Record<string, unknown> };
export type ProfileLayout = { v: 1; items: Showcase[] };

type Meta = { name: string; description: string; w: number; h: number; limits: Limits; stack: Stack; hasSettings?: boolean };

/** Every showcase once per profile. w/h = size when added. */
export const SHOWCASES: Record<ShowcaseType, Meta> = {
  level: { name: "Level", description: "Your level, the XP to the next one, how XP is earned and the next frame you'll unlock.", w: 4, h: 3, limits: { minW: 3, minH: 3, maxW: 6, maxH: 4 }, stack: { min: 3, max: 4, phone: 3 } },
  stats: { name: "Numbers", description: "Steps finished, how many on time, videos worked on, your best streak.", w: 8, h: 3, limits: { minW: 4, minH: 2, maxW: 12, maxH: 4 }, stack: { span: 2, min: 3, max: 4, phone: 4 } },
  contributions: { name: "Contributions", description: "A year of finished steps, one square per day.", w: 12, h: 3, limits: { minW: 6, minH: 3, maxW: 12, maxH: 4 }, stack: { span: 2, min: 3, max: 4, phone: 3 } },
  achievements: { name: "Achievements", description: "What you've reached, and how close you are to the rest.", w: 7, h: 4, limits: { minW: 4, minH: 3, maxW: 12, maxH: 8 }, stack: { span: 2, min: 4, max: 7, phone: 6 } },
  specialties: { name: "What I do", description: "The kinds of steps you finish most.", w: 5, h: 4, limits: { minW: 3, minH: 3, maxW: 8, maxH: 6 }, stack: { min: 4, max: 5, phone: 4 } },
  about: { name: "About me", description: "A few lines in your own words.", w: 6, h: 3, limits: { minW: 3, minH: 2, maxW: 12, maxH: 6 }, stack: { min: 3, max: 5, phone: 3 }, hasSettings: true },
  teams: { name: "Teams", description: "The teams you're on (when you show them).", w: 6, h: 3, limits: { minW: 3, minH: 2, maxW: 12, maxH: 5 }, stack: { min: 3, max: 4, phone: 3 } },
  featured: { name: "Featured achievement", description: "One achievement, big: the one you pick, or your rarest.", w: 4, h: 3, limits: { minW: 3, minH: 3, maxW: 6, maxH: 5 }, stack: { min: 3, max: 5, phone: 4 }, hasSettings: true },
};

export const ABOUT_MAX = 1000;
/** The bio under your name (profile_pages.bio, 0093). */
export const BIO_MAX = 300;

export const DEFAULT_PROFILE_LAYOUT: ProfileLayout = {
  v: 1,
  items: [
    { id: "s-stats", type: "stats", x: 0, y: 0, w: 8, h: 3 },
    { id: "s-featured", type: "featured", x: 8, y: 0, w: 4, h: 3 },
    { id: "s-contrib", type: "contributions", x: 0, y: 3, w: 12, h: 3 },
    { id: "s-achievements", type: "achievements", x: 0, y: 6, w: 7, h: 4 },
    { id: "s-specialties", type: "specialties", x: 7, y: 6, w: 5, h: 4 },
    { id: "s-teams", type: "teams", x: 0, y: 10, w: 12, h: 2 },
  ],
};

export const toBox = (s: Showcase): Box => ({ i: s.id, x: s.x, y: s.y, w: s.w, h: s.h });
export const limitsFor = (items: Showcase[]) => Object.fromEntries(items.map((s) => [s.id, SHOWCASES[s.type].limits])) as Record<string, Limits>;

function applyBoxes(items: Showcase[], boxes: Box[]): Showcase[] {
  const m = new Map(boxes.map((b) => [b.i, b]));
  return items.map((s) => {
    const b = m.get(s.id);
    return b ? { ...s, x: b.x, y: b.y, w: b.w, h: b.h } : s;
  });
}

export function addShowcase(l: ProfileLayout, type: ShowcaseType): { layout: ProfileLayout; id: string } {
  const meta = SHOWCASES[type];
  const id = `s-${type}-${Date.now().toString(36)}`;
  const spot = firstFit(l.items.map(toBox), id, meta.w, meta.h);
  const items = [...l.items, { id, type, x: spot.x, y: spot.y, w: spot.w, h: spot.h, settings: {} }];
  return { layout: { v: 1, items: applyBoxes(items, compact(items.map(toBox))) }, id };
}

/** A showcase's settings, kept to what it uses (and how long). */
function cleanSettings(type: ShowcaseType, raw: unknown): Record<string, unknown> | undefined {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  if (type === "about") return typeof r.text === "string" ? { text: r.text.slice(0, ABOUT_MAX) } : undefined;
  if (type === "featured") return typeof r.id === "string" && /^[a-z0-9-]{1,40}$/.test(r.id) ? { id: r.id } : undefined;
  return undefined;
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** A saved layout, cleaned up: unknown showcases dropped, one of each, sizes inside their limits, nothing overlapping. */
export function readProfileLayout(raw: unknown): ProfileLayout {
  const l = raw as { v?: number; items?: unknown[] } | null;
  if (!l || l.v !== 1 || !Array.isArray(l.items)) return DEFAULT_PROFILE_LAYOUT;
  const seen = new Set<string>();
  const ids = new Set<string>();
  const items: Showcase[] = [];
  for (const it of l.items.slice(0, 20) as Partial<Showcase>[]) {
    if (!it || typeof it.type !== "string" || !(it.type in SHOWCASES) || seen.has(it.type)) continue;
    seen.add(it.type);
    const meta = SHOWCASES[it.type as ShowcaseType];
    const w = Math.max(meta.limits.minW, Math.min(meta.limits.maxW, Math.round(num(it.w, meta.w))));
    const settings = cleanSettings(it.type as ShowcaseType, it.settings);
    const id = typeof it.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(it.id) && !ids.has(it.id) ? it.id : `s-${it.type}`;
    ids.add(id);
    items.push({
      id,
      type: it.type as ShowcaseType,
      w,
      h: Math.max(meta.limits.minH, Math.min(meta.limits.maxH, Math.round(num(it.h, meta.h)))),
      x: Math.max(0, Math.min(COLS - w, Math.round(num(it.x, 0)))),
      y: Math.max(0, Math.min(200, Math.round(num(it.y, 0)))),
      ...(it.fixed === true ? { fixed: true } : {}),
      ...(settings ? { settings } : {}),
    });
  }
  return { v: 1, items: applyBoxes(items, compact(items.map(toBox))) };
}
