/**
 * What a change in your XP means (1.29.7): how much you gained, whether you
 * levelled up (and how many levels), the picture frames that unlocked on
 * the way, and whether your level's colour changed. Clip's "+40 XP" and
 * his level up card show it (modules/profile/components/xp-cheers.tsx).
 * Pure: no React, no database.
 */
import { FRAMES, levelFor, levelProgress, levelTint, type FrameId } from "./levels";

/** The level colours' names, in LEVEL_TINTS' order (a new one every 10 levels). */
export const LEVEL_TINT_NAMES = ["grey", "yellow", "lime", "green", "cyan", "blue", "purple", "pink", "red", "orange"];
export const levelTintName = (level: number) => LEVEL_TINT_NAMES[Math.floor(Math.max(0, Number.isFinite(level) ? level : 0) / 10) % 10];

export type XpChange = {
  before: number;
  after: number;
  gained: number;
  levelBefore: number;
  levelAfter: number;
  /** How far into the level, before and after (0–1). Before is 0 when the level changed. */
  shareBefore: number;
  shareAfter: number;
  /** XP still to go to the next level. */
  left: number;
  /** Frames unlocked by the levels gained, in order. */
  frames: { id: FrameId; name: string; level: number }[];
  /** The level's colour changed (it crossed a ten). */
  newColor: string | null;
};

/** Null when nothing was gained. */
export function xpChange(before: number, after: number): XpChange | null {
  if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) return null;
  const lb = levelFor(before);
  const la = levelFor(after);
  const pb = levelProgress(before);
  const pa = levelProgress(after);
  return {
    before,
    after,
    gained: after - before,
    levelBefore: lb,
    levelAfter: la,
    shareBefore: la > lb ? 0 : pb.share,
    shareAfter: pa.share,
    left: pa.left,
    frames: FRAMES.filter((f) => f.level > lb && f.level <= la),
    newColor: levelTint(la) !== levelTint(lb) ? levelTintName(la) : null,
  };
}

/** Two gains in a row shown as one: from the first's start to the second's end. */
export function mergeXp(a: XpChange | null, b: XpChange): XpChange {
  if (!a) return b;
  return xpChange(Math.min(a.before, b.before), Math.max(a.after, b.after)) ?? b;
}
