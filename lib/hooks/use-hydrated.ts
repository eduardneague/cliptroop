"use client";

import { useCallback, useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * false on the server and while the page comes alive in the browser, true
 * right after. Anything that depends on THIS device (its time zone, its
 * language, the exact current minute) must look the same as the server's
 * HTML until then, or React throws away the page part ("Minified React
 * error #418"). The server runs in UTC; people don't.
 */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * Format a moment in this device's time zone (in the app's English, en-US), safely: until
 * the page is live it formats exactly like the server (UTC), then
 * re-renders in local time. Use it for every date or time a client
 * component shows while rendering (not needed inside click handlers or
 * in things that only appear after a click).
 */
export function useLocalFormat() {
  const hydrated = useHydrated();
  return useCallback(
    (at: string | number | Date, options: Intl.DateTimeFormatOptions) => {
      const d = at instanceof Date ? at : new Date(at);
      if (Number.isNaN(d.getTime())) return "";
      return hydrated ? d.toLocaleString("en-US", options) : d.toLocaleString("en-US", { ...options, timeZone: "UTC" });
    },
    [hydrated]
  );
}
