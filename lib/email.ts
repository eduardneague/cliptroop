import "server-only";

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

/** The app's public address, for links in emails. */
export function appUrl() {
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
<tr><td style="font-size:13px;font-weight:700;color:#e8630d;letter-spacing:.04em">VPLANNER</td></tr>
<tr><td style="padding-top:14px;font-size:18px;font-weight:700;line-height:1.35">${esc(input.subject)}</td></tr>
<tr><td style="padding-top:10px;font-size:14.5px;line-height:1.55;color:#44403c">${esc(input.message)}</td></tr>
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
