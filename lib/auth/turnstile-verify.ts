import "server-only";

/**
 * Checking the "not a robot" answer from the sign-up form (1.45.0) with Cloudflare, by the server: TURNSTILE_SECRET_KEY
 * (Cloudflare → Turnstile → the site's secret key) with NEXT_PUBLIC_TURNSTILE_SITE_KEY for the box itself. Without the
 * secret there's nothing to check and sign-ups go through (App setup says so). Supabase's own Captcha protection stays
 * off: it would also ask sign-ins and Settings' password checks for a token they don't send.
 */
export const turnstileSecret = () => (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
export const turnstileOn = () => !!turnstileSecret() && !!(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();

export async function verifyTurnstile(token: string, address: string | null, action = "signup"): Promise<"ok" | "failed" | "unreachable"> {
  const secret = turnstileSecret();
  if (!secret) return "ok";
  if (!token || token.length > 4096) return "failed";
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (address && address !== "unknown") body.set("remoteip", address);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!r.ok) return "unreachable";
    const j = (await r.json()) as { success?: unknown; action?: unknown };
    return j.success === true && (typeof j.action !== "string" || j.action === action) ? "ok" : "failed";
  } catch {
    return "unreachable";
  }
}
