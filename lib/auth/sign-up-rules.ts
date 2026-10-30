/*
 * Creating an account on the website (1.45.0): what the form must hold, checked the same way in the browser and on
 * the server. Pure.
 */
import { checkPassword } from "./password-rules";

export const NAME_MAX = 80;
export const EMAIL_MAX = 320;

export type SignUpField = "name" | "email" | "password" | "confirm" | "agree" | "check";
export type SignUpInput = { name: string; email: string; password: string; confirm: string; agree: boolean };

/** Spaces tidied; nothing invisible or a line break. */
export const cleanName = (v: string) =>
  v
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);

export const cleanEmail = (v: string) => v.trim().toLowerCase().slice(0, EMAIL_MAX + 1);

export const emailLooksRight = (v: string) => v.length <= EMAIL_MAX && /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[a-z]{2,}$/i.test(v);

/** The first problem, in the order the form reads; null when it can be sent. */
export function signUpProblem(input: SignUpInput): { field: SignUpField; error: string } | null {
  const name = cleanName(input.name);
  const email = cleanEmail(input.email);
  if (name.length < 1) return { field: "name", error: "Enter your name: it's how your team sees you." };
  if (!emailLooksRight(email)) return { field: "email", error: "Enter your email the way you'd write it on a letter: name@example.com." };
  const pw = checkPassword(input.password, { email, names: [name] });
  if (!pw.ok) return { field: "password", error: pw.error ?? "Choose another password." };
  if (input.password !== input.confirm) return { field: "confirm", error: "The two passwords don't match yet." };
  if (!input.agree) return { field: "agree", error: "Tick the box to say you're 18 or older and agree to the terms." };
  return null;
}

/** What Supabase's answer to signUp means, in words for the form. */
export function signUpErrorText(error: { status?: number; code?: string; message?: string } | null | undefined): { field: SignUpField | null; error: string } | null {
  if (!error) return null;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (error.status === 429 || /over_(request|email_send)_rate_limit|rate limit|too many/i.test(text)) return { field: null, error: "Too many new accounts from here just now. Try again in a few minutes." };
  if (/signup_disabled|signups? not allowed|sign ?ups? (are )?disabled/i.test(text)) return { field: null, error: "New accounts are closed right now. Write to us and we'll set you up." };
  if (/captcha/i.test(text)) return { field: "check", error: "The security check didn't go through. Wait for it below, then try again." };
  if (/email_address_invalid|invalid.*email|email.*invalid|email_address_not_authorized/i.test(text)) return { field: "email", error: "That email can't be used. Check it, or use another one." };
  if (/weak_password|pwned|leaked|password/i.test(text)) return { field: "password", error: "Supabase refused that password: choose a longer one, not one used elsewhere." };
  return { field: null, error: "Couldn't create your account. Try again in a minute." };
}
