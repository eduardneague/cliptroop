/**
 * The Content Security Policy (1.31.16): what a page of the app may load
 * and run. Sent by the middleware on every page, with a fresh nonce each
 * time (lib/supabase/middleware.ts): Next.js puts that nonce on its own
 * scripts and the root layout on its first-paint script, so a script that
 * someone managed to slip into a page wouldn't run. Pure: no request here.
 *
 *   scripts       the page's own (nonce), and what they load ('strict-dynamic':
 *                 the Word / PDF export libraries). https: and 'unsafe-inline'
 *                 only matter to browsers too old for nonces (newer ones ignore
 *                 both when a nonce is there).
 *   styles        the app's own and inline (React's style="…", Tailwind)
 *   pictures      anywhere on the web (thumbnails, link previews, GIFs, avatars)
 *   video, sound  this app's storage and anywhere on the web, plus the device's own
 *   connections   this app, Supabase (and its live updates), and pictures it
 *                 downloads from the web (a script's pictures, the PDF export)
 *   frames        any web page (players, a link opened in the side window)
 *   never         plugins (object), another <base>, forms posting elsewhere,
 *                 other sites framing the app (as X-Frame-Options says too)
 *
 * In development, Next.js needs eval and its own websocket, and the page is
 * http: no "upgrade-insecure-requests". On Vercel's previews, its toolbar.
 */
export type CspOptions = {
  nonce: string;
  /** NODE_ENV === "development". */
  dev?: boolean;
  /** VERCEL_ENV === "preview" (staging and other previews). */
  preview?: boolean;
  /** This copy's Supabase host (from NEXT_PUBLIC_SUPABASE_URL), for its live updates. */
  supabaseHost?: string | null;
};

const HOST = /^[a-z0-9.-]+(:\d+)?$/i;

export function buildCsp({ nonce, dev = false, preview = false, supabaseHost }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("A nonce is at least 16 random base64 characters.");
  const supabase = supabaseHost && HOST.test(supabaseHost) ? supabaseHost : null;
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https:", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", "'unsafe-inline'", ...(preview ? ["https://vercel.live"] : [])]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["media-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:", ...(preview ? ["https://vercel.live", "https://assets.vercel.com"] : [])]],
    ["connect-src", ["'self'", "https:", "data:", "blob:", supabase ? `wss://${supabase}` : "wss:", ...(dev ? ["ws:"] : []), ...(preview ? ["wss://ws-us3.pusher.com"] : [])]],
    ["frame-src", ["'self'", "https:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** 16 random bytes as base64: a new one for every page. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Which header carries it: CSP_MODE=report-only only reports what it would
 * block (in the browser's console), CSP_MODE=off sends none. Both are for an
 * emergency: set it in Vercel and redeploy, then tell the developer.
 */
export function cspHeaderName(mode: string | undefined): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" | null {
  const m = (mode ?? "").trim().toLowerCase();
  if (m === "off") return null;
  return m === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/** Pages get the policy; the API's answers and the offline page (its own) don't. */
export function wantsCsp(pathname: string): boolean {
  return !pathname.startsWith("/api/") && pathname !== "/offline.html";
}
