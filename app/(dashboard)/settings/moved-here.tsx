"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DANGER_HREF } from "./account-parts";

/** Parts of Account that moved in 1.34.2, and where they are now (an old link or bookmark still finds them). */
export const MOVED: Record<string, string> = {
  "#report": "/settings?tab=help#report",
  "#tutorial": "/settings?tab=help#tutorial",
  "#delete-account": `${DANGER_HREF}#delete-account`,
};

/** On Account: an address with one of those parts in it goes to where it is now. */
export function MovedHere() {
  const router = useRouter();
  useEffect(() => {
    const to = MOVED[window.location.hash];
    if (to) router.replace(to, { scroll: false });
  }, [router]);
  return null;
}
