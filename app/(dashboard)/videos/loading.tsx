import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";
import { STAGE_LABELS, STAGE_ORDER } from "@/modules/long-videos/lib/stages";

/** Long videos: title, step filters, then the cards (the default view). */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1720px]">
      <div className="flex items-start justify-between gap-6 mb-7 flex-wrap" aria-hidden>
        <div>
          <h1 className="font-display text-[40px] leading-none font-semibold mb-2.5">Long-form videos</h1>
          <Skeleton className="h-4 w-72 max-w-[70vw]" />
        </div>
        <Skeleton className="h-[52px] w-40 rounded-xl" />
      </div>

      <div className="flex items-center justify-between gap-3 mb-7" aria-hidden>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex gap-1 w-max sm:w-auto sm:flex-wrap">
            {["All", ...STAGE_ORDER.map((s) => STAGE_LABELS[s])].map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-ink-faint">
                {label}
                <Skeleton className="h-2.5 w-3" />
              </span>
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-[70px] rounded-lg flex-shrink-0" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={`rounded-2xl border-2 border-line/10 bg-surface overflow-hidden flex flex-col ${i >= 4 ? "hidden sm:flex" : ""}`}>
            <div className="relative">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="absolute top-2.5 left-2.5 h-6 w-16 rounded-full bg-surface/70" />
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              <Skeleton className={`h-4 ${["w-5/6", "w-3/4", "w-2/3", "w-4/5"][i % 4]}`} />
              <Skeleton className="h-2.5 w-24" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-8 w-full rounded-lg mt-1" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
