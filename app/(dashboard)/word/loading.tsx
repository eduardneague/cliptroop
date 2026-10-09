import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";

/** The daily word: the title, the empty board and the keyboard. */
export default function Loading() {
  return (
    <SkeletonPage width="max-w-[34rem]" className="px-4 sm:px-8 py-6 sm:py-8 flex flex-col items-center">
      <header className="w-full flex items-start gap-3 mb-5" aria-hidden>
        <div className="flex-1">
          <h1 className="font-display text-[30px] leading-tight font-semibold">Daily word</h1>
          <Skeleton className="h-3.5 w-72 max-w-full mt-1.5" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </header>
      <div className="grid gap-[6px] w-full max-w-[19.5rem]" aria-hidden>
        {Array.from({ length: 6 }, (_, r) => (
          <div key={r} className="grid grid-cols-5 gap-[6px]">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="aspect-square rounded-lg border-2 border-line/15" />
            ))}
          </div>
        ))}
      </div>
      <div className="h-9 mt-3" />
      <div className="w-full max-w-[30rem] space-y-[6px]" aria-hidden>
        {[10, 9, 9].map((n, r) => (
          <div key={r} className="flex justify-center gap-[5px]">
            {Array.from({ length: n }, (_, i) => (
              <Skeleton key={i} className={`h-[54px] rounded-lg ${r === 2 && (i === 0 || i === n - 1) ? "w-[3.6rem]" : "flex-1 max-w-[2.6rem]"}`} />
            ))}
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
