import type { Metadata } from "next";
import { publicMetadata } from "@/lib/public-pages";
import Link from "next/link";
import { APP_NAME, COMPANY_NAME } from "@/lib/brand";
import { LEGAL_CONTACT, LEGAL_CONTACT_HREF, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { ...publicMetadata("/privacy", "Privacy policy"), robots: { index: true, follow: true } };

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="underline" href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);
const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-[20px] font-semibold pt-3">{children}</h2>;
const Contact = () => (LEGAL_CONTACT_HREF ? <a className="underline" href={LEGAL_CONTACT_HREF}>{LEGAL_CONTACT}</a> : <>{LEGAL_CONTACT}</>);

export default function PrivacyPage() {
  return (
    <article className="space-y-4 text-[15px] leading-relaxed">
      <h1 className="font-display text-[32px] font-semibold">Privacy policy</h1>
      <p className="text-ink-soft text-[13px]">Last updated: {LEGAL_UPDATED}</p>

      <p>
        {APP_NAME} is a production planner for video teams, run by {COMPANY_NAME}. Teams use it to plan, write, review, schedule and publish their own
        videos, and to see how those videos perform. Accounts are invitation only. This page explains what {APP_NAME} stores, why, who it&rsquo;s shared
        with, and how to have it deleted.
      </p>

      <H>What we store</H>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><b>Your account:</b> email address, name, username, profile picture, your preferences (theme, sounds, currency) and the teams you belong to.</li>
        <li><b>Your team&rsquo;s work:</b> video plans, titles, scripts and research, comments, notes, sketches, thumbnails, uploaded video files, meetings, tasks and to-dos.</li>
        <li>
          <b>Connected social accounts</b> (YouTube, Instagram, TikTok, Facebook Pages): the account&rsquo;s ID, name, username and picture, which permissions were
          granted, and the sign-in tokens the platform gives us. Tokens are encrypted before they&rsquo;re stored.
        </li>
        <li>
          <b>Statistics of those accounts</b>, copied once a day: views, watch time, likes, comments, shares, followers, audience by country, the latest
          posts and their numbers, and (for YouTube channels in the Partner Program) estimated revenue. Income a team adds by hand is stored too.
        </li>
        <li><b>Devices for notifications:</b> if you turn on notifications, the address your browser gives us to deliver them, and a label like &ldquo;iPhone · Safari&rdquo;.</li>
        <li><b>Technical logs:</b> when something breaks, the error message, the page, and which account saw it, so it can be fixed.</li>
      </ul>

      <H>How we use it</H>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>To run {APP_NAME} for your team: show the work, assign steps, send notifications and emails about it.</li>
        <li>
          Connected accounts are used only to publish or schedule the videos your team chooses to post, to change or cancel those scheduled posts, and to
          read the account&rsquo;s statistics to show them in {APP_NAME}&rsquo;s Analytics. We don&rsquo;t post anything your team didn&rsquo;t approve, and
          we don&rsquo;t read messages or comments sent to you.
        </li>
        <li>We don&rsquo;t sell any data, don&rsquo;t use it for advertising, and don&rsquo;t use it to train AI models.</li>
        <li>Only members of your team see your team&rsquo;s data, according to their role. Revenue is visible only to the people the team&rsquo;s master allows.</li>
      </ul>

      <H>YouTube and Google</H>
      <p>
        {APP_NAME} uses YouTube API Services. By connecting a YouTube channel you also agree to the <A href="https://www.youtube.com/t/terms">YouTube Terms of Service</A>,
        and Google&rsquo;s use of your data is covered by the <A href="https://policies.google.com/privacy">Google Privacy Policy</A>. With your permission{" "}
        {APP_NAME} uploads videos, changes or cancels the ones it scheduled, and reads YouTube Analytics (including revenue when allowed) for the connected channel.
      </p>
      <p>
        {APP_NAME}&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
        <A href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</A>, including the Limited Use requirements.
        You can remove {APP_NAME}&rsquo;s access any time at <A href="https://myaccount.google.com/permissions">Google security settings</A>.
      </p>

      <H>Instagram, Facebook and TikTok</H>
      <p>
        Instagram and Facebook Page access is used to publish your team&rsquo;s approved videos (as Reels, publicly on a Page) and read the account&rsquo;s or Page&rsquo;s insights. TikTok access
        is used to post your team&rsquo;s approved videos and read the account&rsquo;s profile and video statistics. You can remove access in Instagram (Settings → Apps and
        websites), Facebook (Settings → Business integrations) and TikTok (Settings → Security → Manage app permissions).
      </p>

      <H>Who we share it with</H>
      <p>Only the services that run {APP_NAME}, each under its own privacy terms, and only to provide the service:</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Supabase: database, sign-in and file storage.</li>
        <li>Vercel: hosting.</li>
        <li>Resend: sending emails.</li>
        <li>Google (YouTube), Meta (Instagram, Facebook) and TikTok: the platforms your team connects, when publishing or reading statistics.</li>
        <li>Push services of your browser (Apple, Google, Mozilla, Microsoft): to deliver notifications you turned on. Messages are encrypted for your device.</li>
      </ul>

      <H>Cookies and device storage</H>
      <p>
        {APP_NAME} uses cookies to keep you signed in and remember your team and choices, and your browser&rsquo;s storage for preferences like dark mode. No advertising
        or tracking cookies.
      </p>

      <H>How it&rsquo;s protected</H>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Everything travels encrypted (HTTPS). Platform sign-in tokens are encrypted at rest and only ever used by our server, never sent to a browser.</li>
        <li>Uploaded videos are private; viewing them uses links that expire.</li>
        <li>Database rules check every request against the person&rsquo;s team and role.</li>
      </ul>

      <H>How long we keep it</H>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Uploaded video files are deleted after the video is posted everywhere: after 1, 2 or 3 weeks or 1 month, as the team chooses (2 weeks unless it changes that).</li>
        <li>Sign-in tokens are deleted the moment an account is disconnected.</li>
        <li>Notification devices are removed when you turn them off, log out on that device, or the browser stops accepting messages.</li>
        <li>Everything else is kept while your team uses {APP_NAME}, and deleted on request (below).</li>
      </ul>

      <H>Your rights and choices</H>
      <p>
        You can see and change your profile in Settings, disconnect any social account in Team → Connected accounts, and turn notifications off per device. You can ask for a
        copy of your data, a correction, or its deletion: see <Link href="/data-deletion" className="underline">Data deletion</Link> or write to <Contact />. We answer within 30 days.
      </p>

      <H>Changes</H>
      <p>If this policy changes, the date at the top changes too, and significant changes are announced in the app.</p>

      <H>Contact</H>
      <p>
        {COMPANY_NAME[0].toUpperCase() + COMPANY_NAME.slice(1)}: <Contact />
      </p>
    </article>
  );
}
