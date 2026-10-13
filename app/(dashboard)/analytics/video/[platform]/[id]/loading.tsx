import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** A video's analytics: back link, the video and its verdict, the tabs, key numbers, two charts. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1400px]">
      <div className="space-y-5" aria-hidden>
        <Skeleton className="h-5 w-40 rounded-md" />
        <div className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 flex flex-col sm:flex-row gap-5">
          <div className="skeleton rounded-xl w-full sm:w-[300px] aspect-video flex-shrink-0" />
          <div className="flex-1 space-y-3 pt-1">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-3.5 w-56" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-8 w-36 rounded-lg" />
              <Skeleton className="h-8 w-32 rounded-lg" />
            </div>
          </div>
          <div className="skeleton rounded-xl sm:w-[230px] h-[120px] flex-shrink-0" />
        </div>
        <Skeleton className="h-9 w-48 rounded-lg" />
        <div className="rounded-2xl border border-line/10 bg-surface grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`p-4 border-r border-b border-line/10 ${i > 3 ? "hidden lg:block" : ""}`}>
              <Skeleton className="h-3 w-20 mb-2.5" />
              <Skeleton className="h-6 w-16 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          {[0, 1].map((c) => (
            <div key={c} className="rounded-2xl border border-line/10 bg-surface p-5">
              <Skeleton className="h-4 w-40 mb-2" />
              <Skeleton className="h-3 w-56 mb-5" />
              <div className="flex items-end gap-2 h-[200px]">
                {[30, 45, 60, 52, 70, 64, 80, 72, 85, 90].map((h, i) => (
                  <div key={i} className="skeleton flex-1 max-w-[24px] mx-auto rounded-t-[4px]" style={{ height: `${c ? 100 - h : h}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
