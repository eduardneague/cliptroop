import { Skeleton, SkeletonLines, SkeletonPage } from "@/components/ui/skeleton";
import { StatusPartsSkeleton } from "@/components/status/status-skeleton";

/** Developer: the title and buttons, the errors, the checks, then the bars. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-4xl" className="px-4 sm:px-8 py-6 sm:py-8 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap" aria-hidden>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] font-semibold">Developer</h1>
          <SkeletonLines lines={2} className="max-w-xl mt-1" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </header>
      <section className="rounded-2xl border border-line/10 bg-surface px-4 sm:px-5 py-4" aria-hidden>
        <Skeleton className="h-3 w-20 mb-2" />
        <SkeletonLines lines={1} className="mb-3" />
        {[0, 1].map((i) => (
          <div key={i} className="flex items-start gap-3 py-3 border-t border-line/10">
            <div className="flex-1 space-y-2">
              <Skeleton className={`h-3.5 ${i ? "w-1/2" : "w-2/3"}`} />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        ))}
      </section>
      <section className="rounded-2xl border border-line/10 bg-surface px-4 sm:px-5 py-2" aria-hidden>
        <Skeleton className="h-3 w-24 mt-3 mb-1" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-line/10 last:border-none">
            <Skeleton className="w-2.5 h-2.5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className={`h-3.5 ${["w-32", "w-40", "w-28", "w-56", "w-36", "w-24"][i]}`} />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </section>
      <div aria-hidden>
        <StatusPartsSkeleton rows={4} />
      </div>
    </SkeletonPage>
  );
}
