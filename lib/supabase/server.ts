import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "@/types/database";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Supabase client for use in Server Components, Server Actions, and
 * Route Handlers. Reads/writes the user's session via cookies, so
 * requests are authenticated as that specific user — RLS policies
 * then decide what they're actually allowed to see or change.
 *
 * One client per request (React cache()): the per-request caches keyed on
 * the client (getTeamsAndCurrent, getMembership) only work when every
 * caller gets the same one. Outside a render, cache() is a plain call.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — middleware handles the
            // actual session refresh, so this can be safely ignored.
          }
        },
      },
    }
  );
});
