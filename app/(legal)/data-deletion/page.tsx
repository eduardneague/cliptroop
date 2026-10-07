import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";
import { LEGAL_CONTACT, LEGAL_CONTACT_HREF, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Data deletion", robots: { index: true, follow: true } };

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="underline" href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);
const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-[20px] font-semibold pt-3">{children}</h2>;

/** Data deletion instructions (Meta and TikTok ask for this page; Google's policy too). */
export default function DataDeletionPage() {
  const contact = LEGAL_CONTACT_HREF ? <a className="underline" href={LEGAL_CONTACT_HREF}>{LEGAL_CONTACT}</a> : LEGAL_CONTACT;
  return (
    <article className="space-y-4 text-[15px] leading-relaxed">
      <h1 className="font-display text-[32px] font-semibold">Deleting your data</h1>
      <p className="text-ink-soft text-[13px]">Last updated: {LEGAL_UPDATED}</p>

      <H>Disconnect a social account</H>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>Sign in to {APP_NAME} and open Team → Connected accounts (masters and schedulers can do this).</li>
        <li>Click Disconnect on the account. {APP_NAME} tells the platform to revoke its access and deletes the sign-in tokens immediately.</li>
      </ol>
      <p>
        You can also remove access from the platform itself: <A href="https://myaccount.google.com/permissions">Google</A>, Instagram (Settings → Apps and websites),
        Facebook (Settings → Business integrations) or TikTok (Settings → Security → Manage app permissions). {APP_NAME} then can&rsquo;t use the account any more.
      </p>

      <H>Delete statistics, your account or your team&rsquo;s data</H>
      <p>
        Write to {contact} from the email address of your {APP_NAME} account and say what should be deleted: the statistics copied from a connected account, your
        personal account, or everything belonging to your team. We confirm and delete it within 30 days, including from the services that store it for us. Backups
        that still contain it expire on their own schedule.
      </p>

      <H>Turn off notifications</H>
      <p>Settings → Notifications &amp; app → Turn off on this device, or Remove next to any of your devices.</p>
    </article>
  );
}
