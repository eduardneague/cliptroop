"use client";

import { useSearchParams } from "next/navigation";
import { SkeletonPage, SkeletonTabs } from "@/components/ui/skeleton";
import { SETTINGS_TABS, SettingsTabSkeleton, settingsTab } from "./skeletons";

/** Settings: title, the tabs (the one you're opening underlined), then that tab's shape. */
export default function Loading() {
  const tab = settingsTab(useSearchParams().get("tab"));
  return (
    <SkeletonPage width="max-w-4xl" className="px-4 sm:px-8 py-5 sm:py-8 space-y-6">
      <div aria-hidden>
        <h1 className="font-display text-3xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-ink-soft">Your account, across every team you&rsquo;re part of.</p>
      </div>
      <SkeletonTabs tabs={SETTINGS_TABS.map((t) => t.label)} active={SETTINGS_TABS.find((t) => t.id === tab)?.label} />
      <SettingsTabSkeleton tab={tab} />
    </SkeletonPage>
  );
}
