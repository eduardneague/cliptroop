import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of service" };

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "privacy@example.com";
const OWNER = process.env.NEXT_PUBLIC_COMPANY_NAME || "the VPlanner team";

export default function TermsPage() {
  return (
    <article className="space-y-5 text-[15px] leading-relaxed">
      <h1 className="font-display text-[32px] font-semibold">Terms of service</h1>
      <p className="text-ink-soft text-[13px]">Last updated: September 2026</p>

      <p>
        VPlanner is a private, internal tool run by {OWNER}. Access is by invitation only, for members of our team.
      </p>

      <h2 className="text-[20px] font-semibold pt-2">Using VPlanner</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Keep your sign-in private and use VPlanner only for your team&rsquo;s work.</li>
        <li>Only connect social accounts you&rsquo;re authorised to publish to.</li>
        <li>
          Content published through VPlanner must follow each platform&rsquo;s own rules, including the{" "}
          <a className="underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>,
          TikTok&rsquo;s and Instagram&rsquo;s terms.
        </li>
      </ul>

      <h2 className="text-[20px] font-semibold pt-2">Your content</h2>
      <p>
        Your team owns what it creates and uploads. We store it only to run VPlanner, as described in the privacy policy.
      </p>

      <h2 className="text-[20px] font-semibold pt-2">Availability</h2>
      <p>
        We work to keep VPlanner reliable, but it&rsquo;s provided as is. Scheduled posts depend on each platform
        accepting them; if a post fails, VPlanner tells you so it can be retried.
      </p>

      <h2 className="text-[20px] font-semibold pt-2">Contact</h2>
      <p>
        <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </article>
  );
}
