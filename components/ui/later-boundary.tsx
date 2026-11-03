"use client";

import { Component, type ReactNode } from "react";
import { reportBrowserError } from "@/components/error-reporter";

/** Code that couldn't be downloaded: offline for a moment, or a new version went live since the page opened. */
export const isLoadError = (e: Error) =>
  e.name === "ChunkLoadError" ||
  /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(e.message);

type Props = {
  /** For the error report: which part broke. */
  name: string;
  children: ReactNode;
  /** What shows instead (nothing when left out). `load`: its code didn't arrive (vs. it broke). */
  fallback?: (p: { load: boolean }) => ReactNode;
};

/**
 * Around a part of the app's frame that loads later (1.32.2: the search
 * window, the bell's cards, What's new's notes, Clip's tour, the
 * celebrations). When its code can't be downloaded (offline, or a new version
 * went live since the page opened) or it breaks, only that part says so, or
 * stays away; the page goes on. Real errors are reported, like a page's.
 */
export class LaterBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    const e = error instanceof Error ? error : new Error(String(error));
    if (!isLoadError(e)) reportBrowserError({ message: `${this.props.name}: ${e.message}`, stack: e.stack });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return this.props.fallback?.({ load: isLoadError(error) }) ?? null;
  }
}

/** What such a part says instead. Reload brings the page back with the app's current version. */
export function LaterFailed({ load, what, className = "" }: { load: boolean; what: string; className?: string }) {
  return (
    <div role="alert" className={`flex flex-col items-center justify-center text-center gap-2.5 px-4 py-7 ${className}`}>
      <p className="text-[13px] text-ink-soft leading-snug max-w-[19rem]">
        {load ? `${what} didn't load. Check your connection, then reload the page.` : `${what} hit a problem. It's been reported.`}
      </p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="rounded-lg border border-line/20 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/40"
      >
        Reload
      </button>
    </div>
  );
}
