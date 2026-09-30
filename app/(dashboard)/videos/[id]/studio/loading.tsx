import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="px-3 sm:px-6 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-56" />
        <span className="flex-1" />
        <Skeleton className="h-9 w-80" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-video w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[520px] rounded-2xl" />
      </div>
    </div>
  );
}
