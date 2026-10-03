import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Someone's profile: the card with avatar and bio, then teams in common. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-2xl" className="px-4 sm:px-10 py-5 sm:py-9 space-y-6">
      <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8" aria-hidden>
        <div className="flex items-start gap-5 flex-wrap">
          <Skeleton className="w-20 h-20 rounded-full flex-shrink-0" />
          <div className="min-w-0 flex-1 space-y-2.5 pt-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3.5 w-24" />
            <div className="space-y-2 pt-1 max-w-md">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
            <Skeleton className="h-3 w-28 !mt-4" />
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8" aria-hidden>
        <Skeleton className="h-3.5 w-32 mb-5" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-line/10 px-3.5 py-2.5">
              <Skeleton className="w-9 h-9 rounded-lg" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
