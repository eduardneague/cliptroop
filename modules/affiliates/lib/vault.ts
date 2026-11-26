import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { LoginFields } from "./rules";

/*
 * Affiliate logins, sealed (1.56.0). The owner: "the credentials should only be seen by the master or by who i choose
 * … come up with great security things". A login never reaches the database as typed: the server seals it here with
 * AES-256-GCM, a key of its own made from the server's secret (SOCIAL_TOKEN_KEY, through HKDF, so it's never the key
 * that seals the social tokens), and bound to its team and affiliate (moved to another row it won't open). GCM also
 * finds tampering: a changed value fails to open instead of giving garbage. The length is padded to 64 bytes, so how
 * long a password is doesn't show either. Only the server opens one, for someone the database says may see it
 * (affiliate_login_open, migration 0135), after they've typed their password lately (the unlock, below).
 *
 * Kept as "av1.<iv>.<tag>.<data>" (base64url): the database refuses anything else (affiliate_logins_sealed_ok).
 */

const VERSION = "av1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PAD = 64;

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");

function master(): Buffer {
  const hex = process.env.SOCIAL_TOKEN_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("SOCIAL_TOKEN_KEY must be 64 hex characters (32 bytes).");
  return Buffer.from(hex, "hex");
}

/** A key for one purpose, from the server's secret (HKDF-SHA256). */
function subkey(purpose: "affiliate logins" | "affiliate unlock"): Buffer {
  return Buffer.from(hkdfSync("sha256", master(), Buffer.from("cliptroop affiliates"), Buffer.from(`${purpose} ${VERSION}`), 32));
}

/** Whether logins can be kept on this server (its secret is set). */
export const vaultReady = () => /^[0-9a-f]{64}$/i.test(process.env.SOCIAL_TOKEN_KEY ?? "");

const bound = (teamId: string, affiliateId: string) => Buffer.from(`affiliate-login:${teamId}:${affiliateId}`, "utf8");

export function sealLogin(teamId: string, affiliateId: string, login: LoginFields): string {
  const json = JSON.stringify({ u: login.username, p: login.password, n: login.notes });
  // Spaces to the next 64 bytes (JSON reads them as nothing).
  const plain = Buffer.from(json, "utf8");
  const padded = Buffer.concat([plain, Buffer.alloc((PAD - (plain.length % PAD)) % PAD, 0x20)]);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", subkey("affiliate logins"), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(bound(teamId, affiliateId));
  const data = Buffer.concat([cipher.update(padded), cipher.final()]);
  return [VERSION, b64u(iv), b64u(cipher.getAuthTag()), b64u(data)].join(".");
}

/** The login inside, or an error when it isn't one of ours, was changed, or belongs to another affiliate. */
export function openLogin(teamId: string, affiliateId: string, sealed: string): LoginFields {
  const [version, iv, tag, data, extra] = String(sealed).split(".");
  if (version !== VERSION || !iv || !tag || !data || extra !== undefined) throw new Error("Not a sealed login.");
  const ivBytes = unb64u(iv);
  const tagBytes = unb64u(tag);
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) throw new Error("Not a sealed login.");
  const decipher = createDecipheriv("aes-256-gcm", subkey("affiliate logins"), ivBytes, { authTagLength: TAG_BYTES });
  decipher.setAAD(bound(teamId, affiliateId));
  decipher.setAuthTag(tagBytes);
  const plain = Buffer.concat([decipher.update(unb64u(data)), decipher.final()]).toString("utf8");
  const v = JSON.parse(plain) as { u?: unknown; p?: unknown; n?: unknown };
  return { username: typeof v.u === "string" ? v.u : "", password: typeof v.p === "string" ? v.p : "", notes: typeof v.n === "string" ? v.n : "" };
}

// ---- The unlock: a password typed in the last 15 minutes, on this sign-in --------------------------------------------

/**
 * After typing their password (lib/auth/confirm-password.ts), someone let in sees logins for 15 minutes, on this
 * sign-in only: the cookie says until when, for whom and for which session, signed with a key of its own. Someone
 * who got hold of an open laptop, or only of the cookie, still needs the password. httpOnly, Strict, only sent to
 * /sponsorships (the page's address since 1.57.0; /affiliates before).
 */
export const UNLOCK_COOKIE = "vp_aff_unlock";
export const UNLOCK_PATH = "/sponsorships";

const mac = (userId: string, sessionId: string, until: number) => createHmac("sha256", subkey("affiliate unlock")).update(`unlock:${userId}:${sessionId}:${until}`).digest("hex");

export function unlockToken(userId: string, sessionId: string, until: number): string {
  return `${until}.${mac(userId, sessionId, until)}`;
}

/** Until when it's unlocked (ms), or null: no cookie, someone else's, another sign-in's, past its time, or forged. */
export function unlockedUntil(cookie: string | null | undefined, userId: string, sessionId: string | null, minutes: number, now = Date.now()): number | null {
  if (!cookie || !sessionId || !vaultReady()) return null;
  const [rawUntil, sig] = cookie.split(".");
  const until = Number(rawUntil);
  if (!Number.isSafeInteger(until) || !sig || !/^[0-9a-f]{64}$/.test(sig)) return null;
  // Not over, and never further away than one unlock (a cookie made to last longer is refused).
  if (until <= now || until > now + minutes * 60_000 + 5_000) return null;
  const want = Buffer.from(mac(userId, sessionId, until), "hex");
  const got = Buffer.from(sig, "hex");
  return want.length === got.length && timingSafeEqual(want, got) ? until : null;
}
