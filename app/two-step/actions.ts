"use server";

import { randomInt } from "node:crypto";
import { cookies, headers } from "next/headers";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendCodeEmail } from "@/lib/email";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { CODE_MINUTES, CODE_TRIES, RESEND_SECONDS, TWO_STEP_COOKIE, cleanCode, codeHash, emailDoneCookie, maskEmail, sessionIdOf } from "@/lib/auth/two-step";

/*
 * Two-step sign-in by email (1.46.0): a six-digit code to the account's own address, kept as a keyed hash for 10
 * minutes and 5 tries (two_step_codes, migration 0125: only the server's key touches it). The right code marks this
 * very sign-in as done, for the database (two_step_sessions) and for the app (the vp_2s cookie, lib/auth/two-step.ts).
 * Choosing email (setup) turns an authenticator app off, and choosing an app (appFromNowOn) turns email off: one
 * way at a time. Authenticator apps themselves are Supabase's (the browser talks to it directly).
 */

type Purpose = "sign_in" | "setup";
const isPurpose = (p: unknown): p is Purpose => p === "sign_in" || p === "setup";

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { supabase, user, sessionId: sessionIdOf(session?.access_token) };
}

const usesEmail = (meta: unknown) => (meta as { two_step?: unknown } | null)?.two_step === "email";

/** Sends a code (or says how long until another can go). */
export async function sendTwoStepCode(purpose: Purpose): Promise<{ error?: string; to?: string; wait?: number }> {
  if (!isPurpose(purpose)) return { error: "Not found." };
  const who = await me();
  if (!who) return { error: "Your session expired. Sign in again." };
  const email = who.user.email ?? "";
  if (!email) return { error: "Your account has no email address: use an authenticator app." };
  if (purpose === "sign_in" && !usesEmail(who.user.app_metadata)) return { error: "This account signs in with an authenticator app." };
  if (!emailConfigured()) return { error: `Email isn't set up on this copy of ${APP_NAME} yet: use an authenticator app.` };

  const admin = createAdminClient();
  const { data: last, error: readError } = await admin.from("two_step_codes").select("sent_at").eq("user_id", who.user.id).maybeSingle();
  if (readError) return { error: /two_step|schema cache|does not exist/i.test(readError.message) ? `${APP_NAME} is being updated. Use an authenticator app, or try again in a few minutes.` : "Couldn't send a code. Try again in a minute." };
  const since = last?.sent_at ? (Date.now() - Date.parse(last.sent_at as string)) / 1000 : Infinity;
  if (since < RESEND_SECONDS) return { to: maskEmail(email), wait: Math.ceil(RESEND_SECONDS - since) };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await admin.from("two_step_codes").upsert({
    user_id: who.user.id,
    code_hash: await codeHash(who.user.id, code),
    purpose,
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
    attempts: 0,
    sent_at: new Date().toISOString(),
  });
  if (error) return { error: "Couldn't send a code. Try again in a minute." };
  const sent = await sendCodeEmail({ to: email, code, purpose, minutes: CODE_MINUTES });
  if (!sent.sent) return { error: "Couldn't send the email. Try again in a minute." };
  return { to: maskEmail(email), wait: RESEND_SECONDS };
}

/** Checks a code; the right one marks this sign-in as done (and, setting up, makes email the way from now on). */
export async function verifyTwoStepCode(raw: string, purpose: Purpose): Promise<{ error?: string; ok?: true }> {
  if (!isPurpose(purpose)) return { error: "Not found." };
  const code = cleanCode(raw);
  if (!code) return { error: "Type the six digits from the email." };
  const who = await me();
  if (!who) return { error: "Your session expired. Sign in again." };
  if (!who.sessionId) return { error: "Your session expired. Sign in again." };
  if (purpose === "sign_in" && !usesEmail(who.user.app_metadata)) return { error: "This account signs in with an authenticator app." };

  const admin = createAdminClient();
  const { data: row } = await admin.from("two_step_codes").select("code_hash, purpose, expires_at, attempts").eq("user_id", who.user.id).maybeSingle();
  if (!row || row.purpose !== purpose) return { error: "Ask for a new code." };
  if (Date.parse(row.expires_at as string) < Date.now()) return { error: "That code has expired. Ask for a new one." };
  const tries = Number(row.attempts ?? 0);
  if (tries >= CODE_TRIES) return { error: "Too many tries. Ask for a new code." };
  if (row.code_hash !== (await codeHash(who.user.id, code))) {
    await admin.from("two_step_codes").update({ attempts: tries + 1 }).eq("user_id", who.user.id);
    const left = CODE_TRIES - tries - 1;
    return { error: left > 0 ? `That's not the code. ${left} ${left === 1 ? "try" : "tries"} left.` : "That's not the code. Ask for a new one." };
  }
  await admin.from("two_step_codes").delete().eq("user_id", who.user.id);

  if (purpose === "setup") {
    const { error: e1 } = await admin.from("two_step_email").upsert({ user_id: who.user.id });
    if (e1) return { error: "Couldn't turn it on. Try again in a minute." };
    await admin.auth.admin.updateUserById(who.user.id, { app_metadata: { ...(who.user.app_metadata ?? {}), two_step: "email" } });
    // One way at a time: an authenticator app goes.
    const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: who.user.id });
    for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: who.user.id, id: f.id });
  }

  const { error: e2 } = await admin.from("two_step_sessions").upsert({ session_id: who.sessionId, user_id: who.user.id });
  if (e2) return { error: "Couldn't finish signing in. Try again in a minute." };
  const proto = (await headers()).get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  (await cookies()).set(TWO_STEP_COOKIE, await emailDoneCookie(who.sessionId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    ...sessionCookieOptions(proto),
  });
  return { ok: true };
}

/** After an authenticator app is verified (this session is aal2): email codes stop, if they were the way before. */
export async function appFromNowOn(): Promise<{ error?: string; ok?: true }> {
  const who = await me();
  if (!who) return { error: "Your session expired. Sign in again." };
  const { data: aal } = await who.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return { error: "Type the code from your app first." };
  if (usesEmail(who.user.app_metadata)) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(who.user.id, { app_metadata: { ...(who.user.app_metadata ?? {}), two_step: null } });
    await admin.from("two_step_email").delete().eq("user_id", who.user.id);
  }
  return { ok: true };
}
