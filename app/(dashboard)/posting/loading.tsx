import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Posting: health card, the filters, then the four groups (two open, like the real page). */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-5xl" className="px-4 sm:px-8 py-6 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap" aria-hidden>
        <div>
          <h1 className="text-[28px] font-display font-semibold">Posting</h1>
          <p className="text-[13px] text-ink-faint">Everything scheduled, in progress and posted, and anything that stops your team&rsquo;s posts.</p>
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5" aria-hidden>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Health</h2>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-2.5">
              <Skeleton className="mt-0.5 w-5 h-5 rounded" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className={`h-3.5 ${["w-48", "w-40", "w-56"][i]}`} />
                <Skeleton className={`h-3 ${["w-2/3", "w-1/2", "w-3/5"][i]}`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The filters: platform chips, then search and day. */}
      <div className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-3.5 space-y-2.5" aria-hidden>
        <div className="flex items-center gap-2 flex-wrap">
          <Skeleton className="h-8 w-14 rounded-full" />
          {["w-[7.5rem]", "w-[7.5rem]", "w-[7rem]", "w-24"].map((w, i) => (
            <Skeleton key={i} className={`h-8 ${w} max-sm:w-14 rounded-full`} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-[9.5rem] sm:w-[10.5rem] rounded-lg" />
        </div>
      </div>

      {[
        { title: "Needs attention", rows: 0 },
        { title: "In progress", rows: 2 },
        { title: "Upcoming", rows: 4 },
        { title: "Published recently", rows: 0 },
      ].map((g) => (
        <div key={g.title} className="rounded-2xl border border-line/10 bg-surface overflow-hidden" aria-hidden>
          <div className="flex items-center gap-2 px-4 py-3.5">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">{g.title}</span>
            <Skeleton className="h-5 w-7 rounded-full" />
          </div>
          {g.rows > 0 && (
            <div className="divide-y divide-line/10 border-t border-line/10">
              {Array.from({ length: g.rows }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="w-7 h-7 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className={`h-3.5 ${["w-1/2", "w-2/5", "w-3/5", "w-1/3"][i % 4]}`} />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </SkeletonPage>
  );
}
