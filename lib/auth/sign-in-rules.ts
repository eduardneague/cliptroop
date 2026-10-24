import { createHash } from "node:crypto";

/*
 * Sign-in limits (1.31.6): after too many wrong passwords the app waits
 * before it checks another one. The numbers (the database has the same,
 * 0105), the keys a try is counted under, and what people read. Pure.
 *
 * The app signs people in from its server, so Supabase sees the server's
 * address and never the person's: its own limits per address can't tell
 * one person from another. These can.
 */
export const SIGN_IN_LIMITS = {
  /** How far back wrong tries count. */
  windowMinutes: 15,
  /** One account, from one address. */
  sameAccountAndAddress: 8,
  /** One account, from anywhere (someone trying from many addresses). */
  sameAccount: 30,
  /** One address, any accounts (someone trying a list of them). */
  sameAddress: 40,
} as const;

export type SignInKeys = { account: string; address: string };

const hash = (s: string) => createHash("sha256").update(`cliptroop:sign-in:${s}`).digest("base64url");

/** What a try is counted under: hashes of the email (any case, any spaces around it) and of the address. Never the email or the address itself. */
export function signInKeys(email: string, address: string): SignInKeys {
  return { account: hash(`account:${email.trim().toLowerCase()}`), address: hash(`address:${address.trim().toLowerCase()}`) };
}

/**
 * Where a request came from. On Vercel both headers are set by Vercel
 * itself (one a browser sends is replaced), so they can be trusted there.
 */
export function clientAddress(get: (name: string) => string | null | undefined): string {
  const first = get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || get("x-real-ip")?.trim() || "unknown";
}

/** What a try that has to wait says. */
export function waitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "Too many tries. Try again in a minute." : `Too many tries. Try again in ${minutes} minutes.`;
}

/** What Supabase's answer to a password means: right, wrong, too many at once, not set up yet, or not reachable. */
export type SignInOutcome = "ok" | "wrong" | "busy" | "unconfirmed" | "down";
export function signInOutcome(error: { status?: number; code?: string; message?: string } | null | undefined): SignInOutcome {
  if (!error) return "ok";
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (error.status === 429 || /over_request_rate_limit|rate limit|too many/i.test(text)) return "busy";
  if (/email_not_confirmed|not confirmed/i.test(text)) return "unconfirmed";
  if (/invalid_credentials|invalid login credentials|invalid_grant/i.test(text) || error.status === 400) return "wrong";
  return "down";
}
