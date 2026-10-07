import { Skeleton, SkeletonLines, SkeletonPage } from "@/components/ui/skeleton";

/** App setup: the title, the intro, then the numbered cards. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-3xl" className="px-4 sm:px-8 py-6 sm:py-8 space-y-5">
      <header aria-hidden>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <h1 className="font-display text-[28px] font-semibold">App setup</h1>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <SkeletonLines lines={2} />
      </header>
      {[0, 1, 2, 3].map((i) => (
        <section key={i} className="rounded-2xl border border-line/10 bg-surface p-5 sm:p-6" aria-hidden>
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <Skeleton className={`h-5 ${["w-56", "w-48", "w-64", "w-44"][i]} max-w-full`} />
          </div>
          <SkeletonLines lines={2} className="mb-4" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </section>
      ))}
    </SkeletonPage>
  );
}
