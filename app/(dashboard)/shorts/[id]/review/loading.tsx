import { Skeleton, SkeletonBack, SkeletonPage } from "@/components/ui/skeleton";

/** Review: the dark player on the left, the notes column on the right. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1500px]" className="px-4 sm:px-8 py-6">
      <SkeletonBack label="Back to the short" className="mb-3" />
      <div className="flex items-center gap-3 flex-wrap mb-5" aria-hidden>
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-7 w-80 max-w-[60vw]" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]" aria-hidden>
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-40 rounded-xl" />
            <span className="flex-1" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          <div className="rounded-2xl overflow-hidden bg-black ring-1 ring-white/5">
            <div className="h-[50vh] lg:h-[min(72vh,780px)] flex items-center justify-center">
              <div className="h-[86%] aspect-[9/16] rounded-xl bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
            </div>
            <div className="h-[84px] bg-[#0f0e0c]" />
          </div>
        </div>
        <aside className="hidden lg:flex flex-col rounded-2xl border border-line/10 bg-surface max-h-[calc(72vh+140px)]">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <span className="text-[12px] font-bold uppercase tracking-wide text-ink-faint">Notes</span>
            <span className="flex-1" />
            <Skeleton className="h-7 w-24 rounded-lg" />
          </div>
          <div className="px-4 pb-3 border-b border-line/10 flex gap-2.5">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="flex-1 h-16 rounded-xl" />
          </div>
          <div className="p-4 space-y-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-10 rounded-md" />
                  </div>
                  <Skeleton className={`h-3 ${["w-full", "w-4/5", "w-11/12", "w-2/3"][i]}`} />
                  {i % 2 === 0 && <Skeleton className="h-3 w-1/2" />}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </SkeletonPage>
  );
}
