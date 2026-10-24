/*
 * Requests that change something through the app's own addresses (/api/*,
 * 1.31.13) come from the app's own pages. A browser says where a request
 * comes from (Origin, and Sec-Fetch-Site when there's no Origin); one from
 * another site is turned away in the middleware before it reaches the
 * route, so no other site can make a signed-in browser post, save or delete
 * here. Server actions get the same check from Next.js itself, and the
 * sign-in cookies are SameSite=Lax as well.
 *
 * Not asked: reading (GET, HEAD, OPTIONS: nothing changes, and no route
 * lets another site read its answer: no CORS headers anywhere), the
 * scheduled jobs (/api/cron/*: Supabase's timer, with its own secret), and
 * sign-in's return address (/api/auth/*). A request with neither header
 * (a script, curl) has no browser cookies to borrow and gets the route's
 * own checks. Pure.
 */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

export function crossSiteWrite(r: { method: string; path: string; host: string | null; origin: string | null; fetchSite: string | null }): boolean {
  if (READS.has(r.method.toUpperCase())) return false;
  if (!r.path.startsWith("/api/") || r.path.startsWith("/api/cron/") || r.path.startsWith("/api/auth/")) return false;
  if (r.origin) {
    if (r.origin === "null") return true;
    try {
      return new URL(r.origin).host.toLowerCase() !== (r.host ?? "").toLowerCase();
    } catch {
      return true;
    }
  }
  return (r.fetchSite ?? "").toLowerCase() === "cross-site";
}
