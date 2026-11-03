import type { Metadata } from "next";
import Link from "next/link";
import { APP_DOMAIN, APP_NAME, COMPANY_NAME, CONTACT_EMAIL, MASCOT_NAME } from "@/lib/brand";
import { PUBLIC_CHANGELOG } from "@/lib/changelog";
import { publicMetadata } from "@/lib/public-pages";
import { Mascot } from "@/components/ui/mascot";
import { FactList, PageHead, SiteCta, SitePage, SiteSection, textLink } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  ...publicMetadata("/about", "About", `What ${APP_NAME} is, who it's for, what it holds to and who runs it.`),
  robots: { index: true, follow: true },
};

/*
 * About (1.33.0): what ClipTroop is for and what it holds to, and the facts
 * as end credits (the home page's "Also starring"). Facts only: who runs it
 * comes from NEXT_PUBLIC_COMPANY_NAME, the number of updates from the
 * changelog.
 */

const PRINCIPLES = [
  { name: "Whose turn it is, always clear", text: "Every step of every video has a person on it, and the next person hears the moment it's theirs." },
  { name: "Your accounts stay yours", text: "We post only what your team approved, to the accounts your team connected, and you can disconnect them at any time." },
  { name: "Plain words", text: "The app says what happened and what to do next. When something goes wrong, it says what, and offers to try again." },
  { name: "Quick on a phone", text: "We measure how fast pages open for the people using them, phones first, and fix what's slow." },
  { name: "Nothing locked away", text: "Every plan has every feature. Plans differ in how many people, how many teams and how much help." },
  { name: "Better every few days", text: "Small updates, often, each one written up in plain words in the changelog." },
] as const;

export default function AboutPage() {
  const credits: { part: string; name: React.ReactNode }[] = [
    { part: "Made for", name: "Video teams posting to YouTube, TikTok, Instagram and Facebook" },
    { part: "Run by", name: COMPANY_NAME[0].toUpperCase() + COMPANY_NAME.slice(1) },
    { part: "Lives at", name: `app.${APP_DOMAIN}, in any browser, and on your phone's home screen` },
    { part: "Starring", name: `${MASCOT_NAME}, the clapperboard` },
    {
      part: "Updates so far",
      name: (
        <>
          {PUBLIC_CHANGELOG.length},{" "}
          <Link href="/changelog" className={textLink}>
            every one written up
          </Link>
        </>
      ),
    },
    {
      part: "Running",
      name: (
        <>
          Hour by hour on the{" "}
          <Link href="/status" className={textLink}>
            status page
          </Link>
        </>
      ),
    },
    {
      part: "Write to",
      name: CONTACT_EMAIL ? (
        <a href={`mailto:${CONTACT_EMAIL}`} className={`${textLink} break-all`}>
          {CONTACT_EMAIL}
        </a>
      ) : (
        <Link href="/contact" className={textLink}>
          Contact
        </Link>
      ),
    },
  ];

  return (
    <SitePage current="/about">
      <PageHead
        title="Made for the teams behind the videos"
        lead={`${APP_NAME} is where the people who research, write, film, edit, package and post a channel's videos do it together, from the first idea to the numbers after it's out.`}
      />

      <SiteSection id="why" title="Why it exists">
        <div className="max-w-[40rem] space-y-4 text-[17px] leading-relaxed text-ink-soft">
          <p>
            Making a video is a relay. An idea becomes a script, the script becomes a shoot, then a cut, a thumbnail and a post, and every step belongs to someone
            different.
          </p>
          <p>
            Most teams run that relay across group chats, spreadsheets and shared drives, and the hand-offs are where videos stall: nobody&rsquo;s sure whose
            turn it is, which cut is the latest, or whether the short went out.
          </p>
          <p className="text-ink">
            {APP_NAME} puts the whole relay in one place, so everyone sees what&rsquo;s next and whose turn it is, and the videos keep moving.
          </p>
        </div>
      </SiteSection>

      <div className="mt-20 sm:mt-28">
        <SiteSection id="principles" title="What we hold to">
          <FactList items={PRINCIPLES} />
        </SiteSection>
      </div>

      {/* The facts, as end credits. */}
      <section aria-labelledby="credits" className="max-w-4xl mx-auto px-4 sm:px-6 mt-24 sm:mt-32">
        <div className="flex flex-col items-center text-center">
          <Mascot size={96} />
          <h2 id="credits" className="mt-3 ld-italic text-[34px] sm:text-[44px] font-semibold tracking-[-0.01em]">
            The credits
          </h2>
        </div>
        <dl className="mt-10 space-y-5 sm:space-y-4">
          {credits.map((c) => (
            <div key={c.part} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1.6fr)] sm:items-baseline">
              <dt className="sm:text-right font-display text-[20px] sm:text-[22px] font-semibold">{c.part}</dt>
              <span className="hidden sm:block ld-leader h-3" aria-hidden />
              <dd className="text-[15.5px] text-ink-soft leading-relaxed">{c.name}</dd>
            </div>
          ))}
        </dl>
      </section>

      <SiteCta text={`Create an account, name your team after your channel and choose its plan. Your team opens as soon as it's on.`} />
    </SitePage>
  );
}
