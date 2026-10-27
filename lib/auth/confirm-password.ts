import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { noteSignIn, signInKeysFor, signInWait } from "./sign-in-limits";
import { signInOutcome, waitText } from "./sign-in-rules";

/*
 * "Type your password to do this" (1.40.0, for deleting several long videos at once: the owner, "deleting in bulk should
 * require you to input the password … to ensure you dont delete things by accident, or if someone takes charge of your
 * account"). The same check as deleting your account (settings/account-actions.ts): the sign-in limits first (0105: a
 * session someone got hold of can't guess it here), then the password on a side client that keeps no session, a wrong
 * one counted like a wrong sign-in, a right one clearing the count, and the side client's own sign-in ended.
 */
export async function confirmPassword(user: { id: string; email?: string | null }, password: unknown): Promise<{ ok: true } | { error: string }> {
  const typed = typeof password === "string" ? password : "";
  if (!user.email) return { error: "Your session expired. Sign in again." };
  if (!typed) return { error: "Type your password." };
  // Nothing real is this long (Supabase keeps 72 bytes): not sent on to be checked.
  if (typed.length > 512) return { error: "That password isn't right." };

  const keys = await signInKeysFor(user.email);
  const wait = await signInWait(keys);
  if (wait > 0) return { error: waitText(wait) };

  const check = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await check.auth.signInWithPassword({ email: user.email, password: typed });
  if (error || data.user?.id !== user.id) {
    const outcome = signInOutcome(error);
    if (outcome === "wrong") await noteSignIn(keys, false);
    return {
      error:
        outcome === "busy" ? "Too many tries. Wait a few minutes and try again." : outcome === "down" ? "Couldn't check your password right now. Try again in a minute." : "That password isn't right.",
    };
  }
  await noteSignIn(keys, true);
  // The check's own session isn't kept (it would stay on the account's list of sign-ins).
  await check.auth.signOut({ scope: "local" }).catch(() => null);
  return { ok: true };
}
