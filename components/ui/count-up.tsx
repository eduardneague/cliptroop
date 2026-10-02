"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** True when animations are off (the account setting, or the device asks for less motion). */
export function motionReduced() {
  if (typeof window === "undefined") return true;
  const m = document.documentElement.dataset.motion;
  if (m === "off") return true;
  if (m === "on") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * A number that counts up to its value (and glides to new values).
 * Renders the real value first (server and first paint), so it's safe
 * anywhere; the count starts before the browser paints.
 */
export function useCountUp(value: number, ms = 700) {
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null);
  useLayoutEffect(() => {
    const start = from.current ?? 0;
    from.current = value;
    if (motionReduced() || start === value) return setShown(value);
    setShown(start);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function CountUp({ value, ms }: { value: number; ms?: number }) {
  return <>{useCountUp(value, ms)}</>;
}
