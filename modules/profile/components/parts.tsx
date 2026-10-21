"use client";

import type { CSSProperties } from "react";
import { initialsFor } from "@/lib/avatar";
import { levelShape, levelTint, TIER_LABEL, type AchievementIcon, type AchievementState, type FrameId } from "@/lib/profile/progress";
import { AppsIcon, ArchiveIcon, BookIcon, CameraIcon, CheckIcon, ClockIcon, EyeIcon, FlameIcon, LockIcon, PostingIcon, ScissorsIcon, SearchIcon, StarIcon, TargetIcon, TrophyIcon, UsersIcon } from "@/components/ui/icons";

/*
 * The small pieces of a profile (1.28.0): the picture in its frame, the level
 * badge, the XP bar and achievement medallions. Frames and badges are drawn
 * in globals.css (.pf-*), in the level's colour; the moving ones stand still
 * when animations are off.
 */

/** Your picture, in the frame you picked (unlocked by your level). `tint`: the frame's colour (your level's). */
export function ProfileAvatar({ url, name, color, size, frame = "none", tint }: { url: string | null; name: string; color: string; size: number; frame?: FrameId; tint: string }) {
  return (
    <span className="pf-avatar" data-frame={frame} style={{ "--s": `${size}px`, "--pf": tint } as CSSProperties}>
      {frame !== "none" && <span className="pf-ring" aria-hidden />}
      <span className="pf-img" style={{ background: color, fontSize: size * 0.32 }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" decoding="async" className="w-full h-full object-cover" />
        ) : (
          initialsFor(name)
        )}
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

const ICONS: Record<AchievementIcon, (p: { className?: string }) => React.ReactNode> = {
  check: CheckIcon,
  flame: FlameIcon,
  trophy: TrophyIcon,
  clock: ClockIcon,
  book: BookIcon,
  scissors: ScissorsIcon,
  camera: CameraIcon,
  search: SearchIcon,
  eye: EyeIcon,
  archive: ArchiveIcon,
  posting: PostingIcon,
  target: TargetIcon,
  star: StarIcon,
  users: UsersIcon,
  apps: AppsIcon,
};

export const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/** One achievement as a medallion: its tier's colours when reached; grey with how far along when not. */
export function AchievementBadge({ a, size = 44 }: { a: AchievementState; size?: number }) {
  const Icon = ICONS[a.icon];
  const title = a.unlocked ? `${a.name}: ${a.text}. ${TIER_LABEL[a.tier]}, reached ${shortDate(a.at)}.` : `${a.name}: ${a.text}. ${a.have} of ${a.goal}.`;
  return (
    <span className="pf-medal" data-tier={a.tier} data-locked={a.unlocked ? undefined : ""} style={{ "--ms": `${size}px`, "--mp": `${(a.have / a.goal) * 360}deg` } as CSSProperties} title={title} role="img" aria-label={title}>
      <span className="pf-medal-face">
        <Icon className="w-[45%] h-[45%]" />
      </span>
      {!a.unlocked && (
        <span className="pf-medal-lock" aria-hidden>
          <LockIcon className="w-2.5 h-2.5" />
        </span>
      )}
    </span>
  );
}
