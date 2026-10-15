import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Posting (1.24.0): the problems bar, the tabs, then the Overview (the four numbers, a card per platform, coming up, just posted). */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-6xl" className="px-4 sm:px-8 py-6 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap" aria-hidden>
        <div>
          <h1 className="text-[28px] font-display font-semibold">Posting</h1>
          <p className="text-[13px] text-ink-faint">Everything scheduled, in progress and posted, and anything that stops your team&rsquo;s posts.</p>
        </div>
      </div>

      <Skeleton className="h-[46px] w-full rounded-2xl" />

      <div className="space-y-4" aria-hidden>
        <div className="flex items-center gap-0.5 border-b border-line/15 overflow-hidden -mx-4 px-3 sm:mx-0 sm:px-0">
          {["Overview", "Upcoming", "Posted", "Needs attention"].map((t, i) => (
            <span key={t} className={`relative px-2.5 sm:px-3.5 h-11 inline-flex items-center text-[14px] font-semibold whitespace-nowrap ${i === 0 ? "text-ink" : "text-ink-faint"}`}>
              {t}
              {i === 0 && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-[2px] bg-amber" />}
            </span>
          ))}
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {["Next post", "Scheduled", "Posted, 7 days", "Needs attention"].map((t) => (
            <div key={t} className="rounded-2xl border border-line/10 bg-surface p-3.5 sm:p-4 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t}</div>
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-28 max-w-full" />
            </div>
          ))}
        </div>

        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint pt-2">By platform</div>
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1].map((k) => (
            <div key={k} className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
              <Skeleton className="h-[54px] w-full rounded-xl" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-16 h-9 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className={`h-3.5 ${["w-3/5", "w-1/2", "w-2/3"][i]}`} />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
