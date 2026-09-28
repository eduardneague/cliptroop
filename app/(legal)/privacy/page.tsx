import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "privacy@example.com";
const OWNER = process.env.NEXT_PUBLIC_COMPANY_NAME || "the VPlanner team";

export default function PrivacyPage() {
  return (
    <article className="space-y-5 text-[15px] leading-relaxed">
      <h1 className="font-display text-[32px] font-semibold">Privacy policy</h1>
      <p className="text-ink-soft text-[13px]">Last updated: September 2026</p>

      <p>
        VPlanner is an internal tool run by {OWNER} to plan, review and publish our own videos. It&rsquo;s used only by
        members of our team, invited by us. This page explains what it stores and why.
      </p>

      <h2 className="text-[20px] font-semibold pt-2">What we store</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Your account: email, name, username, profile picture and the teams you belong to.</li>
        <li>Work content: video plans, scripts, notes, review comments and uploaded videos.</li>
        <li>
          Connected social accounts (YouTube, Instagram, TikTok): the account&rsquo;s ID, name and picture, and the
          sign-in tokens the platform gives us so we can publish on your behalf.
        </li>
      </ul>

      <h2 className="text-[20px] font-semibold pt-2">How we use connected accounts</h2>
      <p>
        We use a connected account only to publish or schedule the videos your team chooses to post, and to show which
        account is connected. We don&rsquo;t read your messages, followers or analytics, and we don&rsquo;t sell, share
        or use this data for advertising.
      </p>
      <p>
        VPlanner&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
        <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2 className="text-[20px] font-semibold pt-2">How it&rsquo;s protected</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Sign-in tokens are encrypted before they&rsquo;re stored and are only ever used by our server, never sent to a browser.</li>
        <li>Uploaded videos are private. Viewing them uses links that expire.</li>
        <li>Access is limited to members of your team, according to their role.</li>
      </ul>

      <h2 className="text-[20px] font-semibold pt-2">How long we keep it</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Uploaded videos are deleted 2 days after they&rsquo;ve been published, unless the team chooses to keep them.</li>
        <li>Connection tokens are deleted as soon as an account is disconnected.</li>
        <li>Everything else is kept while your account exists, and deleted with it.</li>
      </ul>

      <h2 className="text-[20px] font-semibold pt-2">Your choices</h2>
      <p>
        You can disconnect a social account any time from Team → Connected accounts. You can also remove VPlanner&rsquo;s
        access from Google (myaccount.google.com/permissions), TikTok or Instagram settings. To delete your data, email{" "}
        <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> and we&rsquo;ll delete it within 30 days.
      </p>

      <h2 className="text-[20px] font-semibold pt-2">Services we use</h2>
      <p>
        Supabase (database and storage), Vercel (hosting), and the YouTube, Instagram and TikTok APIs (publishing).
      </p>

      <h2 className="text-[20px] font-semibold pt-2">Contact</h2>
      <p>
        Questions: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </article>
  );
}
