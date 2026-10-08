import type { Metadata } from "next";
import { APP_DESCRIPTION, APP_DOMAIN, APP_NAME, APP_TAGLINE } from "./brand";

/** Pages anyone (and the platforms' robots) can read without signing in. */
export const PUBLIC_PAGES = ["/privacy", "/terms", "/data-deletion"] as const;

/**
 * Pages that always wear the brand colours, never a person's colour theme
 * (Settings → Preferences): the home page, sign-in and the password /
 * invite pages, the status page and the legal pages. Light and dark still
 * follow the person's choice. A string, so the root layout's first-paint
 * script can use it too.
 */
export const BRAND_PAGES_RE = "^/(login|reset-password|set-password|welcome|status|privacy|terms|data-deletion)?(/|$)";
export const isBrandPage = (path: string) => new RegExp(BRAND_PAGES_RE).test(path);

/** The site's public address (for robots.txt and the sitemap). */
export function siteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || (APP_DOMAIN ? `https://app.${APP_DOMAIN}` : "");
  return raw.trim().replace(/\/+$/, "");
}

/**
 * The link-preview picture (Facebook, Slack, messages): a plain PNG in
 * public/, so every robot can read it (a generated image was refused by
 * Facebook as "corrupted"). Redraw it from the brand art, same size.
 */
export const OG_IMAGE = { url: "/og-image.png", width: 1200, height: 630, type: "image/png", alt: `${APP_NAME}: ${APP_TAGLINE}` };

/** Facebook's fb:app_id (the Meta app's ID is public; set when FACEBOOK_APP_ID is). */
export function facebookMeta(): Metadata["facebook"] {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  return appId ? { appId } : undefined;
}

/**
 * Everything a public page needs for link previews: og:url, og:type,
 * og:title / description / image, the Twitter card and fb:app_id.
 * (A page's own openGraph replaces the layout's, so each page passes all of it.)
 */
export function publicMetadata(path: string, title: string | null, description: string = APP_DESCRIPTION): Metadata {
  const full = title ? `${title} · ${APP_NAME}` : `${APP_NAME}: ${APP_TAGLINE}`;
  return {
    title: title ?? { absolute: full },
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, siteName: APP_NAME, title: full, description, locale: "en_US", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: full, description, images: [OG_IMAGE.url] },
    facebook: facebookMeta(),
  };
}
