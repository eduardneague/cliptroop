"use client";

import { CheckIcon } from "@/components/ui/icons";
import { ScrollToCurrent } from "@/components/ui/scroll-to-current";
import { SHORT_STAGES, SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";
import { STAGE_STATE_COLOR } from "@/modules/long-videos/lib/stages";
import type { ShortStage } from "@/modules/short-videos/lib/constants";
import { PendingLink, usePendingNav } from "@/components/ui/pending-nav";

/**
 * The short's steps. Done and current steps can be clicked to look back
 * at them (without changing the stage). The step you're on gets a small
 * dot under its name; a step you're looking back at also gets a soft halo.
 * Inside <PendingNav>: a clicked step lights up at once (its cards turn into
 * a skeleton until they're there).
 */
export function StageTracker({
  shortId,
  stage,
  shown: shownProp,
  viewing: viewingProp,
}: {
  shortId: string;
  stage: ShortStage;
  shown: ShortStage;
  viewing: boolean;
}) {
  const currentIndex = SHORT_STAGES.indexOf(stage);
  // The step on its way counts as shown already.
  const pending = usePendingNav().pending as ShortStage | null;
  const shown = pending ?? shownProp;
  const viewing = pending ? pending !== stage : viewingProp;
  return (
  <ScrollToCurrent className="flex items-center mb-6 overflow-x-auto no-scrollbar pb-1">
    {SHORT_STAGES.map((s, i) => {
      const allDone = stage === "posted";
      const state = allDone || i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
      const c = STAGE_STATE_COLOR[state];
      const on = state !== "upcoming";
      return (
        <div key={s} className="flex items-center flex-shrink-0" data-current={state === "current" ? "true" : undefined}>
          <StepLink
            stage={s}
            href={state === "upcoming" ? null : s === stage ? `/shorts/${shortId}` : `/shorts/${shortId}?view=${s}`}
            selected={s === shown}
            label={SHORT_STAGE_LABELS[s]}
          >
            <div
              className={`rounded-full flex items-center justify-center font-bold border-2 ${
                state === "current" ? "w-8 h-8 text-[12px] current-stage-pulse" : "w-7 h-7 text-[11px]"
              }`}
              style={{
                borderColor: on ? c : "rgb(var(--line) / 0.2)",
                background: on ? c : "transparent",
                color: on ? "#fff" : "rgb(var(--ink-faint))",
                // Looking back at this step: a soft halo in its own color.
                boxShadow: viewing && s === shown ? `0 0 0 4px color-mix(in srgb, ${c} 28%, transparent)` : undefined,
                transition: "box-shadow .3s var(--ease-out)",
              }}
            >
              {state === "done" ? <CheckIcon className="w-4 h-4" /> : i + 1}
            </div>
            <span
              className={`text-[10.5px] whitespace-nowrap transition-colors ${
                s === shown ? "font-extrabold text-ink" : on ? "font-bold text-ink-soft group-hover:text-ink" : "font-bold text-ink-faint"
              }`}
            >
              {SHORT_STAGE_LABELS[s]}
            </span>
          </StepLink>
          {i < SHORT_STAGES.length - 1 && (
            <div
              className="w-6 sm:w-10 h-[2px] mb-7"
              style={{ background: allDone || i + 1 <= currentIndex ? STAGE_STATE_COLOR.done : "rgb(var(--line) / 0.15)" }}
            />
          )}
        </div>
      );
    })}
  </ScrollToCurrent>
  );
}

function StepLink({ stage, href, selected, label, children }: { stage: ShortStage; href: string | null; selected: boolean; label: string; children: React.ReactNode }) {
  const inner = (
    <>
      {children}
      <span
        aria-hidden
        className={`h-1 rounded-full bg-amber transition-all duration-300 ${selected ? "w-4 opacity-100" : "w-0 opacity-0"}`}
      />
    </>
  );
  const cls = "group flex flex-col items-center gap-1.5 min-w-[78px] pt-1 pb-0.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber";
  if (!href) return <div className={cls}>{inner}</div>;
  return (
    <PendingLink href={href} navKey={stage} className={cls} aria-label={`View the ${label} step`} aria-current={selected ? "step" : undefined}>
      {inner}
    </PendingLink>
  );
}
