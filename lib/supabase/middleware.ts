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
 * Refreshes the user's auth session on every request and enforces
 * that dashboard routes require a logged-in session. Public routes
 * (login) are left alone. This runs in middleware.ts.
 */
export async function updateSession(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/api/auth") ||
    // Scheduled jobs (Vercel Cron). Each route checks CRON_SECRET itself.
    request.nextUrl.pathname.startsWith("/api/cron/");

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
