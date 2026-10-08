import type { MetadataRoute } from "next";
import { OG_IMAGE, PUBLIC_PAGES, siteUrl } from "@/lib/public-pages";

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
    rules: [
      // Meta's checker (1.9.8): its own group, with nothing to weigh up, because it
      // answered 403 "robots.txt block" on the data deletion page even though the
      // group below allows it. Safe: every private page just sends it to sign-in.
      { userAgent: ["facebookexternalhit", "Facebot"], allow: "/" },
      {
        userAgent: "*",
        // "/$" = only the home page itself (the longest matching rule wins).
        // The link-preview picture too, for Slack, X and the rest.
        allow: ["/$", ...PUBLIC_PAGES, OG_IMAGE.url],
        disallow: "/",
      },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
