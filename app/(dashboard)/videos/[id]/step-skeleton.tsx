import { Skeleton, SkeletonLines, SkeletonPersonRow } from "@/components/ui/skeleton";
import type { PipelineStage } from "@/lib/permissions/roles";
import { STAGE_LABELS } from "@/modules/long-videos/lib/stages";

/**
 * A long video's step while it loads (clicking a step, or the whole page
 * loading): the step's work on the left, its notes on the right, in the
 * same places as the real thing. `current` = where the video really is
 * (null when unknown); `master` shows the move buttons the master gets.
 */
export function LongStepSkeleton({ step, current, master = false }: { step: PipelineStage; current: PipelineStage | null; master?: boolean }) {
  const viewing = !!current && step !== current;
  return (
    <div aria-hidden>
      {viewing && (
        <div className="mb-5 flex items-center gap-3 flex-wrap rounded-xl border border-amber/40 bg-amber/10 px-4 py-2.5">
          <span className="text-[13.5px]">
            Viewing the <b>{STAGE_LABELS[step]}</b> step. This video is in <b>{STAGE_LABELS[current!]}</b>.
          </span>
          <span className="flex-1" />
          <span className="rounded-lg bg-amber text-white font-bold px-3.5 h-9 inline-flex items-center text-[13px] opacity-80">Go to {STAGE_LABELS[current!]}</span>
        </div>
      )}
      {(current === null || (master && current !== "done")) && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-44 rounded-lg" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="rounded-xl border border-line/10 bg-surface p-6">{step === "ideate" ? <IdeaSkeleton /> : <WorkSkeleton step={step} />}</div>
        <div className="rounded-xl border border-line/10 bg-surface p-4 h-fit">
          <div className="text-[13px] font-display font-semibold mb-3">Notes &amp; Q&amp;A · {STAGE_LABELS[step]}</div>
          {[0, 1].map((i) => (
            <SkeletonPersonRow key={i} />
          ))}
          <Skeleton className="h-20 w-full rounded-xl mt-3" />
        </div>
      </div>
    </div>
  );
}

function IdeaSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line/10 bg-surface-2/30 px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Idea checklist</span>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className={`h-7 rounded-full ${["w-24", "w-16", "w-40", "w-20"][i]}`} />
        ))}
        <Skeleton className="ml-auto h-3 w-8" />
      </div>
      <Section title="Titles">
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="w-5 h-5 rounded-full" />
              <Skeleton className={`h-4 ${["w-3/4", "w-2/3", "w-1/2"][i]}`} />
            </div>
          ))}
        </div>
      </Section>
      <section className="rounded-2xl border border-amber/25 bg-amber/[0.05] p-4 sm:p-5">
        <h3 className="text-[13px] font-display font-semibold uppercase tracking-wide text-amber mb-2.5">Hook</h3>
        <SkeletonLines lines={2} />
      </section>
      <Section title="Thumbnail sketches">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      </Section>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Budget">
          <Skeleton className="h-3.5 w-2/3" />
        </Section>
        <Section title="Notes">
          <Skeleton className="h-3.5 w-1/2" />
        </Section>
      </div>
    </div>
  );
}

function WorkSkeleton({ step }: { step: PipelineStage }) {
  return (
    <div className="space-y-6">
      {step !== "done" && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2.5">{step === "script" ? "Scripters" : `People · ${STAGE_LABELS[step]}`}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-9 w-36 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-line/15 bg-surface-2/40 p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3.5 w-32" />
        <SkeletonLines lines={3} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface-2/20 p-4 sm:p-5">
      <h3 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-3">{title}</h3>
      {children}
    </section>
  );
}
