import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";
import { SHORT_STAGES, SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";

const WIDE =
  "md:grid-cols-[40px_minmax(0,1fr)_120px_60px_64px] lg:grid-cols-[40px_minmax(0,1fr)_160px_120px_60px_64px] xl:grid-cols-[44px_minmax(0,1fr)_160px_120px_150px_64px] 2xl:grid-cols-[48px_minmax(0,1fr)_140px_160px_120px_150px_64px] gap-3";
const COLS = `grid grid-cols-[36px_minmax(0,1fr)_auto] ${WIDE}`;

/** Shorts list: the title, the step filters and the table, rows shimmering. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[1500px]">
      <div className="flex items-start justify-between gap-6 mb-6 flex-wrap" aria-hidden>
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Short videos</h1>
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>

      <div className="flex items-center gap-2 mb-6" aria-hidden>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex gap-1 w-max items-center">
            {["All", ...SHORT_STAGES.map((s) => SHORT_STAGE_LABELS[s])].map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[12.5px] font-semibold whitespace-nowrap text-ink-faint">
                {label}
                <Skeleton className="h-2.5 w-3" />
              </span>
            ))}
          </div>
        </div>
        <Skeleton className="h-9 w-[70px] rounded-lg" />
      </div>
      <Skeleton className="-mt-3 mb-6 h-8 w-24 rounded-lg" />

      <div className="rounded-xl border border-line/10 bg-surface overflow-hidden" aria-hidden>
        <div className={`hidden md:grid ${WIDE} px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint`}>
          <span className="text-right">#</span>
          <span>Title</span>
          <span className="hidden 2xl:block">Planned</span>
          <span className="hidden lg:block">Editor</span>
          <span>Status</span>
          <span>Posted</span>
          <span />
        </div>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={`${COLS} items-center px-3 py-3 border-t border-line/10`}>
            <Skeleton className="h-3 w-5 justify-self-end" />
            <div className="min-w-0 space-y-1.5">
              <Skeleton className={`h-3.5 ${["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-[45%]"][i % 5]}`} />
              <Skeleton className="h-2.5 w-28" />
            </div>
            <Skeleton className="hidden 2xl:block h-3 w-20" />
            <div className="hidden lg:flex items-center gap-2">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="hidden md:block h-6 w-20 rounded-full" />
            <Skeleton className="hidden md:block h-5 w-12" />
            <Skeleton className="h-7 w-14 rounded-lg justify-self-end md:justify-self-start" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
