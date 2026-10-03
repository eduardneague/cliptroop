import Link from "next/link";
import { CheckIcon } from "@/components/ui/icons";
import { ScrollToCurrent } from "@/components/ui/scroll-to-current";
import type { PipelineStage } from "@/lib/permissions/roles";
import { STAGE_LABELS, STAGE_ORDER, STAGE_STATE_COLOR, stageState } from "@/modules/long-videos/lib/stages";

/**
 * The long video's steps, which are also its tabs. Any step can be opened
 * at any time (done, current or upcoming) without moving the video. The
 * step you're viewing gets a small dot; the current step pulses.
 */
export function LongStepBar({ projectId, stage, tab }: { projectId: string; stage: PipelineStage; tab: PipelineStage }) {
  return (
    <ScrollToCurrent className="flex items-start mb-6 overflow-x-auto no-scrollbar pb-1 scroll-smooth">
      {STAGE_ORDER.map((s, i) => {
        const state = stageState(s, stage);
        const on = state !== "upcoming";
        const current = state === "current" && stage !== "done";
        const color = STAGE_STATE_COLOR[state];
        const selected = s === tab;
        return (
          <div key={s} className="flex items-start flex-shrink-0" data-current={selected ? "true" : undefined}>
            <Link
              href={`/videos/${projectId}?tab=${s}`}
              scroll={false}
              aria-current={selected ? "step" : undefined}
              className="group flex flex-col items-center gap-1.5 min-w-[70px] sm:min-w-[80px] pt-1 pb-0.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            >
              <span
                className={`rounded-full flex items-center justify-center font-bold border-2 transition-all ${current ? "w-8 h-8 text-[12px] current-stage-pulse" : "w-7 h-7 text-[11px]"}`}
                style={{
                  borderColor: on ? color : "rgb(var(--line) / 0.25)",
                  background: on ? color : "transparent",
                  color: on ? "#fff" : "rgb(var(--ink-faint))",
                  boxShadow: selected && !current ? `0 0 0 4px color-mix(in srgb, ${on ? color : "rgb(var(--ink-faint))"} 25%, transparent)` : undefined,
                }}
              >
                {state === "done" || (s === "done" && stage === "done") ? <CheckIcon className="w-4 h-4" /> : i + 1}
              </span>
              <span
                className={`text-[11px] whitespace-nowrap transition-colors ${
                  selected ? "font-extrabold text-ink" : on ? "font-bold text-ink-soft group-hover:text-ink" : "font-bold text-ink-faint group-hover:text-ink-soft"
                }`}
              >
                {STAGE_LABELS[s]}
              </span>
              <span aria-hidden className={`h-1 rounded-full bg-amber transition-all duration-300 ${selected ? "w-4 opacity-100" : "w-0 opacity-0"}`} />
            </Link>
            {i < STAGE_ORDER.length - 1 && (
              <span
                aria-hidden
                className="w-5 sm:w-7 h-[2px] mt-[19px] flex-shrink-0"
                style={{ background: stageState(STAGE_ORDER[i + 1], stage) !== "upcoming" ? STAGE_STATE_COLOR.done : "rgb(var(--line) / 0.15)" }}
              />
            )}
          </div>
        );
      })}
    </ScrollToCurrent>
  );
}
