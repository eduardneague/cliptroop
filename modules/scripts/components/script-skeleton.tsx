import { Fragment } from "react";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { PaperHead, PaperSheet } from "./paper-sheet";

/** A button's place in the bar (the real ones' size: formatting 36 px, the bar's ends 32 px), a small shape for its icon. */
const Btn = ({ className = "", small = false }: { className?: string; small?: boolean }) => (
  <span className={`${small ? "w-8 h-8" : "w-9 h-9"} flex items-center justify-center flex-shrink-0 ${className}`}>
    <Skeleton className="h-4 w-4 rounded-[5px]" />
  </span>
);
const Sep = ({ className = "", short = false }: { className?: string; short?: boolean }) => (
  <span className={`w-px ${short ? "h-5" : "h-6"} bg-line/15 mx-1 flex-shrink-0 ${className}`} />
);

/**
 * The script page while it opens, in the page's own shape (1.55.6: after 1.55.2's one bar and 1.55.4's page without
 * the documents column; it still had both rows and the column). On a computer one bar: the way back and the
 * documents, the formatting (as much of it as the width holds, as the real bar does), then the save state, the words,
 * the page's buttons and the step's. On a phone the title row and the steps above the formatting bar. Then the paper,
 * centred, as wide as the person keeps it, light or dark as they picked. Shared by the short and long video script
 * pages.
 */
export function ScriptSkeleton() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="min-h-[calc(100dvh-3.5rem)] flex flex-col">
      <span className="sr-only">Loading…</span>
      <PaperHead>
        {/* Phones: the title row and the steps, above the formatting bar. */}
        <div className="sm:hidden" aria-hidden>
          <div data-head-row="" className="flex items-center gap-2 px-3 h-12 border-b border-line/10">
            <span className="w-8 h-8 -ml-1 flex items-center justify-center text-ink-faint flex-shrink-0">
              <ArrowLeftIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <Skeleton className="h-3.5 w-6 flex-shrink-0" />
              <Skeleton className="h-3.5 w-full max-w-[9rem]" />
            </div>
            <Skeleton className="h-8 w-[7.5rem] rounded-lg flex-shrink-0" />
            <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
          </div>
          <div data-head-row="" className="border-b border-line/10">
            <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap">
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="w-2.5 h-px bg-line/30 mx-0.5 flex-shrink-0" />}
                    <Skeleton className="h-8 w-[5.75rem] rounded-lg" />
                  </Fragment>
                ))}
              </div>
              <Skeleton className="h-8 w-[5.5rem] rounded-lg" />
              <span className="flex-1" />
              <Skeleton className="h-8 w-40 rounded-lg" />
            </div>
          </div>
        </div>

        {/* The one bar (on a phone, the formatting bar). */}
        <div data-head-row="" className="flex items-center min-h-12 border-b border-line/10 bg-paper" aria-hidden>
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0 pl-2 lg:pl-3">
            <span className="w-8 h-8 flex items-center justify-center text-ink-faint flex-shrink-0">
              <ArrowLeftIcon className="w-4 h-4" />
            </span>
            <Skeleton className="h-8 w-[8.75rem] rounded-lg" />
          </div>
          {/* The formatting, centred between the ends on a computer (the real bar's own padding: 6 px round a 40 px menu). */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="sm:mx-auto sm:w-max px-2 py-1.5 flex items-center gap-0.5">
              <Skeleton className="h-10 w-32 sm:w-[4.75rem] md:w-32 rounded-lg flex-shrink-0 mr-1" />
              <Btn />
              <Btn />
              <Btn />
              <Btn className="hidden xl:flex" />
              <Sep className="hidden xl:block" />
              <Btn className="hidden xl:flex" />
              <Btn className="hidden xl:flex" />
              <Sep className="hidden sm:block" />
              <span className="flex-1 sm:hidden" />
              <Btn />
              <Btn className="hidden lg:flex" />
              <Btn className="hidden xl:flex" />
              <Btn className="hidden xl:flex" />
              <Btn className="hidden lg:flex" />
              <Sep className="hidden lg:block" />
              <Btn className="hidden lg:flex" />
              <Btn className="hidden lg:flex" />
              <Btn className="hidden lg:flex" />
              <Btn className="hidden xl:flex" />
              <span className="w-9 h-9 flex sm:hidden items-center justify-center flex-shrink-0">
                <Skeleton className="h-3.5 w-9" />
              </span>
              <Btn className="hidden sm:flex xl:hidden" />
              <Sep className="hidden xl:block" />
              <Btn className="hidden xl:flex" />
              <Btn className="hidden xl:flex" />
              <Sep className="hidden md:block" />
              <Btn className="hidden md:flex" />
              <span className="hidden md:flex w-9 h-9 items-center justify-center flex-shrink-0">
                <Skeleton className="h-7 w-7 rounded-full" />
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-0.5 flex-shrink-0 pl-1 pr-2 lg:pr-3">
            <Btn small />
            <Skeleton className="hidden 2xl:block h-3 w-28 mx-1.5" />
            <Sep short />
            <Btn small className="hidden lg:flex" />
            <Btn small className="hidden lg:flex" />
            <Btn small className="hidden lg:flex" />
            <Btn small />
            <Sep short />
            <Btn small />
            <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
          </div>
        </div>
      </PaperHead>

      <div className="flex-1 min-w-0 px-3 sm:px-8 py-6 sm:py-10" aria-hidden>
        <PaperSheet>
          <PaperLines />
        </PaperSheet>
      </div>
    </div>
  );
}

/** A page's worth of headings and lines shimmering in (also used while switching documents). */
export function PaperLines() {
  return (
    <div role="status" aria-label="Loading the document" aria-busy="true">
      {[
        ["w-24", ["w-full", "w-2/3"]],
        ["w-20", ["w-full", "w-11/12", "w-4/5", "w-full", "w-1/2"]],
        ["w-40", ["w-3/4"]],
      ].map(([head, lines], k) => (
        <div key={k} className={k ? "mt-9" : ""} aria-hidden>
          <Skeleton className={`h-6 ${head} mb-4`} />
          <div className="space-y-3">
            {(lines as string[]).map((w, i) => (
              <Skeleton key={i} className={`h-3.5 ${w}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
