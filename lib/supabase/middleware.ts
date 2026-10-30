import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/public-paths";
import { sessionCookieOptions } from "./cookie-options";
import { crossSiteWrite } from "@/lib/request-guard";
import { buildCsp, cspHeaderName, newNonce, wantsCsp } from "@/lib/csp";

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
/** The page's nonce for the root layout (1.31.16). Set only here, like the two above. */
export const NONCE_HEADER = "x-nonce";

const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
};

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
  // Another site's page making a signed-in browser change something here (1.31.13, lib/request-guard.ts).
  if (
    crossSiteWrite({
      method: request.method,
      path: request.nextUrl.pathname,
      host: request.headers.get("host") ?? request.nextUrl.host,
      origin: request.headers.get("origin"),
      fetchSite: request.headers.get("sec-fetch-site"),
    })
  ) {
    return NextResponse.json({ error: "That request didn't come from this app." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Secure on https (1.31.11).
      cookieOptions: sessionCookieOptions(request.nextUrl.protocol),
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

  const isPublicRoute = isPublicPath(request.nextUrl.pathname);

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
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
  // The page's Content Security Policy with a fresh nonce (1.31.16, lib/csp.ts): Next.js reads it from
  // the request to put the nonce on its scripts, the root layout reads x-nonce. Never a browser's own copy.
  requestHeaders.delete(NONCE_HEADER);
  requestHeaders.delete("content-security-policy");
  requestHeaders.delete("content-security-policy-report-only");
  const cspName = wantsCsp(request.nextUrl.pathname) ? cspHeaderName(process.env.CSP_MODE) : null;
  let csp: string | null = null;
  if (cspName) {
    const nonce = newNonce();
    csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development", preview: process.env.VERCEL_ENV === "preview", supabaseHost: hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL) });
    requestHeaders.set(NONCE_HEADER, nonce);
    requestHeaders.set(cspName, csp);
  }
  const forwarded = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((c) => forwarded.cookies.set(c));
  response = forwarded;
  if (cspName && csp) response.headers.set(cspName, csp);

  // Documented Supabase gotcha on platforms like Vercel: if a response
  // carrying a refreshed session cookie gets cached by the edge
  // network, later requests can see stale auth state. This stops any
  // layer from caching an auth-bearing response at all.
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
