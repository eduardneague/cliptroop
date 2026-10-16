"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { flashWhenReady, hashTarget } from "@/lib/flash";

/**
 * An address with a part of the page in it ("/settings?tab=preferences#sounds"),
 * opened from a link, the search bar or another app: once that part is on
 * screen, it scrolls into view and glows for a moment (1.26.0).
 */
export function HashFlash() {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  useEffect(() => {
    const id = hashTarget();
    if (id) flashWhenReady(id);
  }, [pathname, qs]);
  useEffect(() => {
    const onHash = () => {
      const id = hashTarget();
      if (id) flashWhenReady(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return null;
}
