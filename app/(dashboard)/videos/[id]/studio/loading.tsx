import { Skeleton } from "@/components/ui/skeleton";

/** Thumbnail Studio: header, the thumbnails (a list on xl, a strip below), the preview card with its toolbar. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="px-3 sm:px-6 py-3 sm:py-4 space-y-3">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center gap-2.5" aria-hidden>
        <Skeleton className="w-9 h-9 rounded-lg flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-[19px] sm:text-[22px] font-display font-semibold leading-tight text-ink-faint">Thumbnail Studio</h1>
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-9 w-9 sm:w-24 rounded-lg" />
        <Skeleton className="h-9 w-12 sm:w-28 rounded-lg" />
      </div>
      <div className="grid gap-3 xl:gap-4 grid-cols-[minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] items-start" aria-hidden>
        <div className="min-w-0 rounded-2xl border border-line/10 bg-surface">
          <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
          <div className="flex xl:flex-col gap-2 xl:gap-1 overflow-hidden px-3 xl:px-2 pb-3 xl:pb-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex-shrink-0 w-[128px] xl:w-auto xl:flex xl:gap-2.5 xl:p-1.5">
                <Skeleton className="aspect-video w-full xl:w-[124px] rounded-lg flex-shrink-0" />
                <div className="hidden xl:block flex-1 space-y-1.5 pt-1">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-2xl border border-line/10 bg-surface overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 border-b border-line/10">
            <Skeleton className="h-9 w-full sm:w-80 rounded-lg" />
            <Skeleton className="h-9 w-40 rounded-lg" />
            <span className="flex-1" />
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
          <div className="p-2 sm:p-3 space-y-2">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="w-full aspect-video max-h-[70vh] rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
