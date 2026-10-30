import "server-only";
import { APP_NAME, BRAND_COLOR } from "./brand";

/**
 * Emails through Resend (resend.com). Free plan: 3,000 a month, 100 a day.
 * Environment (server only):
 *   RESEND_API_KEY  secret
 *   EMAIL_FROM      e.g. "VPlanner <alerts@yourdomain.com>"
 * Without them, emails are skipped (in-app notifications still go out).
 */
export function emailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

/** The app's public address, for links in emails. Previews (staging) link to themselves (or STAGING_URL). */
export function appUrl() {
  if (process.env.VERCEL_ENV === "preview") {
    // Staging on its own domain (STAGING_URL, e.g. https://staging.example.com).
    const staging = process.env.VERCEL_GIT_COMMIT_REF === "staging" ? process.env.STAGING_URL?.trim() : "";
    if (staging && /^https:\/\/[^/]+/.test(staging)) return staging.replace(/\/+$/, "");
    const own = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (own) return `https://${own}`.replace(/\/+$/, "");
  }
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return raw.replace(/\/+$/, "");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A short alert email with one button. Never throws. */
export async function sendAlertEmail(input: { to: string[]; subject: string; message: string; linkText: string; href: string; footer?: string }) {
  if (!emailConfigured() || input.to.length === 0) return { sent: false as const };
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;font-weight:700;color:${BRAND_COLOR};letter-spacing:.04em">${esc(APP_NAME.toUpperCase())}</td></tr>
<tr><td style="padding-top:14px;font-size:18px;font-weight:700;line-height:1.35">${esc(input.subject)}</td></tr>
<tr><td style="padding-top:10px;font-size:14.5px;line-height:1.55;color:#44403c;white-space:pre-line">${esc(input.message)}</td></tr>
<tr><td style="padding-top:22px"><a href="${esc(input.href)}" style="display:inline-block;background:#e8630d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px">${esc(input.linkText)}</a></td></tr>
<tr><td style="padding-top:22px;font-size:12px;color:#a8a29e">${esc(input.footer ?? "You get this because you're a master or scheduler of this team.")}</td></tr>
</table></td></tr></table></body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: input.to.slice(0, 50),
        subject: input.subject,
        html,
        text: `${input.subject}\n\n${input.message}\n\n${input.linkText}: ${input.href}`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return { sent: res.ok as boolean };
  } catch {
    return { sent: false as const };
  }
}

/**
 * A sign-in code (1.46.0, two-step sign-in by email): the six digits big, what it's for, how long it lasts. Not sent
 * without Resend (the page then says email isn't set up).
 */
export async function sendCodeEmail(input: { to: string; code: string; purpose: "sign_in" | "setup"; minutes: number }) {
  if (!emailConfigured()) return { sent: false as const };
  const title = input.purpose === "setup" ? `Your code to turn on two-step sign-in` : `Your ${APP_NAME} sign-in code`;
  const spaced = `${input.code.slice(0, 3)} ${input.code.slice(3)}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;font-weight:700;color:${BRAND_COLOR};letter-spacing:.04em">${esc(APP_NAME.toUpperCase())}</td></tr>
<tr><td style="padding-top:14px;font-size:18px;font-weight:700;line-height:1.35">${esc(title)}</td></tr>
<tr><td style="padding-top:18px"><div style="display:inline-block;font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:.12em;background:#f6f4f0;border-radius:12px;padding:14px 20px">${esc(spaced)}</div></td></tr>
<tr><td style="padding-top:18px;font-size:14.5px;line-height:1.55;color:#44403c">Type it where ${esc(APP_NAME)} asks for it. It works once, for ${input.minutes} minutes.</td></tr>
<tr><td style="padding-top:22px;font-size:12px;color:#a8a29e">Didn't try to sign in? Someone has your password: change it in Settings → Account. Nobody gets in without this code.</td></tr>
</table></td></tr></table></body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [input.to],
        subject: `${spaced} is your ${APP_NAME} code`,
        html,
        text: `${title}\n\n${spaced}\n\nIt works once, for ${input.minutes} minutes. Didn't try to sign in? Someone has your password: change it in Settings → Account.`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return { sent: res.ok as boolean };
  } catch {
    return { sent: false as const };
  }
}
