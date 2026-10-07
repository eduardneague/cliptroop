import { Brand } from "@/components/ui/clip-logo";
import { Skeleton } from "@/components/ui/skeleton";

/** Status: checking every part takes a moment, so its shape shows first. */
export default function Loading() {
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:py-12" role="status" aria-label="Checking" aria-busy="true">
      <div className="mx-auto max-w-2xl space-y-6" aria-hidden>
        <header className="flex items-center justify-between gap-3">
          <Brand />
          <Skeleton className="h-3 w-20" />
        </header>
        <section className="rounded-2xl border border-line/10 bg-surface px-5 py-4">
          <Skeleton className="h-6 w-56 mb-2" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </section>
        {[6, 5].map((n, k) => (
          <section key={k} className="rounded-2xl border border-line/10 bg-surface px-5 py-2">
            <Skeleton className="h-3 w-28 mt-3 mb-1" />
            <ul className="divide-y divide-line/10">
              {Array.from({ length: n }, (_, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <Skeleton className="w-2.5 h-2.5 rounded-full" />
                  <Skeleton className={`h-3.5 ${["w-32", "w-40", "w-28", "w-36", "w-24", "w-32"][i % 6]}`} />
                  <span className="flex-1" />
                  <Skeleton className="h-3 w-16" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
