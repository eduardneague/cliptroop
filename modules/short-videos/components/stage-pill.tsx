import { SHORT_STAGE_COLOR, SHORT_STAGE_LABELS, type ShortStage } from "../lib/constants";
import { wordColor } from "@/lib/word-color";

/** A short's step as a pill. 1.35.0: its tint sits on the card's colour, not see-through, so it reads the same on the
 * page's glass wash or a wallpaper as on a card. */
export function ShortStagePill({ stage, size = "sm" }: { stage: ShortStage; size?: "sm" | "md" }) {
  const c = SHORT_STAGE_COLOR[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-bold whitespace-nowrap ${
        size === "md" ? "text-[12px] px-2.5 py-1" : "text-[10.5px] px-2 py-0.5"
      }`}
      style={{ color: wordColor(c), background: `color-mix(in srgb, ${c} 14%, rgb(var(--surface)))` }}
    >
      <span className="w-1.5 h-1.5 rounded-[2px]" style={{ background: c }} aria-hidden />
      {SHORT_STAGE_LABELS[stage]}
    </span>
  );
}
