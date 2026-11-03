"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { VIEW_MODE_COOKIE } from "@/lib/view-mode";
import { VideoCardsSkeleton, VideoTableSkeleton } from "@/modules/long-videos/components/list-skeletons";
import NewVideoLoading from "./new/loading";
import VideoLoading from "./[id]/loading";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";
import { STAGE_LABELS, STAGE_ORDER } from "@/modules/long-videos/lib/stages";

const noop = () => () => {};
/** The view picked last (the cookie the list reads too): cards unless it's the table. */
const savedView = () => (new RegExp(`(?:^|; )${VIEW_MODE_COOKIE}=table(?:;|$)`).test(document.cookie) ? "table" : "grid");

/** Long videos: title, step filters, then the cards or the table (the one picked last). */
function ListSkeleton() {
  const view = useSyncExternalStore(noop, savedView, () => "grid");
  return (
    <SkeletonPage width="max-w-[1720px]">
      <div className="flex items-start justify-between gap-6 mb-7 flex-wrap" aria-hidden>
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Long videos</h1>
          <Skeleton className="h-4 w-72 max-w-[70vw]" />
        </div>
        <Skeleton className="h-11 w-44 rounded-xl" />
      </div>

      <div className="flex items-center justify-between gap-3 mb-7" aria-hidden>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex gap-1 w-max sm:w-auto sm:flex-wrap">
            {["All", ...STAGE_ORDER.map((s) => STAGE_LABELS[s])].map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-ink-faint">
                {label}
                <Skeleton className="h-2.5 w-3" />
              </span>
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-[70px] rounded-lg flex-shrink-0" />
      </div>

      {view === "table" ? <VideoTableSkeleton /> : <VideoCardsSkeleton />}
    </SkeletonPage>
  );
}

/*
 * This skeleton shows first on the way in from another part of the app
 * (Next shows the outermost new loading screen while the page is fetched),
 * so on the way to a page further in it shows that page's skeleton instead:
 * from a task straight to a script, the script's, not this list's (1.18.0).
 */
export default function Loading() {
  const path = usePathname() ?? "";
  if (/^\/videos\/new(\/|$)/.test(path)) return <NewVideoLoading />;
  if (/^\/videos\/[^/]+/.test(path)) return <VideoLoading />;
  return <ListSkeleton />;
}
