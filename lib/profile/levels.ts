/**
 * Levels and picture frames (1.28.0; split from progress.ts in 1.32.2): the
 * numbers the app's frame needs on every page (Clip's "+40 XP" and level up
 * cards) without the achievements' words, which only the profile page needs.
 * The same numbers as the database (0093: vp_level_for, vp_level_floor,
 * vp_frame_level). Pure: no React, no database. progress.ts re-exports all
 * of it.
 */

/** XP from one level to the next. */
export const xpToNext = (level: number): number => 100 * (1 + Math.floor(Math.max(0, level) / 10));

/** Total XP to reach a level (vp_level_floor). */
export function levelFloor(level: number): number {
  const l = Math.max(0, Math.floor(level));
  const a = Math.floor(l / 10);
  const b = l % 10;
  return 500 * a * (a + 1) + 100 * b * (a + 1);
}

/** The level for this much XP (vp_level_for). */
export function levelFor(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  let a = 0;
  while (500 * (a + 1) * (a + 2) <= xp) a++;
  return a * 10 + Math.min(9, Math.floor((xp - 500 * a * (a + 1)) / (100 * (a + 1))));
}

export function levelProgress(xp: number) {
  const level = levelFor(xp);
  const floor = levelFloor(level);
  const need = xpToNext(level);
  const into = Math.max(0, xp - floor);
  return { level, floor, next: floor + need, into, need, left: need - into, share: Math.min(1, into / need) };
}

/**
 * A level's colour, a new one every 10 levels, like Steam's badges (1.29.5:
 * the owner's order, grey to 9, then yellow, then on round the colour wheel:
 * lime, green, cyan, blue, purple, pink, red, orange). From 100 the badge is
 * a hexagon and the colours go round again.
 */
export const LEVEL_TINTS = ["#8b93a1", "#e2a300", "#7cb342", "#30a46c", "#00a2c7", "#3e63dd", "#8e4ec6", "#d6409f", "#e5484d", "#f76b15"];
export const levelTint = (level: number): string => LEVEL_TINTS[Math.floor(Math.max(0, Number.isFinite(level) ? level : 0) / 10) % 10];
/** From level 100 the badge is a hexagon. */
export const levelShape = (level: number): "circle" | "hexagon" => (level >= 100 ? "hexagon" : "circle");

// Picture frames ---------------------------------------------------------------------

export type FrameId = "none" | "ring" | "dashed" | "glow" | "duo" | "orbit" | "sunburst" | "laurel" | "prism" | "crown";
/** In the order they unlock (vp_frame_level). */
export const FRAMES: { id: FrameId; name: string; level: number }[] = [
  { id: "none", name: "No frame", level: 0 },
  { id: "ring", name: "Ring", level: 1 },
  { id: "dashed", name: "Turntable", level: 3 },
  { id: "glow", name: "Glow", level: 5 },
  { id: "duo", name: "Duo", level: 8 },
  { id: "orbit", name: "Orbit", level: 12 },
  { id: "sunburst", name: "Sunburst", level: 16 },
  { id: "laurel", name: "Laurel", level: 20 },
  { id: "prism", name: "Prism", level: 30 },
  { id: "crown", name: "Crown", level: 50 },
];
export const isFrameId = (v: unknown): v is FrameId => typeof v === "string" && FRAMES.some((f) => f.id === v);
export const frameLevel = (id: FrameId): number => FRAMES.find((f) => f.id === id)?.level ?? 0;
