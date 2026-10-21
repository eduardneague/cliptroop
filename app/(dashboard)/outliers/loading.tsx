"use client";

import { useSearchParams } from "next/navigation";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";
import { TABS, readTab, type TabId } from "@/modules/outliers/lib/view";

/*
 * Outliers' skeletons (1.27.0, 1.29.0): the title and its buttons, the bar
 * with the niche picker, the kind switch and the tabs as real words, then
 * the shape of the tab being opened (cards for For you and Search, idea
 * cards, a list with a side panel for Formats and Keywords, a table for
 * Channels, a list for Audience, the lab, a wall of thumbnails, folders).
 */

function Card({ short = false }: { short?: boolean }) {
  return (
    <div>
      <div className={`skeleton w-full rounded-xl ${short ? "aspect-[9/16]" : "aspect-video"}`} />
      <div className="mt-2.5 flex gap-2.5">
        {!short && <div className="skeleton w-[30px] h-[30px] rounded-full flex-shrink-0" />}
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

function Grid({ short, n = 10 }: { short: boolean; n?: number }) {
  return (
    <div className={short ? "grid gap-x-3 gap-y-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7" : "grid gap-x-4 gap-y-6 grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]"}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={i >= 4 ? "hidden md:block" : ""}>
          <Card short={short} />
        </div>
      ))}
    </div>
  );
}

function Rows({ n = 6 }: { n?: number }) {
  return (
    <div className="rounded-2xl border border-line/10 bg-surface px-4 divide-y divide-line/[0.07]">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <div className="skeleton w-[124px] aspect-video rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-12 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function Body({ tab, short }: { tab: TabId; short: boolean }) {
  switch (tab) {
    case "search":
      return (
        <div className="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:gap-8">
          <div className="hidden lg:block space-y-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <div className="flex flex-wrap gap-1.5">
                  {[0, 1, 2, 3, 4].map((j) => (
                    <Skeleton key={j} className="h-8 w-14 rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="min-w-0">
            <div className="flex gap-2 mb-6">
              <Skeleton className="h-11 flex-1 rounded-xl" />
              <Skeleton className="h-11 w-44 rounded-xl" />
            </div>
            <Grid short={short} n={12} />
          </div>
        </div>
      );
    case "ideas":
      return (
        <div>
          <Skeleton className="h-28 w-full rounded-2xl mb-5" />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className={`rounded-2xl border border-line/10 bg-surface overflow-hidden ${i >= 3 ? "hidden md:block" : ""}`}>
                <div className="skeleton aspect-video" />
                <div className="p-3.5 space-y-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-8 w-28 rounded-lg mt-3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "formats":
    case "keywords":
      return (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-6">
          <div>
            <div className="flex gap-2 mb-4">
              <Skeleton className="h-8 w-72 rounded-lg" />
            </div>
            <div className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/[0.07]">
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <Skeleton className="h-2.5 w-2.5 rounded-[3px]" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                  </div>
                  <Skeleton className="h-5 w-10" />
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="hidden lg:block h-[32rem] rounded-2xl" />
        </div>
      );
    case "audience":
      return (
        <div>
          <Skeleton className="h-24 w-full rounded-2xl mb-5" />
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className={`h-36 rounded-2xl ${i >= 2 ? "hidden lg:block" : ""}`} />
            ))}
          </div>
        </div>
      );
    case "channels":
      return (
        <div>
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-9 w-64 rounded-lg" />
            <Skeleton className="h-9 w-48 rounded-lg" />
          </div>
          <div className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/[0.07]">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="skeleton w-[34px] h-[34px] rounded-full" />
                <Skeleton className="h-3.5 w-44" />
                <span className="flex-1" />
                <Skeleton className="h-3 w-16 hidden sm:block" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      );
    case "titles":
      return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      );
    case "thumbnails":
      return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className={`grid gap-2.5 ${short ? "grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))]" : "grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]"}`}>
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className={`skeleton rounded-xl ${short ? "aspect-[9/16]" : "aspect-video"}`} />
            ))}
          </div>
          <Skeleton className="hidden xl:block h-96 rounded-2xl" />
        </div>
      );
    case "saved":
      return (
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
          <div className="hidden lg:block space-y-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
          <Grid short={false} n={6} />
        </div>
      );
    default:
      return (
        <div className="space-y-10">
          <div>
            <Skeleton className="h-6 w-56 mb-1.5" />
            <Skeleton className="h-3.5 w-72 max-w-full mb-4" />
            <div className="grid gap-x-4 gap-y-6 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              <div className="min-[480px]:col-span-2 lg:row-span-2 skeleton rounded-2xl min-h-[22rem]" />
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={i >= 4 ? "hidden lg:block" : ""}>
                  <Card />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <Skeleton className="h-6 w-48 mb-4" />
              <Rows />
            </div>
            <div>
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-56 rounded-2xl" />
                ))}
              </div>
            </div>
          </div>
        </div>
      );
  }
}

export default function Loading() {
  const sp = useSearchParams();
  const tab = readTab(sp.get("tab"));
  const short = sp.get("kind") === "short";
  return (
    <SkeletonPage width="max-w-[1760px]" className="px-4 sm:px-8 xl:px-10 py-5 sm:py-8">
      <div className="mb-4 flex items-start justify-between gap-4" aria-hidden>
        <div className="min-w-0">
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Outliers</h1>
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10 sm:w-24 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2.5" aria-hidden>
        <Skeleton className="h-10 w-56 max-w-[60%] rounded-xl" />
        <span className="flex-1" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>
      <div className="mt-1.5 flex items-center gap-0.5 border-b border-line/15 overflow-hidden -mx-4 px-3 sm:mx-0 sm:px-0 mb-6" aria-hidden>
        {TABS.map((t) => (
          <span key={t.id} className={`relative px-2.5 sm:px-3.5 h-11 inline-flex items-center text-[14px] font-semibold whitespace-nowrap ${t.id === tab ? "text-ink" : "text-ink-faint"}`}>
            {t.label}
            {t.id === tab && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-[2px] bg-amber" />}
          </span>
        ))}
      </div>
      <div aria-hidden>
        <Body tab={tab} short={short} />
      </div>
    </SkeletonPage>
  );
}
