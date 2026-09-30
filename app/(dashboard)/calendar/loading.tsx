import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="px-3 sm:px-8 py-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="grid grid-cols-7 gap-px rounded-2xl overflow-hidden">
        {Array.from({ length: 35 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-none" />
        ))}
      </div>
    </div>
  );
}
