import { SHORT_STAGE_COLOR, SHORT_STAGE_LABELS, type ShortStage } from "../lib/constants";

export function ShortStagePill({ stage, size = "sm" }: { stage: ShortStage; size?: "sm" | "md" }) {
  const c = SHORT_STAGE_COLOR[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-bold whitespace-nowrap ${
        size === "md" ? "text-[12px] px-2.5 py-1" : "text-[10.5px] px-2 py-0.5"
      }`}
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
    >
      <span className="w-1.5 h-1.5 rounded-[2px]" style={{ background: c }} aria-hidden />
      {SHORT_STAGE_LABELS[stage]}
    </span>
  );
}
