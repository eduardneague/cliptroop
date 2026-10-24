/*
 * An email's link never swaps the account someone is signed in with
 * (1.31.11). A link (an invite, a reset, a sign-in link) signs in the
 * account it was sent to; when this browser is already signed in as
 * someone else, it asks first ("Continue as …" or "Stay as …") instead of
 * quietly switching: being moved into another account without noticing is
 * how people end up doing things in someone else's account (or someone
 * else's in theirs). Pure: what to do, and the hand-over from the old-style
 * links (AuthHashHandler) to the welcome page, which asks.
 */

/** sessionStorage: an old-style link's sign-in, waiting for the welcome page's question. */
export const SWAP_KEY = "cliptroop:link-swap";
/** A hand-over older than this is thrown away (the question is asked right away; this only covers a slow page). */
export const SWAP_MAX_AGE_MS = 10 * 60_000;

export type LinkSession = { access_token: string; refresh_token: string };
export type Handoff = LinkSession & { type: string | null; email: string | null; at: number };

/** What a link's sign-in does here: nobody signed in → sign in; the same account → carry on; someone else → ask. */
export function swapDecision(current: { id: string } | null | undefined, linkUserId: string | null | undefined): "sign-in" | "same" | "ask" {
  if (!current) return "sign-in";
  if (!linkUserId || linkUserId === current.id) return "same";
  return "ask";
}

/** Who a sign-in token is for (its payload read, not checked: only to compare with who's signed in; Supabase checks it when it's used). */
export function tokenClaims(token: string | null | undefined): { sub: string | null; email: string | null } | null {
  const part = (token ?? "").split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(decodeBase64Url(part)) as { sub?: unknown; email?: unknown };
    return { sub: typeof json.sub === "string" ? json.sub : null, email: typeof json.email === "string" ? json.email : null };
  } catch {
    return null;
  }
}

function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** A stored hand-over, if it's whole and fresh (anything else: null). */
export function readHandoff(raw: string | null | undefined, now: number): Handoff | null {
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as Partial<Handoff>;
    if (typeof h.access_token !== "string" || typeof h.refresh_token !== "string" || !h.access_token || !h.refresh_token) return null;
    if (typeof h.at !== "number" || !(now - h.at >= 0 && now - h.at <= SWAP_MAX_AGE_MS)) return null;
    return {
      access_token: h.access_token,
      refresh_token: h.refresh_token,
      type: typeof h.type === "string" && /^[a-z_]{3,20}$/.test(h.type) ? h.type : null,
      email: typeof h.email === "string" ? h.email : null,
      at: h.at,
    };
  } catch {
    return null;
  }
}

/** Where an old-style link's sign-in goes once it's this browser's: a reset to choosing a password, the rest to setting up. */
export const nextForLinkType = (type: string | null | undefined) => (type === "recovery" ? "/reset-password" : "/set-password");
