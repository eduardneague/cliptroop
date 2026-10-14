"use client";

import { usePathname } from "next/navigation";
import VideoAnalyticsLoading from "./video/[platform]/[id]/loading";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Analytics (1.20.0): title, the 8 tabs, the filter row, the Overview's headline, its cards over the chart, two cards. */
function AnalyticsSkeleton() {
  return (
    <SkeletonPage width="max-w-[1400px]">
      <div className="mb-5" aria-hidden>
        <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Analytics</h1>
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex gap-5 border-b border-line/15 h-11 items-center mb-4 px-3.5 overflow-hidden" aria-hidden>
        {["w-16", "w-14", "w-16", "w-16", "w-16", "w-14", "w-16", "w-20"].map((w, i) => (
          <Skeleton key={i} className={`h-3.5 flex-shrink-0 ${w}`} />
        ))}
      </div>
      <div className="flex items-center gap-2 mb-6" aria-hidden>
        <Skeleton className="h-9 w-44 sm:w-[30rem] rounded-lg" />
        <Skeleton className="h-9 w-48 rounded-lg hidden md:block" />
        <span className="flex-1" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="space-y-5" aria-hidden>
        <div>
          <Skeleton className="h-7 w-[26rem] max-w-full mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="rounded-2xl border border-line/10 bg-surface overflow-hidden">
          <div className="flex border-b border-line/10">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`flex-1 min-w-[9.5rem] px-4 py-3.5 border-r border-line/10 last:border-r-0 ${i > 1 ? "hidden sm:block" : ""} ${i > 3 ? "sm:hidden lg:block" : ""}`}>
                <Skeleton className="h-3 w-20 mb-2.5" />
                <Skeleton className="h-7 w-16 mb-2" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
          <div className="p-5">
            <Skeleton className="h-4 w-36 mb-2" />
            <Skeleton className="h-3 w-48 mb-5" />
            <div className="skeleton h-[280px] w-full rounded-xl" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          {[0, 1].map((c) => (
            <div key={c} className="rounded-2xl border border-line/10 bg-surface p-5">
              <Skeleton className="h-4 w-36 mb-5" />
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-16 rounded-md" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-2 w-1/2" />
                    </div>
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

/*
 * This skeleton shows first on the way in from another part of the app
 * (Next shows the outermost new loading screen while the page is fetched),
 * so on the way to a page further in it shows that page's skeleton instead:
 * from the dashboard straight to a video's analytics, that page's (1.18.0).
 */
export default function Loading() {
  const path = usePathname() ?? "";
  if (/^\/analytics\/video\//.test(path)) return <VideoAnalyticsLoading />;
  return <AnalyticsSkeleton />;
}
