import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/get-user";
import { isDeveloper } from "@/lib/errors";
import { getSocialSetup, type SocialSetup } from "@/lib/social/setup";
import { authEmails } from "@/lib/auth-emails";
import { APP_DOMAIN, APP_NAME, CONTACT_EMAIL } from "@/lib/brand";
import type { SocialPlatform } from "@/lib/social/providers";
import { CopyField, EmailPreview } from "./setup-client";

export const metadata: Metadata = { title: "App setup" };
export const dynamic = "force-dynamic";

/*
 * App setup (owner only): everything to paste in cPanel, Resend, Supabase,
 * Google, Meta, TikTok and Vercel for THIS copy of the app (production or
 * staging). The addresses are the ones it SHOULD use: NEXT_PUBLIC_APP_URL /
 * STAGING_URL when set, else app.<APP_DOMAIN> / staging.<APP_DOMAIN>, so the
 * page is right even before the domain is switched on. Secrets are never
 * shown, only whether they're set.
 */

const ENV_LABEL: Record<SocialSetup["env"], string> = {
  production: "Production",
  preview: "Staging",
  development: "Vercel development",
  local: "Your computer",
};

const PLATFORM: Record<SocialPlatform, { name: string; where: string }> = {
  youtube: {
    name: "YouTube (Google)",
    where: "Google Cloud Console → Google Auth Platform → Clients → your Web client → Authorized redirect URIs → Add URI.",
  },
  instagram: {
    name: "Instagram",
    where: "Meta App Dashboard → Use cases → Instagram → API setup with Instagram Login → Business login settings → OAuth redirect URIs.",
  },
  facebook: {
    name: "Facebook Pages",
    where: "Meta App Dashboard → Facebook Login (for Business) → Settings → Valid OAuth Redirect URIs.",
  },
  tiktok: {
    name: "TikTok",
    where: "TikTok for Developers → Manage apps → your app → Login Kit → Redirect URI (in the Sandbox AND the Production version).",
  },
};

/** What Google calls an "authorized domain": the part you bought (vercel.app addresses stay whole). */
function rootDomain(host: string) {
  const h = host.replace(/:\d+$/, "");
  if (/\.vercel\.app$/.test(h) || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(h)) return h;
  return h.split(".").slice(-2).join(".");
}

