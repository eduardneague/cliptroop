"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { SHORTS_VIEW_COOKIE } from "@/modules/short-videos/lib/view-mode";
import { ShortCardsSkeleton, ShortTableSkeleton } from "@/modules/short-videos/components/list-skeletons";
import NewShortLoading from "./new/loading";
import ShortLoading from "./[id]/loading";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";
import { SHORT_STAGES, SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";

const noop = () => () => {};
/** The view picked last (the cookie the list reads too): the table unless it's the cards. */
const savedView = () => (new RegExp(`(?:^|; )${SHORTS_VIEW_COOKIE}=grid(?:;|$)`).test(document.cookie) ? "grid" : "table");

/** Shorts list: the title, the step filters and the table (or the cards, if picked last), shimmering. */
function ListSkeleton() {
  const view = useSyncExternalStore(noop, savedView, () => "table");
  return (
    <SkeletonPage width="max-w-[1500px]">
      <div className="flex items-start justify-between gap-6 mb-6 flex-wrap" aria-hidden>
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Short videos</h1>
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>

      <div className="flex items-center gap-2 mb-6" aria-hidden>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex gap-1 w-max items-center">
            {["All", ...SHORT_STAGES.map((s) => SHORT_STAGE_LABELS[s])].map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[12.5px] font-semibold whitespace-nowrap text-ink-faint">
                {label}
                <Skeleton className="h-2.5 w-3" />
              </span>
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-[70px] rounded-lg" />
      </div>
      <Skeleton className="-mt-3 mb-6 h-8 w-24 rounded-lg" />

      {view === "grid" ? <ShortCardsSkeleton /> : <ShortTableSkeleton />}
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
  if (/^\/shorts\/new(\/|$)/.test(path)) return <NewShortLoading />;
  if (/^\/shorts\/[^/]+/.test(path)) return <ShortLoading />;
  return <ListSkeleton />;
}
