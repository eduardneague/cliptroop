"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { relativeTime } from "@/lib/relative-time";

const noop = () => () => {};

/**
 * "5m ago" that never breaks hydration: the server and the browser render
 * it a moment apart (16s vs 17s), so the first paint keeps the server's
 * text and it refreshes itself every 30 seconds after that.
 */
export function Ago({ iso, className }: { iso: string; className?: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time dateTime={iso} className={className} title={mounted ? new Date(iso).toLocaleString() : undefined} suppressHydrationWarning>
      {relativeTime(iso)}
    </time>
  );
}
