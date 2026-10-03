import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";

/*
 * Web Push, written out (no package needed): the two standards every browser
 * uses — the message is encrypted for that one device (RFC 8291, aes128gcm)
 * and signed as coming from us (VAPID, RFC 8292). Tested against the RFC's
 * own example in tests/web-push.test.ts.
 *
 * Keys (Vercel environment variables, same in every environment is fine):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  65-byte public key, base64url (the browser needs it)
 *   VAPID_PRIVATE_KEY             32-byte private key, base64url (server only, secret)
 *   VAPID_SUBJECT                 optional "mailto:you@…" (else the contact email / app address)
 * Settings → Notifications can make a pair for you.
 */

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export const b64u = {
  encode: (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url"),
  decode: (s: string) => Buffer.from(s.replace(/=+$/, ""), "base64url"),
};

const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

/** RFC 8291: encrypt one message for one subscription. `ephemeral` and `salt` only for tests. */
export function encryptPayload(
  payload: Buffer,
  uaPublicB64: string,
  authSecretB64: string,
  opts: { ephemeralPrivate?: Buffer; salt?: Buffer; recordSize?: number } = {}
): Buffer {
  const uaPublic = b64u.decode(uaPublicB64);
  const authSecret = b64u.decode(authSecretB64);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("bad p256dh key");
  if (authSecret.length < 16) throw new Error("bad auth secret");

  const ecdh = createECDH("prime256v1");
  if (opts.ephemeralPrivate) ecdh.setPrivateKey(opts.ephemeralPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // uncompressed, 65 bytes
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0 || ua_public || as_public, 32)
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);

  const salt = opts.salt ?? randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);

  const rs = opts.recordSize ?? 4096;
  if (payload.length + 17 > rs) throw new Error("payload too large");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // One record: the message, then the 0x02 "last record" delimiter (no padding).
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** RFC 8292: the "Authorization: vapid t=…, k=…" header for one push service. */
export function vapidAuthorization(endpoint: string, keys: { publicKey: string; privateKey: string; subject: string }, now = Date.now()) {
  const pub = b64u.decode(keys.publicKey);
  const d = b64u.decode(keys.privateKey);
  if (pub.length !== 65 || d.length !== 32) throw new Error("bad VAPID keys");
  const aud = new URL(endpoint).origin;
  const header = b64u.encode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.encode(Buffer.from(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })));
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: b64u.encode(d), x: b64u.encode(pub.subarray(1, 33)), y: b64u.encode(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u.encode(signature)}, k=${keys.publicKey}`;
}

/** The push services browsers use. Anything else is refused (we never post to arbitrary addresses). */
export function isPushServiceUrl(endpoint: string) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
    return /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export type SendResult = { ok: true } | { ok: false; status: number; gone: boolean; error: string };

/** Sends one message. `gone` = the device unsubscribed (delete it). Never throws. */
export async function sendWebPush(
  sub: PushSubscriptionKeys,
  message: unknown,
  keys: { publicKey: string; privateKey: string; subject: string },
  opts: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string; timeoutMs?: number } = {}
): Promise<SendResult> {
  try {
    if (!isPushServiceUrl(sub.endpoint)) return { ok: false, status: 0, gone: true, error: "not a push service address" };
    const body = encryptPayload(Buffer.from(JSON.stringify(message)), sub.p256dh, sub.auth);
    const headers: Record<string, string> = {
      Authorization: vapidAuthorization(sub.endpoint, keys),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opts.ttlSeconds ?? 24 * 3600),
      Urgency: opts.urgency ?? "normal",
    };
    // Topic: a newer message with the same topic replaces one still waiting (≤ 32 URL-safe chars).
    if (opts.topic && /^[A-Za-z0-9_-]{1,32}$/.test(opts.topic)) headers.Topic = opts.topic;
    const res = await fetch(sub.endpoint, { method: "POST", headers, body: new Uint8Array(body), signal: AbortSignal.timeout(opts.timeoutMs ?? 8000), cache: "no-store" });
    if (res.ok) return { ok: true };
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return { ok: false, status: res.status, gone: res.status === 404 || res.status === 410, error: text || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: e instanceof Error ? e.message : String(e) };
  }
}
