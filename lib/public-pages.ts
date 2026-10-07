import { APP_DOMAIN } from "./brand";

/** Pages anyone (and the platforms' robots) can read without signing in. */
export const PUBLIC_PAGES = ["/privacy", "/terms", "/data-deletion"] as const;

/** The site's public address (for robots.txt and the sitemap). */
export function siteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || (APP_DOMAIN ? `https://app.${APP_DOMAIN}` : "");
  return raw.trim().replace(/\/+$/, "");
}
