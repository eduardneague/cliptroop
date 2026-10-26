"use client";

import type { CSSProperties } from "react";
import { initialsFor } from "@/lib/avatar";
import { levelShape, levelTint, type FrameId } from "@/lib/profile/levels";
import { AvatarImg } from "@/components/ui/avatar-img";
import { onFill } from "@/lib/contrast";

/*
 * The small pieces of a profile (1.28.0): the picture in its frame, the level
 * badge and the XP bar (achievement medallions: achievements.tsx, 1.29.6).
 * Frames and badges are drawn in globals.css (.pf-*); the moving ones stand
 * still when animations are off.
 */

/** Your picture, in the frame you picked (unlocked by your level). `tint`: the frame's colour (your level's). */
export function ProfileAvatar({ url, name, color, size, frame = "none", tint }: { url: string | null; name: string; color: string; size: number; frame?: FrameId; tint: string }) {
  return (
    <span className="pf-avatar" data-frame={frame} style={{ "--s": `${size}px`, "--pf": tint } as CSSProperties}>
      {frame !== "none" && <span className="pf-ring" aria-hidden />}
      <span className="pf-img" style={{ background: color, "--pf-on": onFill(color), fontSize: size * 0.32 } as CSSProperties}>
        <AvatarImg src={url} fallback={initialsFor(name)} />
      </span>
      {frame === "laurel" && <Laurel />}
      {frame === "crown" && <Crown />}
    </span>
  );
}

function Laurel() {
  // Two branches of leaves curving up the sides.
  const leaves = Array.from({ length: 7 }, (_, i) => i);
  const side = (flip: boolean) => (
    <g transform={flip ? "translate(100 0) scale(-1 1)" : undefined}>
      <path d="M50 96 C 22 92, 6 70, 8 38" fill="none" stroke="var(--pf)" strokeWidth="1.6" strokeLinecap="round" />
      {leaves.map((i) => {
        const t = 0.12 + i * 0.13;
        const a = Math.PI * (0.52 + t * 0.62);
        const cx = 50 + Math.cos(a) * 44;
        const cy = 52 + Math.sin(a) * 44;
        const rot = (a * 180) / Math.PI + 70;
        return <ellipse key={i} cx={cx} cy={cy} rx="3.2" ry="7" fill="var(--pf)" opacity={0.75 + (i % 2) * 0.25} transform={`rotate(${rot} ${cx} ${cy})`} />;
      })}
    </g>
  );
  return (
    <svg className="pf-deco" viewBox="0 0 100 100" aria-hidden>
      {side(false)}
      {side(true)}
    </svg>
  );
}

function Crown() {
  return (
    <svg className="pf-crown" viewBox="0 0 40 24" aria-hidden>
      <path d="M3 21 L6 6 L14 14 L20 2 L26 14 L34 6 L37 21 Z" fill="var(--pf)" stroke="rgb(var(--surface))" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="20" cy="2.6" r="2" fill="rgb(var(--surface))" />
      <circle cx="6" cy="6.4" r="1.6" fill="rgb(var(--surface))" />
      <circle cx="34" cy="6.4" r="1.6" fill="rgb(var(--surface))" />
    </svg>
  );
}

/** A level badge: a circle in the level's colour (a new colour every 10 levels; a hexagon from 100). */
export function LevelBadge({ level, size = 40, className = "" }: { level: number; size?: number; className?: string }) {
  return (
    <span className={`pf-level ${className}`} data-shape={levelShape(level)} style={{ "--lv": levelTint(level), "--ls": `${size}px` } as CSSProperties} aria-label={`Level ${level}`}>
      <span>{level}</span>
    </span>
  );
}

/** How far into this level. */
export function XpBar({ share, tint, className = "" }: { share: number; tint: string; className?: string }) {
  return (
    <span className={`block h-2 rounded-full bg-line/15 overflow-hidden ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
      <span className="pf-xp block h-full rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${tint} 70%, white), ${tint})` }} />
    </span>
  );
}
