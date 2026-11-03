import { Skeleton } from "@/components/ui/skeleton";

/*
 * The shorts list while it loads (1.27.5): the table or the cards, whichever
 * is on its way (switching views, a filter, the page's own loading screen).
 * Same columns and sizes as the real ones.
 */

const WIDE =
  "md:grid-cols-[40px_minmax(0,1fr)_120px_60px_64px] lg:grid-cols-[40px_minmax(0,1fr)_160px_120px_60px_64px] xl:grid-cols-[44px_minmax(0,1fr)_160px_120px_150px_64px] 2xl:grid-cols-[48px_minmax(0,1fr)_140px_160px_120px_150px_64px] gap-3";
const COLS = `grid grid-cols-[36px_minmax(0,1fr)_auto] ${WIDE}`;

export function ShortTableSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface overflow-hidden" aria-hidden>
      <div className={`hidden md:grid ${WIDE} px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint`}>
        <span className="text-right">#</span>
        <span>Title</span>
        <span className="hidden 2xl:block">Planned</span>
        <span className="hidden lg:block">Editor</span>
        <span>Status</span>
        <span>Posted</span>
        <span />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${COLS} items-center px-3 py-3 border-t border-line/10`}>
          <Skeleton className="h-3 w-5 justify-self-end" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className={`h-3.5 ${["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-[45%]"][i % 5]}`} />
            <Skeleton className="h-2.5 w-28" />
          </div>
          <Skeleton className="hidden 2xl:block h-3 w-20" />
          <div className="hidden lg:flex items-center gap-2">
            <Skeleton className="w-6 h-6 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="hidden md:block h-6 w-20 rounded-lg" />
          <Skeleton className="hidden md:block h-5 w-12" />
          <Skeleton className="h-7 w-14 rounded-lg justify-self-end md:justify-self-start" />
        </div>
      ))}
    </div>
  );
}

export function ShortCardsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`rounded-2xl border-2 border-line/10 bg-surface p-4 flex flex-col gap-3 ${i >= 4 ? "hidden sm:flex" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-6 w-20 rounded-lg" />
          </div>
          <Skeleton className={`h-4 ${["w-5/6", "w-3/4", "w-2/3", "w-4/5"][i % 4]}`} />
          <Skeleton className="h-3 w-24" />
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-line/10">
            <div className="flex items-center gap-1.5">
              <Skeleton className="w-5 h-5 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-6 w-20 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
