import { Skeleton, SkeletonPage, SkeletonTabs } from "@/components/ui/skeleton";

/** Settings: title, the tabs, then the Profile tab (picture + form). */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-4xl" className="px-4 sm:px-8 py-5 sm:py-8 space-y-6">
      <div aria-hidden>
        <h1 className="font-display text-3xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-ink-faint">Your account, across every team you&rsquo;re part of.</p>
      </div>
      <SkeletonTabs tabs={["Profile", "Teams", "Preferences", "Account"]} />
      <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr] items-start" aria-hidden>
        <section className="rounded-xl border border-line/10 bg-surface p-6">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-faint mb-4">Profile picture</h2>
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="w-24 h-24 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </section>
        <section className="rounded-xl border border-line/10 bg-surface p-6">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-faint mb-4">Profile</h2>
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i}>
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
            <div>
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
          <div className="mt-4 pt-4 border-t border-line/10">
            <span className="block text-xs font-semibold text-ink-faint mb-1.5">Email</span>
            <Skeleton className="h-3.5 w-48" />
          </div>
        </section>
      </div>
    </SkeletonPage>
  );
}
