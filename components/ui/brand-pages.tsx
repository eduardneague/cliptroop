"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isBrandPage } from "@/lib/public-pages";

/**
 * The brand pages (home, sign-in, status, legal) always show the brand
 * colours: moving to one from inside the app takes the colour theme off.
 * The app's layout puts it back (PaletteSync) when you return. On a fresh
 * load the root layout's first-paint script already leaves it off.
 */
export function BrandPages() {
  const pathname = usePathname();
  useEffect(() => {
    if (isBrandPage(pathname)) delete document.documentElement.dataset.palette;
  }, [pathname]);
  return null;
}
