import { Skeleton, SkeletonBack, SkeletonLines, SkeletonPage, SkeletonPersonRow, SkeletonSteps } from "@/components/ui/skeleton";
import { SHORT_STAGES, SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";

/** One short: title, its steps, the step's actions, then the two columns. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1200px]">
      <SkeletonBack label="Short videos" />

      <div className="flex items-start gap-3 mb-2" aria-hidden>
        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-8 sm:h-9 w-[440px] max-w-full" />
        </div>
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-5" aria-hidden>
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-md" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-24" />
      </div>

      <SkeletonSteps labels={SHORT_STAGES.map((s) => SHORT_STAGE_LABELS[s])} />

      <div className="flex items-center gap-2 flex-wrap mb-6" aria-hidden>
        <Skeleton className="h-11 w-48 rounded-xl" />
        <Skeleton className="h-11 w-32 rounded-xl" />
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 sm:gap-6" aria-hidden>
        <div className="space-y-5 sm:space-y-6 min-w-0">
          <Panel>
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-4 w-28" />
              <span className="flex-1" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </Panel>
          <Panel>
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-4 w-20" />
              <span className="flex-1" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
            <SkeletonLines lines={4} />
          </Panel>
          <Panel>
            <Skeleton className="h-4 w-16 mb-4" />
            <Skeleton className="aspect-[16/7] w-full rounded-xl" />
          </Panel>
        </div>
        <div className="space-y-5 sm:space-y-6">
          <Panel>
            <Skeleton className="h-4 w-20 mb-4" />
            <SkeletonLines lines={2} className="mb-4" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </Panel>
          <Panel>
            <Skeleton className="h-4 w-16 mb-2" />
            {[0, 1, 2, 3].map((i) => (
              <SkeletonPersonRow key={i} />
            ))}
          </Panel>
        </div>
      </div>
    </SkeletonPage>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line/10 bg-surface p-5">{children}</div>;
}
