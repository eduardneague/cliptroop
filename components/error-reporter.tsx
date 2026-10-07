"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isNetworkNoise } from "@/lib/network-noise";

/*
 * Sends browser errors to /api/errors (counted + alerted there). Skips the
 * noise every site gets (browser extensions, ResizeObserver, cross-origin
 * "Script error.", a connection that dropped mid-way), sends each message
 * once per page view and at most 5.
 */

const sent = new Set<string>();
let count = 0;

function ignorable(message: string, stack: string) {
  return (
    !message ||
    /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection/i.test(message) ||
    isNetworkNoise(message) ||
    /chrome-extension:|moz-extension:|safari-extension:/.test(stack)
  );
}

export function reportBrowserError(input: { message: string; stack?: string | null; digest?: string | null; route?: string }) {
  const message = String(input.message ?? "").slice(0, 500);
  const stack = String(input.stack ?? "").slice(0, 4000);
  if (ignorable(message, stack) || sent.has(message) || count >= 5) return;
  sent.add(message);
  count++;
  try {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, stack, digest: input.digest ?? null, route: input.route ?? location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let reporting break anything */
  }
}

export function ErrorReporter() {
  const path = usePathname();
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportBrowserError({ message: e.message, stack: e.error?.stack, route: path });
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      reportBrowserError({ message: r instanceof Error ? r.message : String(r ?? ""), stack: r instanceof Error ? r.stack : null, route: path });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [path]);
  return null;
}
