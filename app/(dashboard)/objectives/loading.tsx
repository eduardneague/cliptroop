"use client";

import { useSearchParams } from "next/navigation";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Objectives or Projections (?view=), in the shape the page arrives in: title and tabs, the overview, the toolbar, the table (1.18.0: the first view). */
export default function Loading() {
  const projections = useSearchParams().get("view") === "projections";
  const tab = (on: boolean) => `flex-1 sm:flex-none inline-flex items-center justify-center rounded-md px-3.5 h-8 text-[13px] font-semibold ${on ? "bg-ink text-paper" : "text-ink-soft"}`;
  return (
    <SkeletonPage width="max-w-[1500px]" className="px-4 sm:px-8 py-5 sm:py-8">
      <div className="mb-4 sm:mb-5" aria-hidden>
        <div className="flex items-center gap-x-4 gap-y-3 flex-wrap">
          <h1 className="font-display text-[30px] sm:text-[34px] leading-none font-semibold">{projections ? "Projections" : "Objectives"}</h1>
          <div className="order-last w-full sm:order-none sm:w-auto">
            <div className="flex sm:inline-flex rounded-lg border border-line/15 bg-surface p-0.5 gap-0.5">
              <span className={tab(!projections)}>Objectives</span>
              <span className={tab(projections)}>Projections</span>
            </div>
          </div>
          <Skeleton className="ml-auto h-9 w-36 rounded-lg" />
        </div>
        <Skeleton className="h-3.5 w-72 max-w-full mt-3" />
      </div>

      {projections ? (
        <div className="rounded-2xl border border-line/10 bg-surface p-4 sm:px-5 mb-4 grid gap-4 grid-cols-4 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,2fr)]" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-7 w-8 mt-1.5" />
            </div>
          ))}
          <div className="col-span-4 sm:col-span-1 space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
        </div>
      ) : (
        // Reached now · the win streak · days since the last win (1.18.0).
        <div className="rounded-2xl border border-line/10 bg-surface mb-4 grid divide-y divide-line/10 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.8fr)] lg:divide-x" aria-hidden>
          <div className="p-4 sm:p-5 flex items-center gap-4 sm:col-span-2 lg:col-span-1 sm:border-b sm:border-line/10 lg:border-b-0">
            <Skeleton className="w-16 h-16 sm:w-[84px] sm:h-[84px] rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-14" />
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-6 w-24 rounded-md" />
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="w-9 h-11 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-28" />
              </div>
            </div>
            <div className="mt-3 flex gap-1 justify-between max-w-[300px]">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="w-[22px] h-[22px] rounded-[5px]" />
              ))}
            </div>
            <Skeleton className="h-3 w-52 max-w-full mt-3" />
          </div>
          <div className="p-4 sm:p-5 flex sm:flex-col items-center sm:items-start gap-4 sm:gap-3 sm:border-l lg:border-l-0 border-line/10">
            <Skeleton className="w-[136px] sm:w-[176px] h-[88px] rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5 w-full">
              <Skeleton className="h-3 w-44 max-w-full" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4" aria-hidden>
        <Skeleton className="h-9 w-64 max-w-[60%] rounded-lg" />
        {!projections && <Skeleton className="hidden sm:block h-9 w-72 max-w-[40%] rounded-lg" />}
        <Skeleton className="ml-auto h-9 w-[76px] md:w-36 rounded-lg" />
      </div>

      {/* The table (the first view; the cards when picked come right after). */}
      <div className="rounded-2xl border border-line/10 bg-surface overflow-hidden" aria-hidden>
        <div className="hidden md:flex items-center gap-4 px-3 h-9 bg-surface-2">
          {["w-20", "w-16", "w-14", "w-16"].map((w, i) => (
            <Skeleton key={i} className={`h-2.5 ${w} ${i === 0 ? "flex-1 max-w-[80px] mr-auto" : ""}`} />
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3.5 md:px-3 py-3 border-t border-line/10 first:border-t-0 md:first:border-t">
            <Skeleton className="w-6 h-6 rounded-md flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className={`h-3.5 ${["w-40", "w-32", "w-44", "w-36", "w-28", "w-40"][i]} max-w-full`} />
              <Skeleton className="h-2.5 w-56 max-w-full" />
            </div>
            <div className="hidden md:block w-[200px] space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-1.5 w-full rounded-[3px]" />
            </div>
            <Skeleton className="h-[22px] w-16 rounded-md" />
            <Skeleton className="hidden lg:block h-3 w-20 ml-6" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
