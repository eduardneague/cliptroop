"use client";

import { useState } from "react";
import { CheckIcon, FrameIcon } from "@/components/ui/icons";
import { wordColor } from "@/lib/word-color";
import { chipCss, COLOR_CSS, COLOR_NAME, FRAME_COLORS, type ChipColor, type FrameColor } from "../lib/categories";
import { fillsTile, type FrameGuide } from "../lib/model";

/*
 * Frame Guides' small parts (1.54.0), the same on the page, in a script's picker and in a script: a frame's picture
 * (its own colour while it loads, the whole frame when it isn't 16:9), its number, a category, a colour.
 */

/** A frame's picture in a box of the given shape (16:9 by default). */
export function FramePicture({
  f,
  big = false,
  className = "",
  rounded = "rounded-xl",
  fit,
  eager = false,
}: {
  f: Pick<FrameGuide, "thumb" | "url" | "w" | "h" | "tint" | "title" | "number">;
  /** The full picture (a viewer), not the small one. */
  big?: boolean;
  className?: string;
  rounded?: string;
  /** contain: always the whole frame. */
  fit?: "cover" | "contain";
  eager?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const src = big ? f.url : f.thumb || f.url;
  const cover = fit ? fit === "cover" : fillsTile(f.w, f.h);
  return (
    <div
      className={`relative overflow-hidden isolate ${rounded} ${className}`}
      // Its own colour, then the picture fades in over it (a frame of another shape sits whole on it).
      style={{ background: f.tint ? `linear-gradient(180deg, ${f.tint}, color-mix(in srgb, ${f.tint} 70%, #000))` : "rgb(var(--surface-2))" }}
    >
      {src && state !== "error" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={f.title || `Frame #${f.number}`}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          className={`absolute inset-0 w-full h-full ${cover ? "object-cover" : "object-contain"} transition-opacity duration-300 ${state === "ok" ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {state === "error" && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/80 text-[11.5px] font-semibold bg-black/40">
          <FrameIcon className="w-5 h-5" />
          Picture missing
        </span>
      )}
    </div>
  );
}

/** "#12" on a picture (fixed colours: it sits on the picture, whatever the theme). */
export function FrameNumber({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md bg-black/65 text-white px-1.5 h-[22px] text-[11.5px] font-bold tabular-nums tracking-tight shadow-sm backdrop-blur-[2px] ${className}`}>
      #{n}
    </span>
  );
}

/** A category as a chip: on (filled with its colour's tint), or not. */
export function CategoryChip({
  name,
  color,
  on = false,
  count,
  onClick,
  size = "md",
  title,
  pop = false,
}: {
  name: string;
  color: ChipColor;
  /** Just turned on by a click: its tick pops in (not when it's simply drawn on). */
  pop?: boolean;
  on?: boolean;
  count?: number;
  onClick?: () => void;
  size?: "sm" | "md";
  title?: string;
}) {
  const c = chipCss(color);
  // 1.54.1: the same size on or off (the dot and the tick share one slot: the owner, "clicking these changes the
  // layout"), and it shows it was pressed (it gives a little, the tick pops in).
  const cls = `fg-chip inline-flex items-center gap-1.5 rounded-lg ${size === "sm" ? "px-1.5 h-6 text-[11.5px]" : "px-2.5 h-8 text-[12.5px]"} font-semibold whitespace-nowrap transition-[color,background-color,box-shadow,transform] duration-200 ease-out`;
  const style = on
    ? { color: wordColor(c), background: `color-mix(in srgb, ${c} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 45%, transparent)` }
    : undefined;
  const inner = (
    <>
      <span className="relative w-3 h-3 flex-shrink-0 flex items-center justify-center" aria-hidden>
        {on ? <CheckIcon key="on" className={`w-3 h-3 ${pop ? "fg-tick" : ""}`} /> : <span key="off" className="w-2 h-2 rounded-[3px]" style={{ background: c }} />}
      </span>
      <span className="truncate">{name}</span>
      {count !== undefined && <span className={`tabular-nums text-[11px] ${on ? "" : "text-ink-faint"}`}>{count}</span>}
    </>
  );
  if (!onClick)
    return (
      <span className={`${cls} ${on ? "" : "bg-surface-2 text-ink-soft"}`} style={style} title={title}>
        {inner}
      </span>
    );
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={`${cls} active:scale-[0.94] ${on ? "" : "bg-surface-2 text-ink-soft hover:text-ink ring-1 ring-inset ring-line/10 hover:ring-line/25"}`}
      style={style}
    >
      {inner}
    </button>
  );
}

/** A collection's colour. */
export function ColorDot({ color, className = "w-2.5 h-2.5" }: { color: FrameColor; className?: string }) {
  return <span className={`rounded-full flex-shrink-0 ${className}`} style={{ background: COLOR_CSS[color] }} aria-hidden />;
}

/** Picking a colour (collections, categories). */
export function ColorChoice({ value, onChange, label = "Colour" }: { value: FrameColor; onChange: (c: FrameColor) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {FRAME_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={COLOR_NAME[c]}
          title={COLOR_NAME[c]}
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${value === c ? "ring-2 ring-offset-2 ring-offset-surface" : ""}`}
          style={{ background: COLOR_CSS[c], ["--tw-ring-color" as string]: COLOR_CSS[c] }}
        >
          {value === c && <CheckIcon className="w-3.5 h-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

/** The frame-guide mark in Frame Guides' colour (an icon on a soft tile). */
export function FrameMark({ className = "w-9 h-9", icon = "w-[18px] h-[18px]" }: { className?: string; icon?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-xl flex-shrink-0 bg-amber/12 text-amber ${className}`} aria-hidden>
      <FrameIcon className={icon} />
    </span>
  );
}
