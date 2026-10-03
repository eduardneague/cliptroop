import { Skeleton, SkeletonBack, SkeletonLines, SkeletonPage, SkeletonPersonRow, SkeletonSteps } from "@/components/ui/skeleton";
import { STAGE_LABELS, STAGE_ORDER } from "@/modules/long-videos/lib/stages";

/** One long video: title, the steps bar, the step's work on the left, notes on the right. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1400px]">
      <SkeletonBack label="Long videos" />

      <div className="flex items-start gap-3 mb-1.5" aria-hidden>
        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <Skeleton className="h-5 w-9" />
          <Skeleton className="h-8 sm:h-9 w-[520px] max-w-full" />
        </div>
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>

      <div className="flex items-center gap-2 mb-4" aria-hidden>
        <Skeleton className="h-7 w-28 rounded-lg" />
        <Skeleton className="h-7 w-32 rounded-lg" />
      </div>

      <SkeletonSteps labels={STAGE_ORDER.map((s) => STAGE_LABELS[s])} />

      <div className="flex items-center gap-2 flex-wrap mb-6" aria-hidden>
        <Skeleton className="h-11 w-44 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6" aria-hidden>
        <div className="rounded-xl border border-line/10 bg-surface p-6 space-y-4">
          <div className="rounded-2xl border border-line/10 bg-surface-2/30 px-4 py-3 flex items-center gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 flex-1 max-w-xs" />
            <Skeleton className="ml-auto h-3 w-8" />
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface-2/20 p-4 sm:p-5">
            <Skeleton className="h-3.5 w-16 mb-4" />
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Skeleton className="w-5 h-5 rounded-full" />
                  <Skeleton className={`h-4 ${["w-3/4", "w-2/3", "w-1/2"][i]}`} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface-2/20 p-4 sm:p-5">
            <Skeleton className="h-3.5 w-12 mb-3" />
            <SkeletonLines lines={2} />
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface-2/20 p-4 sm:p-5">
            <Skeleton className="h-3.5 w-36 mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="aspect-video rounded-lg" />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-line/10 bg-surface p-5 self-start">
          <Skeleton className="h-3.5 w-24 mb-3" />
          {[0, 1, 2].map((i) => (
            <SkeletonPersonRow key={i} />
          ))}
          <Skeleton className="h-20 w-full rounded-xl mt-4" />
        </div>
      </div>
    </SkeletonPage>
  );
}
