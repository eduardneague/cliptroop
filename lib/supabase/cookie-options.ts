/*
 * The sign-in cookies (1.31.11): Supabase's own settings (path /,
 * SameSite=Lax, 400 days) plus Secure wherever the app is on https, so a
 * browser never sends the session over plain http (an address typed with
 * http:// before the redirect, a network that strips https). Not HttpOnly:
 * @supabase/ssr's browser client reads the session from them (uploads,
 * realtime), and the server checks the session on every request anyway.
 *
 * Pure: the browser, the server and the middleware each pass what they
 * know about the address ("https:", or the "https" Vercel forwards).
 */
export function sessionCookieOptions(protocol: string | null | undefined): { secure: boolean } {
  return { secure: /^https:?$/i.test((protocol ?? "").split(",")[0].trim()) };
}
