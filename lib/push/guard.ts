import "server-only";
import type { NextRequest } from "next/server";

/** State-changing push requests must come from this site's own pages (or its service worker). */
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

/** The cookie that remembers this device's push address, so logging out can switch it off. */
export const PUSH_COOKIE = "vp_push_ep";
