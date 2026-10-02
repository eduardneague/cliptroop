import { Skeleton, SkeletonBack } from "@/components/ui/skeleton";

/** New team: the small centered form. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="min-h-[calc(100vh-57px)] flex items-center justify-center p-6">
      <span className="sr-only">Loading…</span>
      <div className="w-full max-w-md" aria-hidden>
        <SkeletonBack className="mb-6" />
        <h1 className="font-display text-3xl font-semibold mb-2">Name your team</h1>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-2/3 mb-8" />
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-11 w-full rounded-lg mb-5" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}
