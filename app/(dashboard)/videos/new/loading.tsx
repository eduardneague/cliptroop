import { Skeleton, SkeletonBack, SkeletonPage } from "@/components/ui/skeleton";

/**
 * New long video. Needed so the long videos LIST skeleton (one folder up)
 * doesn't show while this form loads.
 */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-3xl" className="px-4 sm:px-8 py-6 sm:py-8">
      <SkeletonBack label="Long videos" />
      <div aria-hidden>
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <h1 className="text-[26px] sm:text-[30px] font-display font-semibold leading-tight">New long video</h1>
        </div>
        <div className="space-y-5">
          <Section title="Titles">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="h-11 flex-1 rounded-xl" />
              </div>
            ))}
          </Section>
          <Section title="Idea">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </Section>
          <Section title="When and where">
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-11 rounded-xl" />
              <Skeleton className="h-11 rounded-xl" />
            </div>
          </Section>
          <Section title="People">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-11 rounded-xl" />
              ))}
            </div>
          </Section>
        </div>
      </div>
    </SkeletonPage>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-5 sm:p-6 space-y-4">
      <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}
