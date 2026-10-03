import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** Meetings: title, the next meeting card, then the list. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1100px]">
      <div className="flex items-start justify-between gap-6 mb-7 flex-wrap" aria-hidden>
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Meetings</h1>
          <p className="text-[14.5px] text-ink-faint">Plan the team&rsquo;s calls, answer if you&rsquo;re coming, keep the notes and what to do next.</p>
        </div>
        <Skeleton className="h-11 w-44 rounded-xl" />
      </div>
      <div className="space-y-8" aria-hidden>
        <div className="rounded-3xl border border-line/10 bg-surface p-5 sm:p-7">
          <Skeleton className="h-3 w-28 mb-5" />
          <div className="flex items-start gap-4">
            <Skeleton className="w-16 h-[72px] rounded-xl" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-line/10 flex gap-2">
            <Skeleton className="h-10 w-20 rounded-lg" />
            <Skeleton className="h-10 w-20 rounded-lg" />
            <Skeleton className="h-10 w-20 rounded-lg" />
          </div>
        </div>
        <div>
          <Skeleton className="h-3 w-24 mb-3" />
          <div className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/10 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3.5 px-4 py-3.5">
                <Skeleton className="w-12 h-[52px] rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className={`h-4 ${["w-1/2", "w-2/5", "w-3/5"][i]}`} />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
