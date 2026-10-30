/*
 * Two-step sign-in (1.46.0): the owner, "2 factor authentication … through a google authenticator or email and you
 * have to set this up in your account after first creating it". Everyone has one: an authenticator app (Supabase's
 * own MFA, a session that typed its code is "aal2") or codes by email (ClipTroop's: app/two-step/actions.ts). The
 * database refuses a signed-in request that still owes its code (migration 0125); this is the app's side of it:
 * who goes where, and the cookie that says this sign-in typed its email code. Runs in the middleware (no Node APIs:
 * Web Crypto) and on the server.
 */

export const TWO_STEP_COOKIE = "vp_2s";
/** Codes by email: how long one lasts, how many tries it gets, how soon another can be sent. */
export const CODE_MINUTES = 10;
export const CODE_TRIES = 5;
export const RESEND_SECONDS = 60;

export type TwoStepMethod = "app" | "email";

/** What a signed-in person has, and what this sign-in has done. */
export type TwoStepState = {
  /** A verified authenticator app (Supabase MFA). */
  app: boolean;
  /** Email codes (app_metadata.two_step). */
  email: boolean;
  /** This session typed its app code. */
  aal2: boolean;
  /** This session typed its email code (the cookie, checked against the session). */
  emailDone: boolean;
};

/** ok: carry on. verify: this sign-in owes its code. setup: no second step yet (everyone needs one). */
export function twoStepNeed(s: TwoStepState): "ok" | "verify" | "setup" {
  // The email cookie is only ever made for a session that typed its code (and the token's own copy of the person's
  // choice can be older than the choice: right after setting email up it still says none).
  if (s.aal2 || s.emailDone) return "ok";
  if (s.app || s.email) return "verify";
  return "setup";
}

/** The pages the check never stands in front of: its own, and the ones that sign you in or set your password. */
const EXEMPT = ["/two-step", "/welcome", "/set-password", "/reset-password", "/login", "/signup", "/api/", "/auth/"];
export function twoStepApplies(path: string): boolean {
  return !EXEMPT.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}

/** Where to go back to after the code (only this site's own pages). */
export function safeNext(raw: string | null | undefined): string {
  const v = raw ?? "";
  const ok = /^\/(?!\/|\\)[^\s]*$/.test(v) && (!v.startsWith("/two-step") || v.startsWith("/two-step/setup")) && !v.startsWith("/login");
  return ok ? v.slice(0, 500) : "/dashboard";
}

/** a***@example.com */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`;
}

/** Six digits, as typed (spaces and dashes dropped); null when it isn't six digits. */
export function cleanCode(raw: string): string | null {
  const v = String(raw ?? "").replace(/[\s-]/g, "");
  return /^\d{6}$/.test(v) ? v : null;
}

/** The session's id from its access token (already verified by Supabase where it's used). */
export function sessionIdOf(accessToken: string | null | undefined): string | null {
  try {
    const part = (accessToken ?? "").split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    const id = typeof json.session_id === "string" ? json.session_id : null;
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

function secret(): string {
  return (process.env.TWO_STEP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

async function hmac(text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`two-step:${secret()}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

/** The cookie's value for a session that typed its email code. */
export async function emailDoneCookie(sessionId: string): Promise<string> {
  return `${sessionId}.${await hmac(`email:${sessionId}`)}`;
}

/** Whether the cookie belongs to this very session (and was made by this server). */
export async function emailDoneFor(cookie: string | null | undefined, sessionId: string | null | undefined): Promise<boolean> {
  if (!cookie || !sessionId || !secret()) return false;
  const [sid, mac] = cookie.split(".");
  if (sid !== sessionId || !mac || mac.length !== 64) return false;
  const want = await hmac(`email:${sessionId}`);
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= want.charCodeAt(i) ^ mac.charCodeAt(i);
  return diff === 0;
}

/** A code's hash as stored (two_step_codes.code_hash): the person and the code together, keyed with the server's secret. */
export async function codeHash(userId: string, code: string): Promise<string> {
  return hmac(`code:${userId}:${code}`);
}
