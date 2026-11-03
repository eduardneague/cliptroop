import type { Metadata } from "next";
import { publicMetadata } from "@/lib/public-pages";
import Link from "next/link";
import { APP_NAME, COMPANY_NAME } from "@/lib/brand";
import { LEGAL_CONTACT, LEGAL_CONTACT_HREF, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { ...publicMetadata("/terms", "Terms of service"), robots: { index: true, follow: true } };

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="underline" href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);
const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-[20px] font-semibold pt-3">{children}</h2>;

export default function TermsPage() {
  return (
    <article className="space-y-4 text-[15px] leading-relaxed">
      <h1 className="font-display text-[32px] font-semibold">Terms of service</h1>
      <p className="text-ink-soft text-[13px]">Last updated: {LEGAL_UPDATED}</p>

      <p>
        {APP_NAME} is run by {COMPANY_NAME}. By using it you agree to these terms.
      </p>

      <H>Your account</H>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>You must be 18 or older to make an account. Use your real name and an email address you can open.</li>
        <li>Anyone can make an account. Someone joining a team gets an invite from one of its Masters.</li>
        <li>Whoever makes a team owns it and is its first Master. They choose who joins it and what each person can do.</li>
      </ul>

      <H>Plans and payment</H>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>
          Every team needs a plan (<Link href="/pricing" className="underline">Pricing</Link>). There&rsquo;s no free plan or trial. A team&rsquo;s Master asks for one in the
          app; we agree the details by email and invoice for it, monthly or yearly, and the team opens once its plan is on.
        </li>
        <li>Prices are in US dollars, per person on the team, per month.</li>
        <li>Each plan includes storage for the team&rsquo;s files. If a team goes past it, we&rsquo;ll ask it to remove files or add storage to its plan.</li>
      </ul>

      <H>Using {APP_NAME}</H>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Keep your sign-in private. You&rsquo;re responsible for what happens under your account.</li>
        <li>Only connect social accounts you&rsquo;re allowed to publish to and read statistics for.</li>
        <li>Don&rsquo;t use {APP_NAME} to break the law, to infringe anyone&rsquo;s rights, or to try to get around its security.</li>
      </ul>

      <H>Platforms you connect</H>
      <p>
        Content published through {APP_NAME} must follow each platform&rsquo;s own rules. {APP_NAME} uses YouTube API Services (to post, for Analytics and for
        Outliers): by using {APP_NAME} you agree to be bound by the <A href="https://www.youtube.com/t/terms">YouTube Terms of Service</A>; Instagram and Facebook posts follow{" "}
        <A href="https://help.instagram.com/581066165581870">Instagram&rsquo;s Terms of Use</A> and <A href="https://www.facebook.com/terms.php">Meta&rsquo;s Terms</A>; TikTok posts
        follow <A href="https://www.tiktok.com/legal/page/global/terms-of-service/en">TikTok&rsquo;s Terms of Service</A>.
      </p>

      <H>Your content</H>
      <p>
        Your team owns everything it creates and uploads. You let us store and process it only to run {APP_NAME} for you, as described in the{" "}
        <Link href="/privacy" className="underline">privacy policy</Link>.
      </p>

      <H>Availability</H>
      <p>
        We work to keep {APP_NAME} reliable (see <Link href="/status" className="underline">Status</Link>), but it&rsquo;s provided as is, without guarantees. Scheduled posts depend
        on each platform accepting them; when a post fails, {APP_NAME} tells you so it can be retried. We&rsquo;re not liable for indirect losses such as lost views or revenue.
      </p>

      <H>Ending</H>
      <p>
        You can stop using {APP_NAME} any time and ask for your data to be deleted (<Link href="/data-deletion" className="underline">how</Link>). We may suspend accounts that break
        these terms.
      </p>

      <H>Changes</H>
      <p>We may update these terms; the date at the top changes when we do, and significant changes are announced in the app.</p>

      <H>Contact</H>
      <p>{LEGAL_CONTACT_HREF ? <a className="underline" href={LEGAL_CONTACT_HREF}>{LEGAL_CONTACT}</a> : LEGAL_CONTACT}</p>
    </article>
  );
}
