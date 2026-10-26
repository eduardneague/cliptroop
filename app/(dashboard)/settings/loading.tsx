"use client";

import { useSearchParams } from "next/navigation";
import { SkeletonPage, SkeletonTabs } from "@/components/ui/skeleton";
import { SETTINGS_TABS, SettingsTabSkeleton, settingsTab, settingsView } from "./skeletons";

/** Settings: title, the tabs (the one you're opening underlined), then that tab's shape (or its sub-page's). */
export default function Loading() {
  const params = useSearchParams();
  const tab = settingsTab(params.get("tab"));
  const view = settingsView(tab, params.get("view"));
  return (
    <SkeletonPage width="max-w-4xl" className="px-4 sm:px-8 py-5 sm:py-8 space-y-6">
      <div aria-hidden>
        <h1 className="font-display text-3xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-ink-soft">Your account, across every team you&rsquo;re part of.</p>
      </div>
      <SkeletonTabs tabs={SETTINGS_TABS.map((t) => t.label)} active={SETTINGS_TABS.find((t) => t.id === tab)?.label} />
      <SettingsTabSkeleton tab={view ?? tab} />
    </SkeletonPage>
  );
}
