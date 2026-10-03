"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportBrowserError } from "@/components/error-reporter";
import { Mascot } from "./mascot";

/**
 * What people see when a page breaks: a calm message, Try again, and a way
 * home. Errors from the browser are reported here; server errors (they come
 * with a digest) were already counted on the server.
 */
export function ErrorScreen({ error, reset, compact = false }: { error: Error & { digest?: string }; reset: () => void; compact?: boolean }) {
  useEffect(() => {
    if (!error.digest) reportBrowserError({ message: error.message, stack: error.stack });
  }, [error]);
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? "py-16" : "min-h-[70vh] py-10"}`}>
      <Mascot size={88} mood="idle" />
      <h1 className="mt-4 font-display text-[22px] font-semibold">Something went wrong here</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft max-w-sm">
        It&rsquo;s been reported, so it can be fixed. Try again, or go back to the dashboard.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={reset} className="rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] hover:brightness-110">
          Try again
        </button>
        <Link href="/dashboard" className="rounded-lg border border-line/15 px-4 h-10 inline-flex items-center text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
          Dashboard
        </Link>
      </div>
      {error.digest && <p className="mt-4 text-[11px] text-ink-faint font-mono">Error {error.digest}</p>}
    </div>
  );
}
