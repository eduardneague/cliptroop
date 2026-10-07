import { Skeleton, SkeletonBack } from "@/components/ui/skeleton";

/**
 * The script workspace while it opens: top bar, formatting toolbar, the
 * versions rail and a sheet of paper with lines shimmering in. Shared by
 * the short and long video script pages.
 */
export function ScriptSkeleton({ backLabel }: { backLabel: string }) {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="min-h-[calc(100dvh-3.5rem)] flex flex-col">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 h-14 border-b border-line/10" aria-hidden>
        <SkeletonBack label={backLabel} className="flex-shrink-0 [&>span]:hidden sm:[&>span]:inline" />
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <Skeleton className="h-3.5 w-8" />
          <Skeleton className="h-3.5 w-48 max-w-[40vw]" />
        </div>
        <Skeleton className="hidden md:block h-3 w-28" />
        <Skeleton className="hidden sm:block h-8 w-[108px] rounded-lg" />
        <Skeleton className="hidden sm:block h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>

      <div className="border-b border-line/10" aria-hidden>
        <div className="mx-auto max-w-5xl px-2 sm:px-6 py-1.5 flex items-center gap-1.5 overflow-hidden">
          <Skeleton className="h-9 w-28 sm:w-36 rounded-lg flex-shrink-0" />
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className={`h-8 w-8 rounded-lg flex-shrink-0 ${i > 5 ? "hidden sm:block" : ""}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0" aria-hidden>
        <div className="hidden lg:block lg:w-60 flex-shrink-0 lg:border-r border-line/10 px-4 py-6 space-y-2">
          <div className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Versions</div>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <div className="flex-1 min-w-0 px-3 sm:px-8 py-6 sm:py-10">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-line/10 bg-surface px-5 sm:px-14 py-8 sm:py-14 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.35)]">
            <PaperLines />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A page's worth of headings and lines shimmering in (also used while switching documents). */
export function PaperLines() {
  return (
    <div role="status" aria-label="Loading the document" aria-busy="true">
      {[
        ["w-24", ["w-full", "w-2/3"]],
        ["w-20", ["w-full", "w-11/12", "w-4/5", "w-full", "w-1/2"]],
        ["w-40", ["w-3/4"]],
      ].map(([head, lines], k) => (
        <div key={k} className={k ? "mt-9" : ""} aria-hidden>
          <Skeleton className={`h-6 ${head} mb-4`} />
          <div className="space-y-3">
            {(lines as string[]).map((w, i) => (
              <Skeleton key={i} className={`h-3.5 ${w}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
