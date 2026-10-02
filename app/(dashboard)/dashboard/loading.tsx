import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";
import { CATALOG, DEFAULT_LAYOUT, limitsFor, toBox, type WidgetType } from "@/modules/dashboard/layout";
import { bottom, fill, readingOrder } from "@/modules/dashboard/grid";

/**
 * The dashboard while it loads: the default board, same grid and sizes as
 * the real one (same CSS), each widget showing its own outline. Saved
 * layouts differ per person, but the frame stays put while it fills in.
 */
export default function Loading() {
  const widgets = DEFAULT_LAYOUT.widgets;
  const boxes = fill(widgets.map(toBox), limitsFor(widgets));
  const order = new Map(readingOrder(boxes).map((id, k) => [id, k]));
  const rows = bottom(boxes);

  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="px-3 sm:px-5 xl:px-6 py-4 sm:py-5 w-full">
      <span className="sr-only">Loading…</span>
      <header className="flex items-center gap-3 flex-wrap mb-4" aria-hidden>
        <div className="flex-1 min-w-0">
          <Skeleton className="h-6 sm:h-7 w-56 mb-1.5" />
          <Skeleton className="h-3.5 w-48" />
        </div>
        <Skeleton className="h-8 w-28 rounded-lg" />
      </header>

      <div className="dash-cq" aria-hidden>
        <div className="dash-board" style={{ ["--rows" as string]: rows }}>
          {widgets.map((w) => {
            const b = boxes.find((x) => x.i === w.id)!;
            const meta = CATALOG[w.type];
            return (
              <div
                key={w.id}
                className="dash-item flex flex-col rounded-xl border border-line/10 bg-surface p-3 overflow-hidden"
                style={
                  {
                    "--x": b.x,
                    "--y": b.y,
                    "--w": b.w,
                    "--h": b.h,
                    "--o": order.get(w.id) ?? 0,
                    "--mw": w.w >= 6 ? 2 : 1,
                    "--mh": Math.max(2, Math.min(7, w.h)),
                  } as React.CSSProperties
                }
              >
                {!meta.bare && (
                  <div className="flex items-center h-5 mb-2 flex-shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint truncate">{meta.name}</span>
                  </div>
                )}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <WidgetBones type={w.type} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WidgetBones({ type }: { type: WidgetType }) {
  switch (type) {
    case "tasks":
      return (
        <>
          <div className="flex gap-1 mb-3">
            <Skeleton className="h-7 w-16 rounded-lg" />
            <Skeleton className="h-7 w-14 rounded-lg" />
            <Skeleton className="h-7 w-12 rounded-lg" />
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="w-4 h-4 rounded" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className={`h-3 ${i % 3 === 0 ? "w-4/5" : i % 3 === 1 ? "w-3/5" : "w-2/3"}`} />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </>
      );
    case "clock":
      return (
        <div className="flex-1 flex items-center justify-center gap-3">
          <SkeletonCircle className="w-[min(5.5rem,60%)] aspect-square" />
        </div>
      );
    case "weather":
      return (
        <div className="flex-1 flex items-center gap-3">
          <SkeletonCircle className="w-12 h-12" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      );
    case "teams":
      return (
        <div className="flex items-center gap-2">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      );
    case "posting":
      return (
        <div className="space-y-2">
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      );
    case "todo":
      return (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="w-4 h-4 rounded-full" />
              <Skeleton className={`h-3 ${["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-1/3"][i]}`} />
            </div>
          ))}
        </div>
      );
    case "upcomingShorts":
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className={`h-3 ${i % 2 ? "w-2/3" : "w-4/5"}`} />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      );
    case "minicalendar":
      return (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded" />
          ))}
        </div>
      );
    case "upcomingLongs":
      return (
        <div className="flex gap-3 h-full">
          {[0, 1].map((i) => (
            <div key={i} className="flex-1 min-w-0 space-y-2">
              <Skeleton className="aspect-video w-full rounded-lg" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      );
    case "contributions":
      return (
        <div className="flex-1 min-h-0 grid grid-flow-col grid-rows-[repeat(7,12px)] auto-cols-[12px] gap-[3px] content-start justify-center overflow-hidden">
          {Array.from({ length: 7 * 53 }, (_, i) => (
            <Skeleton key={i} className="rounded-[3px]" />
          ))}
        </div>
      );
    case "meetings":
      return (
        <div className="flex items-start gap-3">
          <Skeleton className="w-12 h-[52px] rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
        </div>
      );
    case "pipeline":
      return (
        <div className="flex-1 flex items-end gap-3">
          {[55, 80, 40, 65, 30, 50, 70].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <div aria-hidden className="w-full skeleton rounded-lg" style={{ height: `${h}%` }} />
              <Skeleton className="h-2.5 w-3/4" />
            </div>
          ))}
        </div>
      );
  }
}
