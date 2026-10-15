"use client";

import { usePathname } from "next/navigation";
import { Skeleton, SkeletonLines, SkeletonPage } from "@/components/ui/skeleton";
import ShortsLoading from "./shorts/loading";
import VideosLoading from "./videos/loading";

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

/*
 * Next shows the outermost new loading screen first. On the way into
 * another part of the app (a task on the dashboard that opens a script)
 * that's this one, before the page it leads to has said anything. So the
 * paths with their own skeletons get them here too: "Write the script"
 * shows the script's skeleton from the first moment (1.23.0), not this
 * neutral page or the shorts list.
 */
export default function Loading() {
  const path = usePathname() ?? "";
  if (/^\/shorts(\/|$)/.test(path)) return <ShortsLoading />;
  if (/^\/videos(\/|$)/.test(path)) return <VideosLoading />;
  return <Neutral />;
}
