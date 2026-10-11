import Link from "next/link";
import { CompassIcon } from "./icons";
import { BackButton } from "./back-button";

/**
 * Shared 404 body — used inside the dashboard shell (so you keep the
 * sidebar and can navigate away) and standalone at the root.
 */
export function NotFoundContent({ inShell = true }: { inShell?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center px-6 ${
        inShell ? "min-h-[calc(100dvh-8rem)]" : "min-h-dvh"
      }`}
    >
      <div className="max-w-md text-center animate-[modalin_.35s_ease]">
        <div className="relative mx-auto mb-7 w-24 h-24">
          <div className="absolute inset-0 rounded-[28px] bg-amber/10 animate-[pulse-ring_2.4s_ease-out_infinite]" />
          <div className="relative w-24 h-24 rounded-[28px] border border-amber/25 bg-surface flex items-center justify-center shadow-[0_10px_30px_-12px_rgb(var(--amber)/0.45)]">
            <CompassIcon className="w-11 h-11 text-amber animate-[compass-wobble_4s_ease-in-out_infinite]" />
          </div>
        </div>
        <p className="font-mono text-[12px] font-semibold tracking-[0.2em] text-ink-faint mb-2">
          ERROR 404
        </p>
        <h1 className="font-display text-[34px] leading-tight font-semibold mb-3">
          This page wandered off
        </h1>
        <p className="text-[14.5px] text-ink-soft leading-relaxed mb-8">
          The link may be old, the project may have been deleted, or it
          belongs to a team you&rsquo;re not part of.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-xl bg-amber text-white font-bold px-5 py-2.5 text-[14px] shadow-[0_3px_0_0_rgb(var(--amber)/0.5)] hover:brightness-105 active:translate-y-[2px] active:shadow-none transition-all"
          >
            Go to dashboard
          </Link>
          <Link
            href="/videos"
            className="inline-flex items-center rounded-xl border border-line/15 px-5 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 transition-colors"
          >
            Long videos
          </Link>
          <BackButton />
        </div>
      </div>
    </div>
  );
}
