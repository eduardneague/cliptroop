import { Skeleton } from "@/components/ui/skeleton";

/** Thumbnail Studio: header, tool buttons, variations on the left, the big preview. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="px-2.5 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center gap-2 flex-wrap" aria-hidden>
        <Skeleton className="h-4 w-12 mr-1" />
        <h1 className="text-[20px] sm:text-[24px] font-display font-semibold mr-2 text-ink-faint">Thumbnail Studio</h1>
        <span className="flex-1" />
        <Skeleton className="h-9 w-full sm:w-72 rounded-lg" />
        <Skeleton className="h-9 w-full sm:w-44 rounded-lg" />
      </div>
      <div className="flex items-center gap-2 flex-wrap" aria-hidden>
        {[96, 112, 112, 96, 104].map((w, i) => (
          <div key={i} className="skeleton h-9 rounded-lg" style={{ width: w }} />
        ))}
      </div>
      <div className="grid gap-3 sm:gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] items-start" aria-hidden>
        <div className="min-w-0 rounded-2xl border border-line/10 bg-surface p-2.5">
          <Skeleton className="h-3 w-40 mx-1.5 mb-3" />
          <div className="flex lg:flex-col gap-2 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex-shrink-0 w-[168px] sm:w-[220px] lg:w-auto rounded-xl border border-line/10 p-2 space-y-2">
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="w-full aspect-video max-h-[70vh] rounded-2xl" />
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
