import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Analytics: title, tabs, the filter row, KPI tiles, one big chart, two cards. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1400px]">
      <div className="mb-5" aria-hidden>
        <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Analytics</h1>
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-5 border-b border-line/15 h-11 items-center mb-4 px-3.5" aria-hidden>
        {["w-20", "w-16", "w-16", "w-16"].map((w, i) => (
          <Skeleton key={i} className={`h-3.5 ${w}`} />
        ))}
      </div>
      <div className="flex items-center gap-2 mb-6" aria-hidden>
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-9 w-48 rounded-lg hidden sm:block" />
        <span className="flex-1" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="space-y-5" aria-hidden>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`rounded-2xl border border-line/10 bg-surface p-4 ${i === 4 ? "hidden lg:block" : ""}`}>
              <Skeleton className="h-3 w-24 mb-3" />
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-line/10 bg-surface p-5">
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-3 w-20 mb-5" />
          <div className="flex items-end gap-2 h-[220px]">
            {[38, 62, 45, 80, 55, 30, 70, 48, 90, 60, 42, 75, 52, 66].map((h, i) => (
              <div key={i} className="skeleton flex-1 max-w-[24px] mx-auto rounded-t-[4px]" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {[0, 1].map((c) => (
            <div key={c} className="rounded-2xl border border-line/10 bg-surface p-5">
              <Skeleton className="h-4 w-36 mb-5" />
              <div className="space-y-3.5">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className={`h-3 rounded-full ${["w-3/5", "w-2/5", "w-1/3", "w-1/5"][i]}`} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
