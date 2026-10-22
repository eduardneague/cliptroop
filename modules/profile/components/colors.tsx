"use client";

import type { CSSProperties } from "react";
import { COLOR_PRESETS, colorCss, colorName, isColorHex, type ProfileColor, type ProfileColors } from "@/lib/profile/colors";
import { levelTint, type FrameId } from "@/lib/profile/progress";
import { LevelBadge, ProfileAvatar, XpBar } from "./parts";

/*
 * Customize profile → Colours (1.29.5): a row of choices for each colour
 * (your level's, the theme's, a dozen to pick from, your own; the glow can
 * be off), and a small header showing them together. Only CSS colours
 * change: nothing new to load or redraw.
 */

const OWN_START = "#e8630d";

/** One colour to pick. `level`: the level's colour (shown on its choice). */
export function ColorRow({
  label,
  hint,
  value,
  level,
  canBeOff = false,
  onChange,
}: {
  label: string;
  hint?: string;
  value: ProfileColor;
  level: string;
  canBeOff?: boolean;
  onChange: (v: ProfileColor) => void;
}) {
  const own = isColorHex(value) && !COLOR_PRESETS.some((p) => p.hex === value);
  const pill = (v: ProfileColor, text: string) => {
    const on = value === v;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => onChange(v)}
        className={`inline-flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 h-7 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
          on ? "border-ink/70 bg-surface-2 text-ink" : "border-line/20 text-ink-soft hover:text-ink hover:border-line/40"
        }`}
      >
        {v === "off" ? <span className="pf-dot pf-dot-off" aria-hidden /> : <span className="pf-dot" style={{ background: colorCss(v, level) }} aria-hidden />}
        {text}
      </button>
    );
  };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-[11.5px] text-ink-faint truncate">{colorName(value)}</span>
      </div>
      {hint && <p className="text-[11.5px] text-ink-faint leading-snug">{hint}</p>}
      <div role="radiogroup" aria-label={label} className="mt-2 flex flex-wrap items-center gap-1.5">
        {canBeOff && pill("off", "Off")}
        {pill("level", "Level")}
        {pill("theme", "Theme")}
        {COLOR_PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            role="radio"
            aria-checked={value === p.hex}
            aria-label={p.name}
            title={p.name}
            onClick={() => onChange(p.hex)}
            className="pf-swatch"
            style={{ "--c": p.hex } as CSSProperties}
          />
        ))}
        <span className="pf-swatch pf-swatch-own" data-on={own ? "" : undefined} style={own ? ({ "--c": value } as CSSProperties) : undefined} title="Your own colour">
          <input type="color" aria-label="Your own colour" value={own ? value : OWN_START} onChange={(e) => onChange(e.target.value.toLowerCase())} />
        </span>
      </div>
    </div>
  );
}

/** The header in small: your picture in its frame, your level and XP bar, over the glow. */
export function ColorsPreview({
  person,
  level,
  share,
  frame,
  colors,
}: {
  person: { name: string; avatarUrl: string | null; color: string };
  level: number;
  share: number;
  frame: FrameId;
  colors: ProfileColors;
}) {
  const hex = levelTint(level);
  return (
    <div
      className="prof-head relative rounded-xl border border-line/10 bg-surface p-4 overflow-hidden"
      data-glow={colors.glow === "off" ? "off" : undefined}
      style={{ "--pg": colorCss(colors.glow, hex) } as CSSProperties}
      aria-hidden
    >
      <div className="relative flex items-center gap-4">
        <ProfileAvatar url={person.avatarUrl} name={person.name} color={person.color} size={60} frame={frame} tint={colorCss(colors.frame, hex)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <LevelBadge level={level} size={26} />
            <span className="font-display text-[16px] font-semibold truncate">{person.name}</span>
          </div>
          {/* At least a fifth full, so its colour shows. */}
          <XpBar share={Math.max(share, 0.2)} tint={colorCss(colors.bar, hex)} className="mt-2.5" />
        </div>
      </div>
    </div>
  );
}
