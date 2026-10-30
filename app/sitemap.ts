import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/public-pages";
import { FEATURES } from "@/lib/site/features";
import { SITE_PLATFORMS } from "@/lib/site/platforms";

// Only the public pages (home, the website with every feature's and platform's page, privacy, terms, data
// deletion): everything else needs a sign-in and is closed to crawlers (robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!base) return [];
  const pages = ["/", ...PUBLIC_PAGES, ...FEATURES.map((f) => `/features/${f.slug}`), ...SITE_PLATFORMS.map((p) => `/platforms/${p.id}`)];
  return pages.map((p) => ({ url: `${base}${p === "/" ? "/" : p}`, lastModified: new Date() }));
}
