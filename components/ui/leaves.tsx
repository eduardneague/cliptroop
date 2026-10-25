"use client";

import { useLayoutEffect, useRef } from "react";
import { useLatest } from "@/lib/hooks/use-scroll-lock";
import { leaveCopy } from "@/lib/pop-ghost";

/**
 * Around a pop-up that's on the page only while it's open (1.34.0): when it closes, it leaves the way it came in,
 * backwards (lib/pop-ghost.ts), and nothing in it can be pressed meanwhile. Its moving parts carry the pop-* classes
 * (globals.css, "Pop-ups"). `lock`: the pop-up holds the page still while it's open, and goes on doing so while it
 * leaves. No box of its own (display: contents): what's inside lays out as if it weren't there.
 */
export function Leaves({ children, lock = false, as: Tag = "div" }: { children: React.ReactNode; lock?: boolean; as?: "div" | "span" }) {
  const ref = useRef<HTMLElement>(null);
  const locks = useLatest(lock);
  useLayoutEffect(() => {
    const el = ref.current;
    // Before React takes it off the page (a layout effect's clean-up runs while it's still there).
    return () => {
      if (el) leaveCopy(el, { lock: locks.current });
    };
  }, [locks]);
  // A <span> inside words (a pill's little pop-up), so the page stays valid HTML.
  return (
    <Tag ref={ref as React.RefObject<never>} data-pop-root="" className="contents">
      {children}
    </Tag>
  );
}
