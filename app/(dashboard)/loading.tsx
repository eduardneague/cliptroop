"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Skeleton, SkeletonLines, SkeletonPage } from "@/components/ui/skeleton";
import { BusinessSkeleton } from "@/modules/business/components/skeletons";
import { LANG_COOKIE, langOf } from "@/modules/business/lib/i18n";
import AnalyticsLoading from "./analytics/loading";
import CalendarLoading from "./calendar/loading";
import DashboardLoading from "./dashboard/loading";
import DeveloperLoading from "./developer/loading";
import FrameGuidesLoading from "./frame-guides/loading";
import MeetingsLoading from "./meetings/loading";
import ObjectivesLoading from "./objectives/loading";
import OutliersLoading from "./outliers/loading";
import PostingLoading from "./posting/loading";
import SettingsLoading from "./settings/loading";
import SetupLoading from "./setup/loading";
import ShortsLoading from "./shorts/loading";
import TeamLoading from "./team/loading";
import NewTeamLoading from "./teams/new/loading";
import TodoLoading from "./todo/loading";
import ProfileLoading from "./u/[username]/loading";
import VideosLoading from "./videos/loading";
import WordLoading from "./word/loading";

// Fallback for any dashboard route without its own loading.tsx: a neutral
// page (title, a line, a couple of cards) that won't look out of place.
function Neutral() {
  return (
    <SkeletonPage width="max-w-5xl">
      <div aria-hidden>
        <Skeleton className="h-9 w-64 mb-3" />
        <Skeleton className="h-4 w-80 max-w-full mb-8" />
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-line/10 bg-surface p-5 sm:p-6">
              <Skeleton className="h-3.5 w-28 mb-4" />
              <SkeletonLines lines={i ? 3 : 4} />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}

/** Business in the language the page was last in (its own loading.tsx reads the same cookie on the server). */
const noop = () => () => {};
const langCookie = () => langOf(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]*)`).exec(document.cookie)?.[1]);
function BusinessLoading() {
  const lang = useSyncExternalStore(noop, langCookie, () => langOf(null));
  return <BusinessSkeleton lang={lang} />;
}

/**
 * Each part of the app, and the loading screen that's its own. A part that has more pages inside (a video and its
 * script, a meeting) picks the right one for the address itself, as the page's own loading screens do.
 */
const PARTS: [RegExp, () => React.ReactElement][] = [
  [/^\/shorts(\/|$)/, () => <ShortsLoading />],
  [/^\/videos(\/|$)/, () => <VideosLoading />],
  [/^\/dashboard(\/|$)/, () => <DashboardLoading />],
  [/^\/todo(\/|$)/, () => <TodoLoading />],
  [/^\/calendar(\/|$)/, () => <CalendarLoading />],
  [/^\/meetings(\/|$)/, () => <MeetingsLoading />],
  [/^\/posting(\/|$)/, () => <PostingLoading />],
  [/^\/outliers(\/|$)/, () => <OutliersLoading />],
  [/^\/frame-guides(\/|$)/, () => <FrameGuidesLoading />],
  [/^\/analytics(\/|$)/, () => <AnalyticsLoading />],
  [/^\/objectives(\/|$)/, () => <ObjectivesLoading />],
  [/^\/team(\/|$)/, () => <TeamLoading />],
  [/^\/teams\/new(\/|$)/, () => <NewTeamLoading />],
  [/^\/settings(\/|$)/, () => <SettingsLoading />],
  [/^\/setup(\/|$)/, () => <SetupLoading />],
  [/^\/developer(\/|$)/, () => <DeveloperLoading />],
  [/^\/business(\/|$)/, () => <BusinessLoading />],
  [/^\/u\/[^/]+/, () => <ProfileLoading />],
  [/^\/word(\/|$)/, () => <WordLoading />],
];

/*
 * Next shows the outermost new loading screen first: on the way into another part of the app, before the page has
 * said anything, that's this one; then, as the page comes in parts, each level's own (videos, the video, its script).
 * So this one is the page's own from the first moment ("Write the script" shows the script's skeleton at once,
 * 1.23.0), for every part of the app (1.55.7: only shorts and videos did, so everywhere else a neutral page came first
 * and then the page's own, which looked like loading twice; and skeletons don't rise in any more, globals.css, so one
 * taking another's place doesn't show).
 */
export default function Loading() {
  const path = usePathname() ?? "";
  const part = PARTS.find(([re]) => re.test(path));
  return part ? part[1]() : <Neutral />;
}
