"use client";

import { useEffect } from "react";
import { installMarquee } from "@/lib/overflow-marquee";

/** Words cut short in lists, menus and dropdowns slide into view while they're pointed at (1.43.0, lib/overflow-marquee.ts). */
export function OverflowMarquee() {
  useEffect(() => installMarquee(), []);
  return null;
}
