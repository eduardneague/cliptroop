// Push notifications: the encryption matches the standard's own worked example
// (RFC 8291 Appendix A) byte for byte, a fresh message decrypts on the "phone"
// side, the VAPID signature verifies, and only real push services are allowed.
import { createDecipheriv, createECDH, createHmac, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { b64u, encryptPayload, isPushServiceUrl, vapidAuthorization } from "../lib/push/web-push";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// RFC 8291, Appendix A.
const plaintext = Buffer.from("When I grow up, I want to be a watermelon");
const asPrivate = b64u.decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw");
const uaPublic = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const salt = b64u.decode("DGv6ra1nlYgDCS1FRnbzlw");
const authSecret = "BTBZMqHH6r4Tts7J_aSIgg";
const expected =
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";
const got = b64u.encode(encryptPayload(plaintext, uaPublic, authSecret, { ephemeralPrivate: asPrivate, salt }));
ok(got === expected, `RFC 8291 example\n  got      ${got}\n  expected ${expected}`);

// Round trip with a fresh "phone".
const phone = createECDH("prime256v1");
phone.generateKeys();
const phoneAuth = randomBytes(16);
const msg = Buffer.from(JSON.stringify({ title: "Hi", body: "Ünïcödé ✓", url: "/dashboard" }));
const enc = encryptPayload(msg, b64u.encode(phone.getPublicKey()), b64u.encode(phoneAuth));
{
  const hm = (k: Buffer, d: Buffer) => createHmac("sha256", k).update(d).digest();
  const s = enc.subarray(0, 16);
  const idlen = enc[20];
  const asPub = enc.subarray(21, 21 + idlen);
  const ct = enc.subarray(21 + idlen);
  const secret = phone.computeSecret(asPub);
  const ikm = hm(hm(phoneAuth, secret), Buffer.concat([Buffer.from("WebPush: info\0"), phone.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = hm(s, ikm);
  const cek = hm(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hm(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const out = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  ok(out[out.length - 1] === 2 && out.subarray(0, out.length - 1).equals(msg), "a fresh message decrypts on the phone side");
}

// VAPID: the signature verifies with the public key, for that push service.
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwkPriv = privateKey.export({ format: "jwk" }) as { d: string };
const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(-65);
const keys = { publicKey: b64u.encode(rawPub), privateKey: jwkPriv.d, subject: "mailto:test@example.com" };
const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, Date.parse("2026-10-04T10:00:00Z"));
const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
ok(!!m, "header shape");
if (m) {
  const claims = JSON.parse(Buffer.from(m[2], "base64url").toString());
  ok(claims.aud === "https://fcm.googleapis.com" && claims.sub === "mailto:test@example.com", "audience is the push service, subject set");
  ok(claims.exp - Date.parse("2026-10-04T10:00:00Z") / 1000 <= 24 * 3600, "expires within 24 h");
  ok(verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(m[3], "base64url")), "signature verifies");
  ok(m[4] === keys.publicKey, "k= is the public key");
}

// Only real push services.
ok(isPushServiceUrl("https://fcm.googleapis.com/fcm/send/x"), "Chrome / Android");
ok(isPushServiceUrl("https://web.push.apple.com/QK-x"), "Safari / iPhone");
ok(isPushServiceUrl("https://updates.push.services.mozilla.com/wpush/v2/x"), "Firefox");
ok(isPushServiceUrl("https://wns2-par02p.notify.windows.com/w/?token=x"), "Edge");
ok(!isPushServiceUrl("http://fcm.googleapis.com/x"), "no plain http");
ok(!isPushServiceUrl("https://evil.example.com/fcm.googleapis.com"), "no other hosts");
ok(!isPushServiceUrl("https://fcm.googleapis.com.evil.com/x"), "no look-alike hosts");
ok(!isPushServiceUrl("https://169.254.169.254/latest"), "no internal addresses");
ok(!isPushServiceUrl("https://fcm.googleapis.com:8443/x"), "no odd ports");
ok(!isPushServiceUrl("not a url"), "garbage");

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
