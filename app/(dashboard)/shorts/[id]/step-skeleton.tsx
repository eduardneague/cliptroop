import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import { SHORT_STAGE_LABELS, type ShortStage } from "@/modules/short-videos/lib/constants";

/**
 * A short's step while it loads (clicking a step in the tracker, or the
 * whole page loading): the same cards that step shows, in the same places.
 * `current` = where the short really is; any other step is "looking back"
 * (the amber banner instead of the action buttons).
 */
export function ShortStepSkeleton({ step, current }: { step: ShortStage; current: ShortStage | null }) {
  const viewing = !!current && step !== current;
  const posting = step === "ready" || step === "posted";
  return (
    <div aria-hidden>
      {viewing ? (
        <div className="mb-5 flex items-center gap-3 flex-wrap rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
          <span className="text-[13.5px]">
            Viewing the <b>{SHORT_STAGE_LABELS[step]}</b> step. This short is in <b>{SHORT_STAGE_LABELS[current!]}</b>.
          </span>
          <span className="flex-1" />
          <span className="rounded-lg bg-amber text-white font-bold px-3.5 h-9 inline-flex items-center text-[13px] opacity-80">Back to current</span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 flex-wrap mb-6">
          <Skeleton className="h-11 w-48 rounded-xl" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      )}

      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 sm:gap-6">
        <div className="flex flex-col gap-5 sm:gap-6 min-w-0">
          {posting && <PostingSkeleton />}
          {(step === "script" || step === "editing") && (
            <Card title="Script" prominent={step === "script" && !viewing}>
              <SkeletonLines lines={3} className="mb-3" />
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
            </Card>
          )}
          {step !== "script" && (
            <Card title="Video" prominent={step === "editing" && !viewing}>
              <Skeleton className="h-4 w-40 mb-1.5" />
              <Skeleton className="h-3 w-56 max-w-full mb-3" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-28 rounded-lg" />
                <Skeleton className="h-9 w-32 rounded-lg" />
              </div>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-5 sm:gap-6">
          {step === "review" && !viewing && (
            <section className="rounded-2xl border border-amber/40 bg-amber/[0.06] p-5">
              <h2 className="text-[12px] font-bold uppercase tracking-wide text-amber mb-3">In review</h2>
              <SkeletonLines lines={2} className="mb-4" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </section>
          )}
          {/* Phones: Activity is a folded row; computers: the full card. */}
          <Skeleton className="h-12 w-full rounded-2xl lg:hidden" />
          <section className="hidden lg:block rounded-2xl border border-line/10 bg-surface p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-4">Activity</h2>
            <div className="space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-6 h-6 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5 pt-0.5">
                    <Skeleton className={`h-3 ${["w-48", "w-40", "w-52", "w-36"][i]}`} />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Card({ title, prominent, children }: { title: string; prominent: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl bg-surface p-4 sm:p-5 ${prominent ? "border border-amber" : "border border-line/10"}`}>
      <h2 className={`text-[11px] font-bold uppercase tracking-wide mb-3 ${prominent ? "text-amber" : "text-ink-soft"}`}>{title}</h2>
      {children}
    </section>
  );
}

function PostingSkeleton() {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-5 space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Posting</h2>
        <span className="flex-1" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-line/10 px-3 py-3">
          <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className={`h-3.5 ${["w-28", "w-32", "w-24"][i]}`} />
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </section>
  );
}
