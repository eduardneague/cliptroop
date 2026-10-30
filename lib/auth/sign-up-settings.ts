/**
 * Who can make an account (1.31.14), as Supabase's sign-in service says
 * itself: GET <project>/auth/v1/settings (public, with the app's public key)
 * answers disable_signup, mailer_autoconfirm and external.anonymous_users.
 * Since 1.45.0 anyone can make an account (the website's /signup page), so
 * "Allow new users to sign up" is meant to be on, with Confirm email on and
 * anonymous sign-ins off. App setup, card 10.
 */

export type SignUpState = {
  /** Anyone can make an account (true), or only the ones invited (false). */
  open: boolean;
  /** A new account works without opening its email first. */
  noEmailCheck: boolean;
  /** Supabase's anonymous sign-ins (an account with no email at all). */
  anonymous: boolean;
};

/** Supabase's answer → what it means; null when it isn't one. */
export function signUpState(json: unknown): SignUpState | null {
  if (!json || typeof json !== "object") return null;
  const j = json as { disable_signup?: unknown; mailer_autoconfirm?: unknown; external?: { anonymous_users?: unknown } | null };
  if (typeof j.disable_signup !== "boolean") return null;
  return {
    open: !j.disable_signup,
    noEmailCheck: j.mailer_autoconfirm === true,
    anonymous: j.external?.anonymous_users === true,
  };
}

/** Ask this copy's Supabase (3 seconds at most). null when it can't be asked. */
export async function readSignUpState(): Promise<SignUpState | null> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!/^https:\/\//.test(url) || !key) return null;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(3000) });
    return r.ok ? signUpState(await r.json()) : null;
  } catch {
    return null;
  }
}
