import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import { StatusPartsSkeleton } from "@/components/status/status-skeleton";

/* The developer tabs while they load: the same cards, empty. */

export const DEV_TABS = [
  { id: "overview", label: "Overview" },
  { id: "usage", label: "Usage" },
  { id: "problems", label: "Problems" },
  { id: "status", label: "Status" },
] as const;
export type DevTab = (typeof DEV_TABS)[number]["id"];
export const devTab = (raw: string | null | undefined): DevTab => (DEV_TABS.some((t) => t.id === raw) ? (raw as DevTab) : "overview");

const box = "rounded-2xl border border-line/10 bg-surface p-4";

function Card({ wide = false, lines = 3, big = true }: { wide?: boolean; lines?: number; big?: boolean }) {
  return (
    <div className={`${box} ${wide ? "sm:col-span-2" : ""}`}>
      <Skeleton className="h-3 w-24 mb-4" />
      {big && <Skeleton className="h-7 w-20 mb-3" />}
      <SkeletonLines lines={lines} />
    </div>
  );
}

export function DevTabSkeleton({ tab }: { tab: DevTab }) {
  if (tab === "overview")
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
        <Card wide lines={4} big={false} />
        <Card />
        <Card />
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} lines={2} />
        ))}
        <Card wide lines={3} big={false} />
        <Card lines={3} />
        <Card lines={2} />
      </div>
    );
  if (tab === "usage")
    return (
      <div className="space-y-5" aria-hidden>
        <div className="grid gap-4 md:grid-cols-3">
          <Card lines={1} />
          <Card lines={1} />
          <Card lines={3} big={false} />
        </div>
        <div className={box}>
          <Skeleton className="h-3 w-28 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
        </div>
        <div className={box}>
          <Skeleton className="h-3 w-20 mb-4" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full mb-2" />
          ))}
        </div>
      </div>
    );
  if (tab === "problems")
    return (
      <div className="space-y-5" aria-hidden>
        {[0, 1].map((s) => (
          <div key={s} className={box}>
            <Skeleton className="h-3 w-20 mb-2" />
            <SkeletonLines lines={1} className="mb-3" />
            {[0, 1].map((i) => (
              <div key={i} className="flex items-start gap-3 py-3 border-t border-line/10">
                <div className="flex-1 space-y-2">
                  <Skeleton className={`h-3.5 ${i ? "w-1/2" : "w-2/3"}`} />
                  <Skeleton className="h-3 w-3/4" />
                </div>
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  return (
    <div className="space-y-5" aria-hidden>
      <div className={box}>
        <Skeleton className="h-3 w-24 mb-1" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-line/10 last:border-none">
            <Skeleton className="w-2.5 h-2.5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className={`h-3.5 ${["w-32", "w-40", "w-28", "w-56", "w-36", "w-24"][i]}`} />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <StatusPartsSkeleton rows={4} />
    </div>
  );
}
