import { Skeleton } from "@/components/ui/skeleton";

/** Frame Guides: the title, the collections and a grid of frames, while the page loads. */
export default function Loading() {
  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 w-full max-w-[1520px] mx-auto" aria-busy="true" aria-label="Loading Frame Guides">
      <Skeleton className="h-10 w-64 mb-3" />
      <Skeleton className="h-4 w-full max-w-xl mb-8" />
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        <div className="hidden lg:block space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
        <div>
          <Skeleton className="h-11 w-full rounded-xl" />
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(212px,1fr))] gap-x-4 gap-y-5">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i}>
                <Skeleton className="aspect-video w-full rounded-xl" />
                <Skeleton className="h-3.5 w-2/3 mt-2.5" />
                <Skeleton className="h-3 w-1/2 mt-1.5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
