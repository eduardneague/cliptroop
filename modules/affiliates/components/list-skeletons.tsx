import { Skeleton } from "@/components/ui/skeleton";
import { TABLE_COLS } from "../lib/table-cols";

/*
 * The sponsorships list while it loads (1.56.0): the table or the cards, whichever is on its way (switching views, a
 * filter, the page's own loading screen), with the real columns and sizes (1.57.1: the platform's narrow one too).
 */

export function AffiliatesTableSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface overflow-hidden" aria-hidden>
      <div className={`hidden md:grid ${TABLE_COLS.manage} gap-3 px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint`}>
        <span />
        <span>Name</span>
        <span>Code</span>
        <span>Percentage</span>
        <span className="hidden lg:block">Video</span>
        <span className="hidden xl:block">Product</span>
        <span className="hidden xl:block">Platform</span>
        <span />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`grid grid-cols-[36px_minmax(0,1fr)_auto] ${TABLE_COLS.manage} gap-x-3 items-center px-3 py-3 border-t border-line/5 first:border-t-0`}>
          <Skeleton className="w-8 h-8 rounded-lg justify-self-center" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className={`h-3.5 ${["w-2/5", "w-1/3", "w-1/2", "w-[45%]"][i % 4]}`} />
            <Skeleton className="h-2.5 w-32 xl:hidden" />
          </div>
          <Skeleton className="hidden md:block h-7 w-24 rounded-md" />
          <Skeleton className="hidden md:block h-3.5 w-10" />
          <Skeleton className="hidden lg:block h-6 w-40 rounded-md" />
          <Skeleton className="hidden xl:block h-3 w-24" />
          <Skeleton className="hidden xl:block h-7 w-14 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg justify-self-end" />
        </div>
      ))}
    </div>
  );
}

export function AffiliateCardsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`rounded-2xl border-2 border-line/10 bg-surface p-4 flex flex-col gap-3 ${i >= 4 ? "hidden sm:flex" : ""}`}>
          <div className="flex items-start gap-2.5">
            <Skeleton className="w-9 h-9 rounded-xl" />
            <div className="flex-1 space-y-1.5 pt-0.5">
              <Skeleton className={`h-4 ${["w-3/4", "w-2/3", "w-1/2", "w-4/5"][i % 4]}`} />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-12 rounded-md" />
          </div>
          <Skeleton className="h-6 w-40 rounded-md" />
          <div className="pt-2.5 border-t border-line/10 flex items-center gap-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-8 w-28 rounded-lg ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}
