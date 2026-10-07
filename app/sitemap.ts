import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/public-pages";

// Only the public pages (home, privacy, terms, data deletion): everything
// else needs a sign-in and is closed to crawlers (robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!base) return [];
  return ["/", ...PUBLIC_PAGES].map((p) => ({ url: `${base}${p === "/" ? "/" : p}`, lastModified: new Date() }));
}
