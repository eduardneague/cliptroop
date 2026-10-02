import { Skeleton, SkeletonLines, SkeletonPage } from "@/components/ui/skeleton";

// Fallback for any dashboard route without its own loading.tsx: a neutral
// page (title, a line, a couple of cards) that won't look out of place.
export default function Loading() {
  return (
    <SkeletonPage width="max-w-5xl">
      <div aria-hidden>
        <Skeleton className="h-9 w-64 mb-3" />
        <Skeleton className="h-4 w-80 max-w-full mb-8" />
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-line/10 bg-surface p-5 sm:p-6">
              <Skeleton className="h-3.5 w-28 mb-4" />
              <SkeletonLines lines={i ? 3 : 4} />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
