import { Skeleton } from "@/components/ui/skeleton";

const NAMES = ["w-32", "w-24", "w-20", "w-36", "w-56", "w-36", "w-16"];

/** A status section while it loads: name, state, the strip of hourly bars, the axis. */
export function StatusPartsSkeleton({ rows }: { rows: number }) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface px-5 pt-4 pb-1">
      <Skeleton className="h-3 w-28 mb-1" />
      <ul className="divide-y divide-line/10">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="py-4">
            <div className="flex items-center gap-3 mb-2.5">
              <Skeleton className={`h-3.5 ${NAMES[i % NAMES.length]} max-w-full`} />
              <span className="flex-1" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-7 w-full rounded-[3px]" />
            <div className="mt-2 flex items-center gap-2">
              <Skeleton className="h-2.5 w-14" />
              <span className="flex-1" />
              <Skeleton className="h-2.5 w-20" />
              <span className="flex-1" />
              <Skeleton className="h-2.5 w-8" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
