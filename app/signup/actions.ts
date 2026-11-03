"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/email";
import { clientAddress } from "@/lib/auth/sign-in-rules";
import { passwordSaveError } from "@/lib/auth/password-rules";
import { cleanEmail, cleanName, signUpErrorText, signUpProblem, type SignUpField } from "@/lib/auth/sign-up-rules";
import { verifyTurnstile } from "@/lib/auth/turnstile-verify";

/** `sent`: the confirmation email went to this address. `field`: where the problem is (focused by the page). */
export type SignUpState = { error?: string; field?: SignUpField | null; sent?: string } | undefined;

/**
 * Creating an account (1.45.0, the owner: "we will now work on a registration form as well because i will open the
 * app publicly"). Checked again here (the page checks as you type), the security check with Cloudflare when it's set
 * up, then Supabase makes the account and sends "Confirm your email" (lib/auth-emails.ts → /welcome → the dashboard,
 * where they name their team; a team then chooses its plan). Signed in at once only when Supabase doesn't ask for the
 * email to be confirmed.
 *
 * Whether an email already has an account is never said: Supabase answers the same for both, and so does this.
 */
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
    agree: formData.get("agree") === "on",
  };
  // Nothing real is this long.
  if (raw.password.length > 512 || raw.confirm.length > 512 || raw.name.length > 400 || raw.email.length > 400) return { error: "That's too long.", field: null };
  const name = cleanName(raw.name);
  const email = cleanEmail(raw.email);
  // A box people can't see: only a script fills it in. It's told what everyone is told.
  if (String(formData.get("website") ?? "").trim()) return { sent: email };
  const problem = signUpProblem(raw);
  if (problem) return problem;

  const h = await headers();
  const address = clientAddress((n) => h.get(n));
  const check = await verifyTurnstile(String(formData.get("captcha") ?? ""), address, "signup");
  if (check === "failed") return { error: "The security check didn't go through. Wait for it below, then try again.", field: "check" };
  if (check === "unreachable") return { error: "The security check couldn't be reached. Try again in a minute.", field: "check" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: raw.password,
    options: { data: { full_name: name }, emailRedirectTo: `${appUrl()}/welcome` },
  });
  if (error) {
    const pw = /weak_password|pwned|leaked|longer than 72/i.test(`${error.code ?? ""} ${error.message ?? ""}`) ? passwordSaveError(error) : null;
    if (pw) return { error: pw, field: "password" };
    return signUpErrorText(error) ?? { error: "Couldn't create your account. Try again in a minute.", field: null };
  }
  // No email check asked for (Supabase → Authentication → Email → Confirm email off): signed in already.
  if (data.session) redirect("/dashboard");
  return { sent: email };
}
