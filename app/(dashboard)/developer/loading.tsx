import { Skeleton, SkeletonLines, SkeletonPage } from "@/components/ui/skeleton";
import { DEV_TABS, DevTabSkeleton } from "./skeletons";

/** Developer: the title and buttons, the tabs, then the Overview's cards. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-6xl" className="px-4 sm:px-8 py-6 sm:py-8 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap" aria-hidden>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[28px] font-semibold">Developer</h1>
          <SkeletonLines lines={2} className="max-w-xl mt-1" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </header>
      <nav className="flex items-center gap-1 border-b border-line/15" aria-hidden>
        {DEV_TABS.map((t) => (
          <span key={t.id} className="px-3.5 h-11 inline-flex items-center text-[14px] font-semibold text-ink-faint">
            {t.label}
          </span>
        ))}
      </nav>
      <DevTabSkeleton tab="overview" />
    </SkeletonPage>
  );
}
