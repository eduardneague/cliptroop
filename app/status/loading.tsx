import { Brand } from "@/components/ui/clip-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPartsSkeleton } from "@/components/status/status-skeleton";

/** Status: checking every part takes a moment, so its shape shows first. */
export default function Loading() {
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:py-12" role="status" aria-label="Checking" aria-busy="true">
      <div className="mx-auto max-w-3xl space-y-6" aria-hidden>
        <header className="flex items-center justify-between gap-3">
          <Brand />
          <Skeleton className="h-3 w-20" />
        </header>
        <section className="rounded-2xl border border-line/10 bg-surface px-5 py-4 flex items-start gap-3.5">
          <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-6 w-56 mb-2" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        </section>
        <StatusPartsSkeleton rows={7} />
        <StatusPartsSkeleton rows={3} />
      </div>
    </main>
  );
}
