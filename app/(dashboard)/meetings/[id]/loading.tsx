import { Skeleton, SkeletonBack, SkeletonLines, SkeletonPage, SkeletonPersonRow } from "@/components/ui/skeleton";

/** One meeting: title and time, your answer, agenda / notes / action items, people. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1200px]">
      <SkeletonBack label="Meetings" />
      <div className="flex items-start gap-3 mb-2" aria-hidden>
        <Skeleton className="mt-1 w-10 h-10 rounded-xl" />
        <Skeleton className="h-9 w-[420px] max-w-[70vw]" />
      </div>
      <div className="flex items-center gap-3 mb-6 pl-[52px]" aria-hidden>
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-4 w-60" />
      </div>
      <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 sm:gap-6" aria-hidden>
        <div className="space-y-5 sm:space-y-6">
          <div className="rounded-2xl border border-line/10 bg-surface p-5 flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-10 w-20 rounded-lg" />
            <Skeleton className="h-10 w-20 rounded-lg" />
            <Skeleton className="h-10 w-20 rounded-lg" />
          </div>
          {["Agenda", "Notes", "Action items"].map((t) => (
            <section key={t} className="rounded-2xl border border-line/10 bg-surface p-5">
              <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-faint mb-3">{t}</h2>
              <SkeletonLines lines={3} />
            </section>
          ))}
        </div>
        <div className="rounded-2xl border border-line/10 bg-surface p-5 self-start w-full">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-faint mb-2">People</h2>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonPersonRow key={i} />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
