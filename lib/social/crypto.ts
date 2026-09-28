import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Token encryption (AES-256-GCM). The key lives only in the server's
 * environment (SOCIAL_TOKEN_KEY: 32 random bytes as 64 hex characters).
 * GCM also detects tampering: a changed value fails to decrypt instead
 * of returning garbage.
 *
 * Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>". The "v1" lets us
 * rotate to a new key later without breaking old values.
 */
function key(): Buffer {
  const hex = process.env.SOCIAL_TOKEN_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("SOCIAL_TOKEN_KEY must be 64 hex characters (32 bytes).");
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unknown token format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function socialKeyConfigured() {
  return /^[0-9a-f]{64}$/i.test(process.env.SOCIAL_TOKEN_KEY ?? "");
}
