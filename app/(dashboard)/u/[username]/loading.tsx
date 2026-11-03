import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Someone's profile (1.28.0): the header with picture, name and level, then the showcases. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1120px]" className="px-3 sm:px-5 xl:px-6 py-4 sm:py-6 space-y-4">
      <div className="rounded-2xl border border-line/10 bg-surface p-5 sm:p-7" aria-hidden>
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex items-center gap-5 flex-1 min-w-0">
            <Skeleton className="w-[104px] h-[104px] rounded-full flex-shrink-0" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 w-full max-w-md" />
            </div>
          </div>
          <Skeleton className="h-[104px] md:w-64 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3" aria-hidden>
        <Skeleton className="h-[204px] md:col-span-4 rounded-xl" />
        <Skeleton className="h-[204px] md:col-span-8 rounded-xl" />
        <Skeleton className="h-[204px] md:col-span-12 rounded-xl" />
      </div>
    </SkeletonPage>
  );
}
