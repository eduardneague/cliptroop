import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/public-pages";

/*
 * The app itself is private (everything needs a sign-in), but the public
 * pages MUST be readable by robots: Meta, Google and TikTok fetch the
 * privacy policy, terms and data deletion page (and Google the home page)
 * to check them, and they respect robots.txt. Before 1.9.5 everything was
 * blocked, so Meta said the data deletion URL "should represent a valid URL".
 * Everything else stays closed to crawlers.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      // "/$" = only the home page itself (the longest matching rule wins).
      allow: ["/$", ...PUBLIC_PAGES],
      disallow: "/",
    },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
