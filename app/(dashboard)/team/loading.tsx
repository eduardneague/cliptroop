"use client";

import { useSearchParams } from "next/navigation";
import { Skeleton, SkeletonPage, SkeletonTabs } from "@/components/ui/skeleton";
import { TEAM_TABS, TeamTabSkeleton, teamTab } from "./skeletons";

/** Team settings: title, the tabs (the one you're opening underlined), then that tab's shape. */
export default function Loading() {
  const tab = teamTab(useSearchParams().get("tab"));
  return (
    <SkeletonPage width="max-w-6xl" className="px-4 sm:px-8 py-5 sm:py-8 space-y-6">
      <div aria-hidden>
        <h1 className="font-display text-3xl font-semibold mb-1">Team settings</h1>
        <Skeleton className="h-4 w-56 mt-2" />
      </div>
      <SkeletonTabs tabs={TEAM_TABS.map((t) => t.label)} active={TEAM_TABS.find((t) => t.id === tab)?.label} />
      <TeamTabSkeleton tab={tab} />
    </SkeletonPage>
  );
}
