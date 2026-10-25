"use client";

import { usePathname } from "next/navigation";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

// The tabs each platform's videos have (video-tabs.tsx `tabsFor`; Facebook's
// Revenue only when it earned, so not here).
const TABS: Record<string, string[]> = {
  youtube: ["Overview", "Reach", "Engagement", "Audience", "Revenue", "Advanced"],
  instagram: ["Overview", "Reach", "Engagement", "Advanced"],
  facebook: ["Overview", "Reach", "Engagement", "Advanced"],
  tiktok: ["Overview", "Engagement", "Advanced"],
};

/**
 * A video's analytics (1.21.0): back link, the video with its numbers, its
 * tabs (real words: they don't change), then the Overview: the cards that
 * switch its chart and the chart, realtime beside it. 1.22.0: the header's
 * new shape (no "right now" box beside it).
 */
export default function Loading() {
  const platform = /^\/analytics\/video\/([a-z]+)\//.exec(usePathname() ?? "")?.[1] ?? "youtube";
  const tabs = TABS[platform] ?? TABS.youtube;
  return (
    <SkeletonPage width="max-w-[1400px]">
      <div className="space-y-5 sm:space-y-6">
        <Skeleton className="h-5 w-40 rounded-md" />
        {/* The header (1.22.0): a bigger picture, the views with what's usual, then every main number in a row. */}
        <div className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5" aria-hidden>
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            <div className="skeleton rounded-xl w-full sm:w-[320px] lg:w-[380px] xl:w-[420px] aspect-video flex-shrink-0 self-start" />
            <div className="flex-1 min-w-0 pt-1">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-7 w-3/4 mt-2.5" />
              <Skeleton className="h-3.5 w-56 mt-2.5" />
              <div className="mt-4 rounded-xl bg-surface-2/60 px-4 py-3 space-y-2">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>
              <div className="stat-cq mt-3.5">
                <div className="stat-grid" data-n="7">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i}>
                      <Skeleton className="h-3 w-16 mb-2" />
                      <Skeleton className="h-6 w-14" />
                    </div>
                  ))}
                </div>
              </div>
              <Skeleton className="h-8 w-36 rounded-lg mt-3.5" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 border-b border-line/15 overflow-hidden -mx-4 px-3 sm:mx-0 sm:px-0">
          {tabs.map((t, i) => (
            <span key={t} className={`relative px-2.5 sm:px-3.5 h-11 inline-flex items-center text-[14px] font-semibold whitespace-nowrap ${i === 0 ? "text-ink" : "text-ink-soft"}`}>
              {t}
              {i === 0 && <span aria-hidden className="absolute left-2 right-2 bottom-0 h-[2.5px] rounded-t-[2px] bg-amber" />}
            </span>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start" aria-hidden>
          <div className="rounded-2xl border border-line/10 bg-surface overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-line/10">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`p-4 border-r border-line/10 last:border-r-0 ${i > 1 ? "hidden sm:block" : ""}`}>
                  <Skeleton className="h-3 w-20 mb-2.5" />
                  <Skeleton className="h-6 w-16 mb-2" />
                  <Skeleton className="h-3.5 w-14" />
                </div>
              ))}
            </div>
            <div className="p-4 sm:p-5">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-44 mb-5" />
              <div className="flex items-end gap-2 h-[220px]">
                {["h-[30%]", "h-[45%]", "h-[60%]", "h-[52%]", "h-[70%]", "h-[64%]", "h-[80%]", "h-[72%]", "h-[85%]", "h-[90%]", "h-[76%]", "h-[68%]"].map((h, i) => (
                  <div key={i} className={`skeleton flex-1 max-w-[24px] mx-auto rounded-t-[4px] ${h}`} />
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-8 w-28" />
            <div className="flex items-end gap-1 h-[90px]">
              {["h-[20%]", "h-[35%]", "h-[30%]", "h-[50%]", "h-[45%]", "h-[60%]", "h-[40%]", "h-[70%]", "h-[55%]", "h-[65%]", "h-[50%]", "h-[75%]"].map((h, i) => (
                <div key={i} className={`skeleton flex-1 rounded-t-[3px] ${h}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
