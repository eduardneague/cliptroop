import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import type { BusinessTab } from "./tabs";

/* Business (1.42.0): each tab while it loads, the same shapes as the tab. */

const box = "rounded-2xl border border-line/10 bg-surface";

function TableRows({ rows = 8, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div className={`${box} overflow-hidden`}>
      <div className="bg-surface-2 h-10 flex items-center gap-4 px-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className={`h-3 ${i === 3 ? "flex-[3]" : "flex-1"}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="h-10 flex items-center gap-4 px-3 border-t border-line/10">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className={`h-3 ${i === 3 ? "flex-[3]" : "flex-1"} ${(r + i) % 3 === 0 ? "opacity-40" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function BusinessTabSkeleton({ tab }: { tab: BusinessTab }) {
  if (tab === "overview")
    return (
      <div className="space-y-4" aria-hidden>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${box} p-4`}>
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-6 w-28 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className={`${box} p-4`}>
            <Skeleton className="h-3 w-32 mb-4" />
            <div className="flex items-end gap-2 h-40">
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="flex-1" />
              ))}
            </div>
          </div>
          <div className={`${box} p-4`}>
            <Skeleton className="h-3 w-24 mb-4" />
            <SkeletonLines lines={5} />
          </div>
        </div>
      </div>
    );
  if (tab === "cashbook")
    return (
      <div className="space-y-3" aria-hidden>
        <div className="flex items-center gap-2 flex-wrap">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-56 rounded-lg" />
          <Skeleton className="h-9 w-48 rounded-lg ml-auto" />
        </div>
        <TableRows rows={10} cols={9} />
      </div>
    );
  if (tab === "fiscal")
    return (
      <div className="space-y-4" aria-hidden>
        <div className={`${box} p-4`}>
          <Skeleton className="h-4 w-64 mb-2" />
          <SkeletonLines lines={2} className="max-w-xl" />
        </div>
        <TableRows rows={9} cols={3} />
      </div>
    );
  if (tab === "inventory")
    return (
      <div className="space-y-3" aria-hidden>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg ml-auto" />
        </div>
        <TableRows rows={7} cols={5} />
      </div>
    );
  if (tab === "assets")
    return (
      <div className="space-y-3" aria-hidden>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-4 w-72 ml-2" />
        </div>
        <TableRows rows={5} cols={9} />
      </div>
    );
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${box} p-5`}>
          <Skeleton className="h-3 w-28 mb-4" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, k) => (
              <div key={k}>
                <Skeleton className="h-3 w-24 mb-1.5" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
