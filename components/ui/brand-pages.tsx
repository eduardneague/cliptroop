"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isBrandPage } from "@/lib/public-pages";

/**
 * The brand pages (home, sign-in, status, legal) always show the brand
 * colours: moving to one from inside the app takes the colour theme (and
 * the glass look) off.
 * The app's layout puts it back (PaletteSync) when you return. On a fresh
 * load the root layout's first-paint script already leaves it off.
 */
export function BrandPages() {
  const pathname = usePathname();
  useEffect(() => {
    if (isBrandPage(pathname)) {
      delete document.documentElement.dataset.palette;
      // The glass look too (1.27.5): GlassSync puts it back in the app.
      delete document.documentElement.dataset.glass;
    }
  }, [pathname]);
  return null;
}
