import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all routes except static files and images, so the auth
     * session gets refreshed on every navigation.
     */
    // vendor/ = public library files (e.g. the Word export), cacheable.
"/((?!_next/static|_next/image|favicon.ico|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt)$).*)",  ],
};
