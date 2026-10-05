import { APP_NAME, BRAND_COLOR, MASCOT_NAME } from "./brand";

/*
 * The emails Supabase sends for sign-in (invites, password resets…), in
 * the app's look. Supabase sends them (through Resend), so they live in
 * Supabase: the owner copies them from App setup (/setup) into
 * Supabase → Authentication → Emails, once per project (staging and
 * production). Renaming the app = copy them again.
 *
 * Every link goes to /welcome with a one-time code (token hash), and
 * nothing happens until the person presses the button there. So email
 * scanners that open links can't use up the invite, and it works on any
 * device (no matter where the reset was asked for).
 *
 * {{ .SiteURL }}, {{ .TokenHash }}, {{ .Email }} are filled in by Supabase.
 */

export type AuthEmail = {
  id: "invite" | "recovery" | "magic_link" | "confirmation" | "email_change";
  /** The template's name in Supabase → Authentication → Emails. */
  supabaseName: string;
  /** Used for accounts made from the Supabase dashboard (the important ones). */
  important: boolean;
  subject: string;
  html: string;
};

const INK = "#2B2118";
const SOFT = "#5C5147";
const FAINT = "#8A7F73";
const PAPER = "#F6F1EA";
const LINE = "#EDE4D8";
const TINT = "#FDEBDD";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const link = (type: string) => `{{ .SiteURL }}/welcome?token_hash={{ .TokenHash }}&type=${type}`;

function layout(o: {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  steps?: string[];
  cta: string;
  href: string;
  footer: string;
}) {
  const steps = o.steps?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">${o.steps
        .map(
          (s, i) =>
            `<tr><td valign="top" style="padding:5px 12px 5px 0;"><div style="width:24px;height:24px;border-radius:12px;background:${TINT};color:${BRAND_COLOR};font:700 12px/24px ${SANS};text-align:center;">${i + 1}</div></td><td style="padding:7px 0 5px;font:15px/1.45 ${SANS};color:${INK};">${esc(s)}</td></tr>`
        )
        .join("")}</table>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(o.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 6px 18px;">
<img src="{{ .SiteURL }}/app-icons/icon-192.png" width="36" height="36" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:9px;">
<span style="display:inline-block;vertical-align:middle;padding-left:9px;font:700 18px ${SERIF};color:${INK};">${esc(APP_NAME)}</span>
</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid ${LINE};border-radius:20px;padding:32px 28px;">
<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${TINT};color:${BRAND_COLOR};font:700 12px ${SANS};letter-spacing:.02em;">${esc(o.eyebrow)}</span>
<h1 style="margin:16px 0 10px;font:700 26px/1.25 ${SERIF};color:${INK};">${esc(o.title)}</h1>
<p style="margin:0 0 20px;font:15px/1.6 ${SANS};color:${SOFT};">${esc(o.intro)}</p>
${steps}<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:${BRAND_COLOR};">
<a href="${o.href}" style="display:inline-block;padding:14px 26px;font:700 15px ${SANS};color:#FFFFFF;text-decoration:none;border-radius:12px;">${esc(o.cta)}</a>
</td></tr></table>
<p style="margin:24px 0 0;font:12.5px/1.55 ${SANS};color:${FAINT};">Button not working? Copy this link into your browser:<br><a href="${o.href}" style="color:${BRAND_COLOR};word-break:break-all;">${o.href}</a></p>
</td></tr>
<tr><td style="padding:18px 10px 0;font:12px/1.55 ${SANS};color:${FAINT};text-align:center;">${esc(o.footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function make(e: Omit<AuthEmail, "html"> & Omit<Parameters<typeof layout>[0], "subject">): AuthEmail {
  const { id, supabaseName, important, subject, ...rest } = e;
  return { id, supabaseName, important, subject, html: layout({ subject, ...rest }) };
}

export function authEmails(): AuthEmail[] {
  return [
    make({
      id: "invite",
      supabaseName: "Invite user",
      important: true,
      subject: `You're invited to ${APP_NAME}`,
      preheader: `Your team plans its videos in ${APP_NAME}. Setting up takes about a minute.`,
      eyebrow: "You're invited",
      title: `Welcome to ${APP_NAME}`,
      intro: `Your team plans its videos here: scripts, shorts, the calendar, meetings and analytics, all in one place. ${MASCOT_NAME} will walk you through it. It takes about a minute:`,
      steps: ["Choose a password", "Add your name and a photo", "Get notifications on your phone (optional)"],
      cta: "Accept the invite",
      href: link("invite"),
      footer: `This invite is for {{ .Email }} and works once. Not expecting it? Ignore this email: nothing happens unless you press the button.`,
    }),
    make({
      id: "recovery",
      supabaseName: "Reset Password",
      important: true,
      subject: `Choose a new ${APP_NAME} password`,
      preheader: "Someone (hopefully you) asked to reset your password.",
      eyebrow: "Password reset",
      title: "Choose a new password",
      intro: `Press the button and pick a new password for {{ .Email }}. Your old one keeps working until you do.`,
      cta: "Choose a new password",
      href: link("recovery"),
      footer: "Didn't ask for this? Ignore this email: your password stays the same. The link works once.",
    }),
    make({
      id: "magic_link",
      supabaseName: "Magic Link",
      important: false,
      subject: `Your ${APP_NAME} sign-in link`,
      preheader: `One tap and you're in.`,
      eyebrow: "Sign in",
      title: `Sign in to ${APP_NAME}`,
      intro: "Press the button to sign in. No password needed this time.",
      cta: "Sign in",
      href: link("email"),
      footer: "Didn't ask for this? Ignore this email. The link works once.",
    }),
    make({
      id: "confirmation",
      supabaseName: "Confirm signup",
      important: false,
      subject: `Confirm your email for ${APP_NAME}`,
      preheader: "One last step.",
      eyebrow: "Almost there",
      title: "Confirm your email",
      intro: `Press the button to confirm {{ .Email }} and finish setting up your ${APP_NAME} account.`,
      cta: "Confirm my email",
      href: link("email"),
      footer: "Didn't sign up? Ignore this email. The link works once.",
    }),
    make({
      id: "email_change",
      supabaseName: "Change Email Address",
      important: false,
      subject: `Confirm your new email for ${APP_NAME}`,
      preheader: "Press the button to switch your sign-in email.",
      eyebrow: "New email",
      title: "Confirm your new email",
      intro: `Press the button to sign in to ${APP_NAME} with {{ .NewEmail }} from now on, instead of {{ .Email }}.`,
      cta: "Confirm the new email",
      href: link("email_change"),
      footer: "Didn't ask for this? Ignore this email: nothing changes. The link works once.",
    }),
  ];
}
