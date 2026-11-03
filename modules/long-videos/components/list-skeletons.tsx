import { Skeleton } from "@/components/ui/skeleton";

/*
 * The long videos list while it loads (1.27.5): the cards or the table,
 * whichever is on its way (switching views, a step filter, the page's own
 * loading screen). Same columns and sizes as the real ones.
 */

export const VIDEO_TABLE_COLS = "grid grid-cols-[40px_56px_1fr_32px] sm:grid-cols-[48px_64px_1fr_110px_160px_110px_110px_36px]";

export function VideoCardsSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`rounded-2xl border border-line/10 bg-surface overflow-hidden flex flex-col ${i >= 4 ? "hidden sm:flex" : ""}`}>
          <div className="relative">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="absolute top-2.5 left-2.5 h-6 w-16 rounded-lg bg-surface/70" />
          </div>
          <div className="p-4 flex flex-col gap-2.5">
            <Skeleton className={`h-4 ${["w-5/6", "w-3/4", "w-2/3", "w-4/5"][i % 4]}`} />
            <Skeleton className="h-2.5 w-24" />
            <div className="pt-2.5 border-t border-line/10">
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function VideoTableSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="rounded-xl border border-line/10 overflow-hidden" aria-hidden>
      <div className={`${VIDEO_TABLE_COLS} gap-3 px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint`}>
        <span className="text-right">#</span>
        <span />
        <span>Title</span>
        <span className="hidden sm:block">Type</span>
        <span className="hidden sm:block">Theme</span>
        <span className="hidden sm:block">Stage</span>
        <span className="hidden sm:block">Expected</span>
        <span />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${VIDEO_TABLE_COLS} gap-3 px-3 py-2 items-center border-t border-line/10`}>
          <Skeleton className="h-3 w-5 justify-self-end" />
          <Skeleton className="w-14 h-8 rounded-md" />
          <Skeleton className={`h-3.5 ${["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-[45%]"][i % 5]}`} />
          <Skeleton className="hidden sm:block h-3 w-16" />
          <Skeleton className="hidden sm:block h-3 w-24" />
          <Skeleton className="hidden sm:block h-5 w-16 rounded-md" />
          <Skeleton className="hidden sm:block h-3 w-14" />
          <span />
        </div>
      ))}
    </div>
  );
}
