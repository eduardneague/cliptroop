/**
 * Loading placeholders. Every route's loading.tsx is built from these so
 * navigation shows the page's real shape IMMEDIATELY while the server
 * fetches data, instead of freezing on the old page.
 *
 * Rule of thumb for loading.tsx files: words that never change (page titles,
 * tab names, column headings) are rendered as real text; only the data
 * shimmers. That way the page "arrives" in place instead of swapping.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  // Own rounding when the caller gives one (rounded-full, rounded-xl…), so
  // the two never fight over which wins in the CSS.
  const round = /(^|\s)rounded/.test(className) ? "" : "rounded-md ";
  return <div aria-hidden className={`skeleton ${round}${className}`} />;
}

export function SkeletonCircle({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton rounded-full flex-shrink-0 ${className}`} />;
}

/** Page wrapper matching the real pages' padding/width. */
export function SkeletonPage({
  children,
  width = "max-w-3xl",
  className = "px-4 sm:px-10 py-5 sm:py-9",
}: {
  children: React.ReactNode;
  width?: string;
  /** Padding classes, when the real page uses different ones. */
  className?: string;
}) {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className={`${className} w-full ${width} mx-auto`}>
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

export function SkeletonCard({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line/10 bg-surface p-6 ${className}`}>{children}</div>;
}

/** A row with an avatar and two text lines — members, comments, etc. */
export function SkeletonPersonRow({ className = "py-3 border-b border-line/10 last:border-none" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <SkeletonCircle className="w-8 h-8" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    </div>
  );
}

/** "← Back to …" link at the top of detail pages. */
export function SkeletonBack({ label, className = "mb-4" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-sm text-ink-faint ${className}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {label ? <span>{label}</span> : <Skeleton className="h-3.5 w-24" />}
    </div>
  );
}

/** Underlined tab row (Settings, Team). Names are real text; `active` is underlined when known. */
export function SkeletonTabs({ tabs, active }: { tabs: string[]; active?: string }) {
  return (
    <div className="flex items-center gap-1 border-b border-line/15 overflow-x-hidden -mx-1 px-1" aria-hidden>
      {tabs.map((t) => (
        <span
          key={t}
          className={`relative px-3.5 h-11 inline-flex items-center text-[14px] font-semibold whitespace-nowrap ${t === active ? "text-ink" : "text-ink-faint"}`}
        >
          {t}
          {t === active && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-amber" />}
        </span>
      ))}
    </div>
  );
}

/** A few lines of text with natural, uneven lengths. */
export function SkeletonLines({ lines = 3, className = "", height = "h-3" }: { lines?: number; className?: string; height?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-9/12", "w-10/12", "w-2/3"];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`${height} ${i === lines - 1 && lines > 1 ? "w-1/2" : widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

/** A section card with its small uppercase heading (real text when known). */
export function SkeletonSection({
  title,
  children,
  className = "",
}: {
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line/10 bg-surface p-5 sm:p-6 ${className}`} aria-hidden>
      {title ? (
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-faint mb-4">{title}</h2>
      ) : (
        <Skeleton className="h-3.5 w-28 mb-4" />
      )}
      {children}
    </section>
  );
}

/** Rounded button-shaped block. */
export function SkeletonButton({ className = "h-10 w-28" }: { className?: string }) {
  return <Skeleton className={`rounded-lg ${className}`} />;
}

/** The numbered steps row on a short or long video: names real, nothing lit yet. */
export function SkeletonSteps({ labels }: { labels: string[] }) {
  return (
    <div className="flex items-center mb-6 overflow-hidden pb-1" aria-hidden>
      {labels.map((label, i) => (
        <div key={label} className="flex items-center flex-shrink-0">
          <div className="flex flex-col items-center gap-1.5 min-w-[64px] sm:min-w-[76px] pt-1">
            <div className="w-7 h-7 rounded-full border-2 border-line/20 flex items-center justify-center text-[11px] font-bold text-ink-faint">{i + 1}</div>
            <span className="text-[10.5px] font-bold whitespace-nowrap text-ink-faint">{label}</span>
          </div>
          {i < labels.length - 1 && <div className="w-5 sm:w-8 h-[2px] mb-6 rounded-full bg-line/15" />}
        </div>
      ))}
    </div>
  );
}
