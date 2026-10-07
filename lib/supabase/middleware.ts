import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Internal request headers carrying the user that middleware has ALREADY
 * verified with Supabase Auth. Server Components read these via
 * getCachedUser() instead of making a second getUser() network call.
 *
 * Security: any incoming copy of these headers is ALWAYS deleted first,
 * so a browser can never inject them — only this middleware sets them.
 */
export const VERIFIED_USER_ID_HEADER = "x-vp-verified-user-id";
export const VERIFIED_USER_EMAIL_HEADER = "x-vp-verified-user-email";

/**
 * On its own domain: pages opened on the old *.vercel.app address move to
 * the real one (same path), so everyone signs in, connects accounts and
 * installs the phone app on ONE address.
 *   production: NEXT_PUBLIC_APP_URL      (e.g. https://app.example.com)
 *   staging:    STAGING_URL              (e.g. https://staging.example.com),
 *               only the "staging" branch, never other previews
 * Only when that's a real domain (not *.vercel.app), only page loads
 * (GET/HEAD), never /api (platform callbacks, timers keep working on both).
 */
export function canonicalRedirect(request: NextRequest): NextResponse | null {
  const env = process.env.VERCEL_ENV;
  const raw = (
    env === "production"
      ? process.env.NEXT_PUBLIC_APP_URL
      : env === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "staging"
        ? process.env.STAGING_URL
        : ""
  )?.trim();
  if (!raw) return null;
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  const host = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase();
  if (target.protocol !== "https:" || target.host.endsWith(".vercel.app") || !host.endsWith(".vercel.app") || host === target.host) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (request.nextUrl.pathname.startsWith("/api/")) return null;
  return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, target.origin), 308);
}

/**
 * Refreshes the user's auth session on every request and enforces
 * that dashboard routes require a logged-in session. Public routes
 * (login) are left alone. This runs in middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  const moved = canonicalRedirect(request);
  if (moved) return moved;
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verifies the session (and refreshes it when it's about to expire).
  // getClaims() checks the token's signature locally with the project's
  // public key when the project uses asymmetric JWT signing keys (Supabase →
  // Project Settings → JWT Keys): no round trip to Supabase Auth on every
  // request. With the older shared secret it asks Supabase Auth, exactly
  // like getUser() did. Either way the identity is verified.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const user = claims?.sub ? { id: claims.sub as string, email: (claims.email as string | undefined) ?? null } : null;

  const isPublicRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/api/auth") ||
    // Where the sign-in emails lead (invites, password resets): signs you in.
    request.nextUrl.pathname === "/welcome" ||
    // Scheduled jobs (Vercel Cron). Each route checks CRON_SECRET itself.
    request.nextUrl.pathname.startsWith("/api/cron/") ||
    // Public pages the platform reviews require (the home page signs you in or sends you on).
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname === "/privacy" ||
    request.nextUrl.pathname === "/terms" ||
    request.nextUrl.pathname === "/data-deletion" ||
    // Lists the public pages for the platforms' robots (robots.txt itself is a static .txt).
    request.nextUrl.pathname === "/sitemap.xml" ||
    // Status page + health check: public (details only for the alert people).
    request.nextUrl.pathname === "/status" ||
    request.nextUrl.pathname === "/api/health" ||
    // The installed app's "you're offline" page (cached by the service worker).
    request.nextUrl.pathname === "/offline.html";

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  // Forward the request with sanitized identity headers: any
  // client-supplied copies are ALWAYS removed, and they're only set
  // from the user Supabase Auth just verified. (Copying request.headers
  // here also carries any refreshed session cookies, which the Supabase
  // client wrote into the request above.)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(VERIFIED_USER_ID_HEADER);
  requestHeaders.delete(VERIFIED_USER_EMAIL_HEADER);
  if (user) {
    requestHeaders.set(VERIFIED_USER_ID_HEADER, user.id);
    requestHeaders.set(VERIFIED_USER_EMAIL_HEADER, encodeURIComponent(user.email ?? ""));
  }
  const forwarded = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((c) => forwarded.cookies.set(c));
  response = forwarded;

  // Documented Supabase gotcha on platforms like Vercel: if a response
  // carrying a refreshed session cookie gets cached by the edge
  // network, later requests can see stale auth state. This stops any
  // layer from caching an auth-bearing response at all.
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
