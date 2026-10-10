import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Objectives: the title, the summary with its rings, the filters, a section of cards. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1500px]" className="px-4 sm:px-8 py-5 sm:py-8">
      <div className="flex items-start gap-3 flex-wrap mb-5" aria-hidden>
        <div className="flex-1">
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold">Objectives</h1>
          <Skeleton className="h-4 w-80 max-w-full mt-3" />
        </div>
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="rounded-3xl border border-line/10 bg-surface p-4 sm:p-6 mb-5 flex flex-col sm:flex-row gap-6 items-center" aria-hidden>
        <Skeleton className="w-[136px] h-[136px] sm:w-[168px] sm:h-[168px] rounded-full flex-shrink-0" />
        <div className="flex-1 w-full space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-line/10 bg-surface-2/40 px-3 py-2.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-10 mt-1.5" />
                <Skeleton className="h-2.5 w-20 mt-1.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-5" aria-hidden>
        {["w-12", "w-24", "w-20", "w-20", "w-20"].map((w, i) => (
          <Skeleton key={i} className={`h-8 ${w} rounded-full`} />
        ))}
      </div>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px] items-start" aria-hidden>
        <div>
          <Skeleton className="h-6 w-40 mb-3" />
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-line/10 bg-surface p-5">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56 max-w-full" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-8 w-24 mt-4" />
                <Skeleton className="h-2.5 w-full mt-3 rounded-full" />
                <Skeleton className="h-3 w-48 mt-2" />
                <Skeleton className="h-12 w-full mt-5" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-line/10 bg-surface p-4">
          <h2 className="text-[14.5px] font-semibold">Recent wins</h2>
          <Skeleton className="h-3 w-48 mt-1.5 mb-3" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5 py-2">
              <Skeleton className="w-7 h-7 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
