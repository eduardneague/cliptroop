"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { noteSignIn, signInKeysFor, signInWait } from "@/lib/auth/sign-in-limits";
import { signInOutcome, waitText } from "@/lib/auth/sign-in-rules";

/** `wait`: too many wrong tries; the page offers a password reset. */
export type LoginState = { error?: string; wait?: true } | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Back to the page that sent you here (only this site's own pages).
  const nextRaw = String(formData.get("next") ?? "");
  const next = /^\/(?!\/|\\)[^\s]*$/.test(nextRaw) && !nextRaw.startsWith("/login") && !nextRaw.startsWith("/api/") ? nextRaw.slice(0, 500) : "/dashboard";

  if (!email || !password) {
    return { error: "Enter both an email and a password." };
  }
  // Nothing real is this long (Supabase takes 72 characters of a password at most).
  if (email.length > 320 || password.length > 512) {
    return { error: "Incorrect email or password." };
  }

  // Too many wrong tries (1.31.6, 0105): the password isn't even checked until the wait is over.
  const keys = await signInKeysFor(email);
  const wait = await signInWait(keys);
  if (wait > 0) return { error: waitText(wait), wait: true };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  switch (signInOutcome(error)) {
    case "wrong":
      await noteSignIn(keys, false);
      // Deliberately vague: never confirm or deny that an email has an account.
      return { error: "Incorrect email or password." };
    case "busy":
      return { error: "Too many sign-ins right now. Try again in a minute." };
    case "unconfirmed":
      return { error: "Confirm your email first: open the email we sent you (your invite, or the one confirming your address)." };
    // Supabase's own Captcha protection is meant to stay off (sign-ups are checked by ClipTroop, app/signup/actions.ts).
    case "captcha":
    case "down":
      return { error: "Couldn't sign you in right now. Try again in a minute." };
  }

  await noteSignIn(keys, true);
  redirect(next);
}
