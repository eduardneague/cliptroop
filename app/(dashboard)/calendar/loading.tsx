import { Skeleton } from "@/components/ui/skeleton";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Calendar: month title and controls, the filters, then the month grid. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="px-3 sm:px-6 lg:px-8 py-6">
      <span className="sr-only">Loading…</span>
      <div className="space-y-4" aria-hidden>
        <div className="flex items-center gap-2 flex-wrap">
          <Skeleton className="h-8 sm:h-9 w-52 mr-2" />
          <Skeleton className="w-10 h-10 rounded-lg" />
          <Skeleton className="w-[68px] h-10 rounded-lg" />
          <Skeleton className="w-10 h-10 rounded-lg" />
          <span className="flex-1" />
          <div className="flex items-center rounded-lg border border-line/20 p-0.5">
            {["Month", "Week", "Agenda"].map((v) => (
              <span key={v} className="px-3.5 h-9 inline-flex items-center rounded-md text-[13.5px] font-semibold text-ink-faint">
                {v}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="rounded-2xl border border-line/15 overflow-hidden bg-surface">
          <div className="grid grid-cols-7 border-b border-line/15 bg-surface-2/40">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`px-3 py-2.5 text-[12px] font-bold uppercase tracking-wide ${i >= 5 ? "text-ink-faint" : "text-ink-soft"}`}>
                <span className="sm:hidden">{w.slice(0, 1)}</span>
                <span className="hidden sm:inline">{w}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => (
              <div key={i} className={`min-h-[3.4rem] sm:min-h-[9.5rem] p-1.5 sm:p-2 border-line/15 ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""}`}>
                <Skeleton className="w-6 h-6 sm:w-7 sm:h-7 rounded-full" />
                {(i * 7) % 5 < 2 && <Skeleton className="hidden sm:block mt-2 h-7 rounded-lg" />}
                {(i * 3) % 7 === 0 && <Skeleton className="hidden sm:block mt-1 h-7 w-3/4 rounded-lg" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
