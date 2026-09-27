import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="px-4 sm:px-8 py-6 max-w-[1500px] mx-auto">
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-8 w-72 mb-5" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-[60vh] w-full rounded-2xl" />
        <Skeleton className="h-[60vh] w-full rounded-2xl" />
      </div>
    </div>
  );
}
