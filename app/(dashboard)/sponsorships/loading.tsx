"use client";

import { useSyncExternalStore } from "react";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";
import { AFFILIATES_VIEW_COOKIE } from "@/modules/affiliates/lib/view-mode";
import { DEAL_KINDS, KIND_TAB } from "@/modules/affiliates/lib/rules";
import { AffiliateCardsSkeleton, AffiliatesTableSkeleton } from "@/modules/affiliates/components/list-skeletons";

const noop = () => () => {};
/** The view picked last (the cookie the list reads too): the table unless it's the cards. */
const savedView = () => (new RegExp(`(?:^|; )${AFFILIATES_VIEW_COOKIE}=grid(?:;|$)`).test(document.cookie) ? "grid" : "table");

/**
 * Sponsorships (1.57.0; Affiliates in 1.56.0): the title, the kinds' tabs, the toolbar (1.60.0: Filters, with the
 * status in it, then the search, fold all, Select, the view) and the table (or the cards, if picked last), shimmering.
 */
export default function Loading() {
  const view = useSyncExternalStore(noop, savedView, () => "table");
  return (
    <SkeletonPage width="max-w-[1500px]">
      <div className="flex items-start justify-between gap-6 mb-6 flex-wrap" aria-hidden>
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Sponsorships</h1>
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-11 w-44 rounded-xl" />
      </div>
      <div className="flex items-center gap-1 border-b border-line/15 mb-5 -mx-1 px-1 overflow-hidden" aria-hidden>
        {["All", ...DEAL_KINDS.map((k) => KIND_TAB[k])].map((label) => (
          <span key={label} className="inline-flex items-center gap-2 px-3.5 h-11 text-[14px] font-semibold whitespace-nowrap text-ink-faint">
            {label}
            <Skeleton className="h-2.5 w-3" />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-6" aria-hidden>
        <div className="flex-1 min-w-0">
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <Skeleton className="max-md:hidden h-9 w-60 rounded-lg" />
        <Skeleton className="h-9 w-[70px] rounded-lg" />
      </div>
      <Skeleton className="md:hidden -mt-3 mb-6 h-9 w-[11.5rem] rounded-lg" />
      {view === "grid" ? <AffiliateCardsSkeleton /> : <AffiliatesTableSkeleton />}
    </SkeletonPage>
  );
}
