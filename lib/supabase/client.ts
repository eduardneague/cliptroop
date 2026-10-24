import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { sessionCookieOptions } from "./cookie-options";

/**
 * Supabase client for use in Client Components ("use client").
 * Safe to call anywhere in the browser — uses the public anon key,
 * which is meant to be public. Real access control happens at the
 * database level via Row Level Security, not by hiding this key.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Secure cookies on https (1.31.11), like the server's.
    { cookieOptions: sessionCookieOptions(typeof window === "undefined" ? null : window.location.protocol) }
  );
}