function Section({ n, title, intro, children }: { n: number; title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-amber/15 text-amber text-[13px] font-bold flex items-center justify-center flex-shrink-0">{n}</span>
        <div className="min-w-0">
          <h2 className="font-display text-[18px] font-semibold leading-snug">{title}</h2>
          {intro ? <div className="text-[13px] text-ink-soft mt-1 space-y-1">{intro}</div> : null}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** A button straight to the right page of this copy's Supabase project. */
function Open({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 h-9 text-[13px] font-semibold hover:border-line/40 hover:bg-surface-2"
    >
      {label} <span aria-hidden>↗</span>
    </a>
  );
}

function Where({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] text-ink-soft rounded-lg bg-paper/60 border border-line/10 px-3 py-2">{children}</p>;
}

export default async function SetupPage() {
  const user = await getCachedUser();
  if (!(await isDeveloper(user?.id))) notFound();
  const setup = await getSocialSetup();
  const origin = setup.origin.replace(/\/+$/, "");
  const prod = setup.env === "production";
  const staging = setup.env === "preview";
  const stagingBranch = staging && process.env.VERCEL_GIT_COMMIT_REF === "staging";
  const clean = (v: string | undefined) => v?.trim().replace(/\/+$/, "") || null;
  // The address this copy should be used on.
  const target = prod
    ? clean(process.env.NEXT_PUBLIC_APP_URL) || (APP_DOMAIN ? `https://app.${APP_DOMAIN}` : origin)
    : stagingBranch
      ? clean(process.env.STAGING_URL) || (APP_DOMAIN ? `https://staging.${APP_DOMAIN}` : origin)
      : origin;
  const targetHost = target.replace(/^https?:\/\//, "");
  const elsewhere = target !== origin;
  const emails = authEmails();
  const domain = APP_DOMAIN || rootDomain(setup.host);
  // A domain you own (for email addresses): not vercel.app, not your computer.
  const mailDomain = /\.[a-z]{2,}$/i.test(domain) && !domain.endsWith("vercel.app") ? domain : "yourdomain.com";
  const contact = CONTACT_EMAIL || `hello@${mailDomain}`;
  const env = (k: string) => !!process.env[k]?.trim();
  const sub = targetHost.endsWith(`.${domain}`) ? targetHost.slice(0, -(domain.length + 1)) : null;
  // This copy's Supabase project (from its address), for direct links.
  const ref = /^https:\/\/([a-z0-9]{10,40})\.supabase\.co/i.exec(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")?.[1] ?? null;
  const sb = (path: string) => (ref ? `https://supabase.com/dashboard/project/${ref}/${path}` : null);
  const projectWord = prod ? "production" : staging ? "staging" : "matching";

  const vars: { name: string; what: string; value?: string; set: boolean; need: "yes" | "optional" | "prod" | "staging" }[] = [
    { name: "NEXT_PUBLIC_APP_URL", what: prod ? "Production's address (no slash at the end). Set it only once the address opens the app (card 1): from then on the old vercel.app address moves to it." : "Production only. Leave it OUT of Preview: staging uses STAGING_URL.", value: prod ? target : undefined, set: env("NEXT_PUBLIC_APP_URL"), need: "prod" },
    { name: "NEXT_PUBLIC_SITE_URL", what: "Same as NEXT_PUBLIC_APP_URL (Production only).", value: prod ? target : undefined, set: env("NEXT_PUBLIC_SITE_URL"), need: "prod" },
    { name: "STAGING_URL", what: staging ? "Staging's address (Preview only, no slash at the end). Set it only once the address opens staging (card 1)." : "Staging only (Preview), e.g. https://staging." + mailDomain + ".", value: staging ? target : undefined, set: env("STAGING_URL"), need: "staging" },
    { name: "RESEND_API_KEY", what: "Resend → API Keys → the key made for " + mailDomain + " (card 2).", set: env("RESEND_API_KEY"), need: "yes" },
    { name: "EMAIL_FROM", what: "Who the app's own emails (alerts, hand-offs, meetings) come from. The domain must be verified in Resend.", value: `${APP_NAME} <alerts@${mailDomain}>`, set: env("EMAIL_FROM"), need: "yes" },
    { name: "NEXT_PUBLIC_CONTACT_EMAIL", what: "Shown on the privacy, terms and data deletion pages (the platforms check it). Make the inbox in cPanel → Email Accounts.", value: contact, set: env("NEXT_PUBLIC_CONTACT_EMAIL"), need: "yes" },
    { name: "VAPID_SUBJECT", what: "Push notifications: your contact, as mailto:.", value: `mailto:${contact}`, set: env("VAPID_SUBJECT"), need: "optional" },
    { name: "NEXT_PUBLIC_SUPABASE_URL", what: "Supabase → Project Settings → Data API (this project's).", set: env("NEXT_PUBLIC_SUPABASE_URL"), need: "yes" },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", what: "Supabase → Project Settings → API Keys (publishable / anon).", set: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), need: "yes" },
    { name: "SUPABASE_SERVICE_ROLE_KEY", what: "Supabase → Project Settings → API Keys (secret / service role).", set: env("SUPABASE_SERVICE_ROLE_KEY"), need: "yes" },
    { name: "SOCIAL_TOKEN_KEY", what: "Locks the platform sign-ins stored in the database. Never change it once set.", set: setup.tokenKey, need: "yes" },
    { name: "CRON_SECRET", what: "Protects the timers (posting, reminders, analytics).", set: env("CRON_SECRET"), need: "yes" },
    { name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", what: "Push notifications (public key). Same pair everywhere is fine.", set: env("NEXT_PUBLIC_VAPID_PUBLIC_KEY"), need: "yes" },
    { name: "VAPID_PRIVATE_KEY", what: "Push notifications (private key).", set: env("VAPID_PRIVATE_KEY"), need: "yes" },
    { name: "GOOGLE_CLIENT_ID", what: "YouTube: Google Cloud → Clients → your Web client.", set: env("GOOGLE_CLIENT_ID"), need: "yes" },
    { name: "GOOGLE_CLIENT_SECRET", what: "YouTube: same client.", set: env("GOOGLE_CLIENT_SECRET"), need: "yes" },
    { name: "TIKTOK_CLIENT_KEY", what: "TikTok: Client key (Sandbox keys on staging, Production keys on production).", set: env("TIKTOK_CLIENT_KEY"), need: "yes" },
    { name: "TIKTOK_CLIENT_SECRET", what: "TikTok: Client secret (same version as the key).", set: env("TIKTOK_CLIENT_SECRET"), need: "yes" },
    { name: "INSTAGRAM_APP_ID", what: "Instagram app ID (Instagram Login, not the Meta app ID).", set: env("INSTAGRAM_APP_ID"), need: "optional" },
    { name: "INSTAGRAM_APP_SECRET", what: "Instagram app secret.", set: env("INSTAGRAM_APP_SECRET"), need: "optional" },
    { name: "FACEBOOK_APP_ID", what: "Meta app ID (App settings → Basic).", set: env("FACEBOOK_APP_ID"), need: "optional" },
    { name: "FACEBOOK_APP_SECRET", what: "Meta app secret.", set: env("FACEBOOK_APP_SECRET"), need: "optional" },
    { name: "SOCIAL_STATS_PLATFORMS", what: "Which platforms also ask for stats (youtube,instagram,tiktok).", set: env("SOCIAL_STATS_PLATFORMS"), need: "optional" },
    { name: "NEXT_PUBLIC_MAX_VIDEO_MB", what: "Largest upload in MB (50 on the free Supabase plan, 2048 on Pro).", set: env("NEXT_PUBLIC_MAX_VIDEO_MB"), need: "optional" },
    { name: "DEVELOPER_EMAILS", what: "Developer accounts (comma list): open /developer and /setup, and are the only ones who get app-wide alerts. Empty = ALERT_EMAILS (old name), else the owner of the first team.", set: env("DEVELOPER_EMAILS") || env("ALERT_EMAILS"), need: "optional" },
    { name: "GIPHY_API_KEY", what: "GIFs in comments.", set: env("GIPHY_API_KEY"), need: "optional" },
  ];

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-3xl mx-auto space-y-5">
      <header>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <h1 className="font-display text-[28px] font-semibold">App setup</h1>
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${prod ? "bg-green/15 text-green" : "bg-gold/15 text-gold"}`}>{ENV_LABEL[setup.env]}</span>
        </div>
        <p className="text-[14px] text-ink-soft">
          What to paste where, so {APP_NAME}&rsquo;s {prod ? "production" : staging ? "staging" : "copy"} runs on <b className="text-ink break-all">{target}</b>. Open this page on
          staging and on production: each shows its own values. Do one numbered card at a time, top to bottom. Only you can see this page.
        </p>
        {elsewhere && (
          <p className="mt-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-[13px]">
            You&rsquo;re looking at this on <b className="break-all">{origin}</b>. That&rsquo;s fine: everything below is already for <b className="break-all">{target}</b>, the
            address to move to.
          </p>
        )}
        {staging && (
          <p className="mt-3 rounded-xl border border-line/15 bg-surface px-4 py-3 text-[13px] text-ink-soft">
            This is <b className="text-ink">staging</b>: use the <b className="text-ink">staging</b> Supabase project, and the Sandbox / test versions of the platform apps.
          </p>
        )}
      </header>

      <Section
        n={1}
        title={`Connect ${targetHost} to Vercel`}
        intro={<p>Makes the address open the app. Once Vercel says Valid Configuration, the rest of this page can be done.</p>}
      >
        <CopyField label="Vercel → your project → Settings → Domains → Add Domain" value={targetHost} />
        <Where>
          {prod ? (
            <>Connect it to <b>Production</b>.</>
          ) : (
            <>
              After adding it: <b>Edit</b> → Connect to an environment: <b>Preview</b> → Git Branch: <b>staging</b> → Save.
            </>
          )}{" "}
          Vercel then shows a <b>CNAME</b> value (something like abc123.vercel-dns-017.com): copy it.
        </Where>
        <Where>
          cPanel → <b>Zone Editor</b> → {domain} → <b>Manage</b> → <b>+ Add Record</b> → type <b>CNAME</b>, Name <b>{sub ?? "app"}</b>, Record: the value from Vercel → Save.
          It can take from a few minutes to an hour before Vercel shows Valid Configuration.
        </Where>
      </Section>

      <Section
        n={2}
        title={`Email: send from ${mailDomain} (Resend)`}
        intro={<p>Once per account, not per copy: do it on production and skip it on staging (only the Supabase SMTP part is per project).</p>}
      >
        <Where>
          Resend → <b>Domains</b> → <b>Add Domain</b> → {mailDomain} → Region <b>Ireland (eu-west-1)</b>. Resend lists 3 to 4 records (MX and TXT on <b>send</b>, TXT on{" "}
          <b>resend._domainkey</b>). Add each in cPanel → Zone Editor → {domain} → Manage → + Add Record, with the same type, name and value (MX priority 10). Also add TXT{" "}
          <b>_dmarc</b> with the value below. Back in Resend: <b>Verify DNS Records</b>.
        </Where>
        <CopyField label="DMARC record (TXT, name _dmarc)" value="v=DMARC1; p=none;" />
        <Where>
          Resend → <b>API Keys</b> → <b>Create API Key</b> (Sending access, domain {mailDomain}). Copy it once: it goes into Vercel (RESEND_API_KEY, card 7) and into
          Supabase below. Never paste it anywhere else.
        </Where>
        <Where>
          Supabase → the <b>{projectWord}</b> project → Authentication → Emails → <b>SMTP Settings</b> (do it in both projects; the password is that project&rsquo;s Resend key):
        </Where>
        <Open href={sb("auth/smtp")} label={`Open SMTP Settings (${projectWord})`} />
        <CopyField label="Sender email" value={`hello@${mailDomain}`} />
        <CopyField label="Sender name" value={APP_NAME} />
        <CopyField label="Host" value="smtp.resend.com" />
        <CopyField label="Port number" value="465" />
        <CopyField label="Username" value="resend" hint="Password: the new Resend API key" />
      </Section>

      <Section
        n={3}
        title="Supabase: where sign-in links lead"
        intro={
          <p>
            Supabase → the <b>{prod ? "production" : staging ? "staging" : "matching"}</b> project → Authentication → <b>URL Configuration</b>.
          </p>
        }
      >
        <Open href={sb("auth/url-configuration")} label={`Open URL Configuration (${projectWord})`} />
        <CopyField label="Site URL" value={target} hint="replace what's there, then Save" />
        <CopyField label="Redirect URLs → Add URL" value={`${target}/**`} hint="then Save URLs" />
        <Where>No slash at the end of the Site URL. Old addresses in Redirect URLs can stay until everyone uses the new one.</Where>
      </Section>

      <Section
        n={4}
        title="Supabase: the sign-in emails"
        intro={
          <>
            <p>
              Same project → Authentication → <b>Emails</b> → <b>Templates</b> (button below). For <b>Invite user</b>, then <b>Reset Password</b>:
            </p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Click the template&rsquo;s name in Supabase.</li>
              <li>
                <b>Subject</b>: select what&rsquo;s there and paste the Subject from here.
              </li>
              <li>
                <b>Message body</b>: if there are <b>Source</b> / Preview tabs, pick Source. Click inside, select all (Ctrl+A), delete, paste the Body from here.
              </li>
              <li>
                <b>Save changes</b>.
              </li>
            </ol>
            <p>The other three are optional (accounts are only made by invite).</p>
            <p>Their links lead to {target}/welcome, where people press a button to continue (so the link can&rsquo;t be used up by an email scanner).</p>
          </>
        }
      >
        <Open href={sb("auth/templates")} label={`Open Email Templates (${projectWord})`} />
        {emails.map((e) => (
          <div key={e.id} className="rounded-xl border border-line/10 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold">{e.supabaseName}</h3>
              <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${e.important ? "bg-amber/15 text-amber" : "bg-surface-2 text-ink-soft"}`}>
                {e.important ? "Do this one" : "Optional"}
              </span>
            </div>
            <CopyField label="Subject" value={e.subject} />
            <CopyField label="Body (message)" value={e.html} big />
            <EmailPreview html={e.html} origin={target} />
          </div>
        ))}
      </Section>

      <Section
        n={5}
        title="Platform sign-ins: return addresses"
        intro={<p>Each platform sends people back here after they connect an account. The address must match exactly, letter for letter. Keep the old ones until the move is done.</p>}
      >
        {setup.platforms.map((p) => (
          <div key={p.platform} className="space-y-2">
            <CopyField
              label={PLATFORM[p.platform].name}
              value={`${target}/api/social/${p.platform}/callback`}
              hint={p.keys ? "keys set in Vercel" : "keys missing in Vercel"}
            />
            <Where>{PLATFORM[p.platform].where}</Where>
          </div>
        ))}
      </Section>

      <Section n={6} title="Platform apps: website, privacy, terms" intro={<p>The approvals check these pages. They&rsquo;re public (no sign-in needed).</p>}>
        <CopyField label="Home page / website" value={`${target}/`} />
        <CopyField label="Privacy policy" value={`${target}/privacy`} />
        <CopyField label="Terms of service" value={`${target}/terms`} />
        <CopyField label="Data deletion instructions" value={`${target}/data-deletion`} />
        <CopyField label="Domain" value={domain} hint="Google: Authorized domains · Meta: App domains" />
        <CopyField label="Authorized JavaScript origin (Google)" value={target} />
        <Where>
          Google: Google Auth Platform → <b>Branding</b> (home page, privacy, terms, authorized domain) and Clients → your Web client (JavaScript origin). Google also wants
          the domain verified: Google Search Console → Add property → <b>Domain</b> {domain} → it shows a TXT record → add it in cPanel → Zone Editor (name: {domain}). Meta: App
          settings → <b>Basic</b> (App domains, Privacy Policy URL, Terms of Service URL, User data deletion → Data deletion instructions URL). TikTok: app →{" "}
          <b>Basic information</b> (Terms of Service URL, Privacy Policy URL, Web/Desktop URL) and <b>URL properties</b> → Verify → Domain {domain} (TikTok shows a TXT
          record: add it the same way).
        </Where>
      </Section>

      <Section
        n={7}
        title="Vercel: environment variables"
        intro={
          <p>
            Vercel → your project → Settings → <b>Environment Variables</b>. The status is for THIS copy ({ENV_LABEL[setup.env].toLowerCase()}). After changing any of them,
            redeploy (Deployments → ⋯ on the newest → Redeploy).
          </p>
        }
      >
        <ul className="divide-y divide-line/10 -my-2">
          {vars.map((v) => {
            const notHere = (v.need === "prod" && !prod) || (v.need === "staging" && !staging);
            const tone = notHere ? "text-ink-faint" : v.set ? "text-green" : v.need === "optional" ? "text-ink-faint" : "text-red";
            const word = notHere ? (v.set ? "Ignored here (fine)" : v.need === "prod" ? "Production only" : "Staging only") : v.set ? "Set" : v.need === "optional" ? "Optional" : "Missing";
            return (
              <li key={v.name} className="py-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <code className="font-mono text-[12.5px] font-semibold break-all">{v.name}</code>
                  <span className={`text-[12px] font-semibold ${tone}`}>{word}</span>
                </div>
                <p className="text-[12.5px] text-ink-soft">{v.what}</p>
                {v.value && !notHere ? <CopyField label="Value" value={v.value} /> : null}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        n={8}
        title="The timer: where Supabase calls the app"
        intro={
          <p>
            Every few minutes Supabase wakes the app to post videos, send meeting reminders and copy analytics. It keeps the app&rsquo;s address in its Vault
            (posting_url). Do this once {targetHost} opens the app (card 1).
          </p>
        }
      >
        <Open href={sb("sql/new")} label={`Open the SQL Editor (${projectWord})`} />
        <CopyField
          label={`Supabase → the ${projectWord} project → SQL Editor → New query → paste → Run`}
          value={`select vault.update_secret(id, '${target}/api/cron/posting') from vault.secrets where name = 'posting_url';\nselect decrypted_secret as timer_address from vault.decrypted_secrets where name = 'posting_url';`}
        />
        <Where>
          The answer is one row, <b>timer_address</b>, showing {target}/api/cron/posting. Then in the app: <b>Posting</b> → <b>Test the timer</b>: it should say the
          timer reached the app. &ldquo;No rows returned&rdquo; means the timer was never set up on this project: tell Claude.
        </Where>
      </Section>
    </div>
  );
}
