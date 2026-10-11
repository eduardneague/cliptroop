"use client";

import { useSearchParams } from "next/navigation";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Objectives or Projections (?view=), in the shape the page arrives in: title and tabs, the overview, the toolbar, a grid of cards. */
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
        <div className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 mb-4" aria-hidden>
          <div className="flex items-start gap-4 sm:gap-6">
            <Skeleton className="w-[92px] h-[92px] sm:w-[140px] sm:h-[140px] rounded-[28px] flex-shrink-0" />
            <div className="flex-1 min-w-0 divide-y divide-line/10">
              {[0, 1, 2].map((i) => (
                <div key={i} className="py-2 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-12" />
                  </div>
                  <Skeleton className="h-2.5 w-full mt-2 rounded-[3px]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4" aria-hidden>
        <Skeleton className="h-9 w-64 max-w-[60%] rounded-lg" />
        {!projections && <Skeleton className="h-9 w-72 max-w-[40%] rounded-lg" />}
      </div>

      {!projections && <Skeleton className="h-5 w-40 mb-3" />}
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,310px),1fr))]" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-2xl border border-line/10 bg-surface p-4">
            <div className="flex items-start gap-2.5">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-52 max-w-full" />
              </div>
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
            <Skeleton className="h-7 w-28 mt-4" />
            <Skeleton className="h-2 w-full mt-3 rounded-[3px]" />
            <Skeleton className="h-3 w-44 mt-2" />
            <Skeleton className="h-10 w-full mt-4" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
