/*
 * The addresses anyone may open without signing in (1.31.1; the list used
 * to live inside lib/supabase/middleware.ts). Everything else sends you to
 * sign in first.
 *
 * Exact addresses, or a folder and what's inside it: never just a name that
 * starts the same way (/login is public, /login-history wouldn't be; /api/auth/…
 * is, /api/authors wouldn't be), so a new page can't become public by its
 * name. Pure.
 */

const EXACT = new Set([
  // The home page (signs you in or sends you on).
  "/",
  "/login",
  // Where the sign-in emails lead (invites, password resets): signs you in.
  "/welcome",
  // The pages the platforms' reviews check.
  "/privacy",
  "/terms",
  "/data-deletion",
  // Lists the public pages for the platforms' robots (robots.txt itself is a static .txt).
  "/sitemap.xml",
  // Status page and health check: public (details only for developers).
  "/status",
  "/api/health",
  // The installed app's "you're offline" page (kept by the service worker).
  "/offline.html",
]);

const FOLDERS = [
  // Sign-in's own return address.
  "/api/auth/",
  // Scheduled jobs (Supabase's timer): each one checks CRON_SECRET itself.
  "/api/cron/",
];

export function isPublicPath(pathname: string): boolean {
  return EXACT.has(pathname) || FOLDERS.some((f) => pathname.startsWith(f));
}
