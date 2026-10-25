import { APP_NAME, CONTACT_EMAIL } from "./brand";

/**
 * security.txt (RFC 9116, 1.33.0): where to report a security problem, for the tools and people that look there
 * first (app/.well-known/security.txt). Expires is half a year ahead of `now` (the RFC wants it under a year away).
 * Pure but for the contact address.
 */
export function securityTxt(base: string, now = Date.now(), contact = CONTACT_EMAIL) {
  const expires = new Date(now + 183 * 86_400_000);
  expires.setUTCHours(0, 0, 0, 0);
  return [
    `# ${APP_NAME}: how to report a security problem (${base}/security#report)`,
    `Contact: ${contact ? `mailto:${contact}` : `${base}/contact`}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Policy: ${base}/security#report`,
    `Canonical: ${base}/.well-known/security.txt`,
    "",
  ].join("\n");
}
