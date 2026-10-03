import { Skeleton, SkeletonPage, SkeletonTabs } from "@/components/ui/skeleton";

/** Team settings: title, the tabs, then the members list (the first tab). */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-6xl" className="px-4 sm:px-8 py-5 sm:py-8 space-y-6">
      <div aria-hidden>
        <h1 className="font-display text-3xl font-semibold mb-1">Team settings</h1>
        <Skeleton className="h-4 w-56 mt-2" />
      </div>
      <SkeletonTabs tabs={["Members", "Defaults", "Connected accounts", "Appearance", "Team"]} />
      <section aria-hidden>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-faint">Members</h2>
          <Skeleton className="h-5 w-7 rounded-full" />
          <span className="flex-1" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="rounded-2xl border border-line/15 bg-surface divide-y divide-line/10 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className={`h-3.5 ${["w-32", "w-40", "w-28", "w-36", "w-24", "w-32"][i]}`} />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                <Skeleton className="h-6 w-16 rounded-full" />
                {i % 2 === 0 && <Skeleton className="h-6 w-20 rounded-full" />}
              </div>
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          ))}
        </div>
      </section>
    </SkeletonPage>
  );
}
