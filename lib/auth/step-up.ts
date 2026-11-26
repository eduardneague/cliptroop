import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { noteSignIn, signInKeysFor, signInWait } from "./sign-in-limits";
import { signInOutcome, waitText } from "./sign-in-rules";
import { CODE_TRIES, cleanCode, codeHash, twoStepOf } from "./two-step";

/*
 * The password and a two-step code, typed then and there (1.59.0, for exporting the sponsorships table; the owner: "i
 * want mandatory 2 factor authentification to be set up and you should need to use it, both password and 2fa for it,
 * so yeah, you shouldnt be able to export the table without some work"). Only for someone with two-step sign-in on.
 * The password is checked as confirmPassword checks it (the sign-in limits first, then a side client that keeps no
 * session), and the code on that same side sign-in: an authenticator app's through Supabase (the side session's own
 * challenge), or an email code sent for this one thing (two_step_codes, purpose "export", migration 0138: a code sent
 * for signing in never counts, nor this one for signing in). A wrong code counts like a wrong password, and only both
 * right clear the count, so knowing the password doesn't buy endless guesses at the code. Nothing here marks the
 * person's own sign-in; the side one is ended.
 */

export type StepUpPurpose = "export";
/** Which field was wrong (setup: two-step sign-in is off). */
export type StepUpField = "password" | "code" | "setup";

export const TURN_ON_FIRST = "Turn on two-step sign-in first (Settings → Account): exporting asks for your password and a code from it.";

type Person = { id: string; email?: string | null; factors?: readonly { id: string; factor_type: string; status: string }[] | null; app_metadata?: unknown };
type CodeCheck = { ok: true } | { error: string; wrong: boolean };

export async function confirmPasswordAndCode(user: Person, password: unknown, rawCode: unknown, purpose: StepUpPurpose): Promise<{ ok: true } | { error: string; field?: StepUpField }> {
  const way = twoStepOf(user);
  if (!way) return { error: TURN_ON_FIRST, field: "setup" };
  if (!user.email) return { error: "Your session expired. Sign in again." };
  const typed = typeof password === "string" ? password : "";
  if (!typed) return { error: "Type your password.", field: "password" };
  const code = typeof rawCode === "string" ? cleanCode(rawCode) : null;
  if (!code) return { error: way.method === "app" ? "Type the six digits your authenticator app shows." : "Type the six digits from the email.", field: "code" };
  // Nothing real is this long (Supabase keeps 72 bytes): not sent on to be checked.
  if (typed.length > 512) return { error: "That password isn't right.", field: "password" };

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
    if (data?.session) await check.auth.signOut({ scope: "local" }).catch(() => null);
    return {
      error:
        outcome === "busy" ? "Too many tries. Wait a few minutes and try again." : outcome === "down" ? "Couldn't check your password right now. Try again in a minute." : "That password isn't right.",
      field: outcome === "busy" || outcome === "down" ? undefined : "password",
    };
  }
  try {
    const typedCode = way.method === "app" ? await appCode(check, way.factorId ?? "", code) : await emailCode(user.id, code, purpose);
    if ("error" in typedCode) {
      if (typedCode.wrong) await noteSignIn(keys, false);
      return { error: typedCode.error, field: "code" };
    }
    await noteSignIn(keys, true);
    return { ok: true };
  } finally {
    // The side sign-in isn't kept (it would stay on the account's list of sign-ins).
    await check.auth.signOut({ scope: "local" }).catch(() => null);
  }
}

/** The app's code, on the side sign-in (Supabase checks it and keeps its own limits). */
async function appCode(check: SupabaseClient, factorId: string, code: string): Promise<CodeCheck> {
  const { error } = await check.auth.mfa.challengeAndVerify({ factorId, code });
  if (!error) return { ok: true };
  const why = (error as { code?: string }).code;
  if (error.status === 429 || why === "over_request_rate_limit") return { error: "Too many tries. Wait a few minutes and try again.", wrong: false };
  if (why === "mfa_verification_failed" || why === "mfa_challenge_expired" || /invalid|expired|code/i.test(error.message)) return { error: "That's not the code. Type the one your app shows now.", wrong: true };
  return { error: "Couldn't check the code. Try again in a minute.", wrong: false };
}

/** An email code sent for this (ten minutes, five tries), used up by the right one. */
async function emailCode(userId: string, code: string, purpose: StepUpPurpose): Promise<CodeCheck> {
  const admin = createAdminClient();
  const { data: row, error } = await admin.from("two_step_codes").select("code_hash, purpose, expires_at, attempts").eq("user_id", userId).maybeSingle();
  if (error) return { error: "Couldn't check the code. Try again in a minute.", wrong: false };
  if (!row || row.purpose !== purpose) return { error: "Ask for a code first: Email me a code.", wrong: false };
  if (Date.parse(row.expires_at as string) < Date.now()) return { error: "That code has expired. Ask for a new one.", wrong: false };
  const tries = Number(row.attempts ?? 0);
  if (tries >= CODE_TRIES) return { error: "Too many tries. Ask for a new code.", wrong: false };
  const hash = await codeHash(userId, code);
  if (row.code_hash !== hash) {
    await admin.from("two_step_codes").update({ attempts: tries + 1 }).eq("user_id", userId);
    const left = CODE_TRIES - tries - 1;
    return { error: left > 0 ? `That's not the code. ${left} ${left === 1 ? "try" : "tries"} left.` : "That's not the code. Ask for a new one.", wrong: true };
  }
  // Once: whoever takes it away first has it (two at once can't both use one code).
  const { data: taken } = await admin.from("two_step_codes").delete().eq("user_id", userId).eq("code_hash", hash).eq("purpose", purpose).select("user_id");
  if (!taken?.length) return { error: "Ask for a new code.", wrong: false };
  return { ok: true };
}
