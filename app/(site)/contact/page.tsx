import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, COMPANY_NAME, COMPANY_NAME_SET, CONTACT_EMAIL } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { PageHead, SitePage, textLink } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  ...publicMetadata("/contact", "Contact", `How to reach the people behind ${APP_NAME}: a plan for your team, help with the app, your data or a security problem.`),
  robots: { index: true, follow: true },
};

/*
 * Contact (1.33.0): the address (NEXT_PUBLIC_CONTACT_EMAIL) and a call
 * sheet: what to write about and what to tell us, each with an email that
 * already has its subject. Without the address set, the sheet keeps its
 * pages and says where to go instead.
 */

type Topic = { name: string; tell: string; subject?: string; also?: { href: string; label: string } };

const TOPICS: Topic[] = [
  {
    name: "A plan for your team",
    tell: "Anyone can create an account and choose a plan in the app. For Network, or anything about a plan or an invoice, tell us your channels, how many people make your videos and where you post them.",
    subject: `${APP_NAME} for our team`,
    also: { href: "/pricing", label: "The plans" },
  },
  {
    name: "Help with the app",
    tell: "What you did, what you expected and what happened instead. On a team already? Settings → Report a bug or suggest something sends it with what we need.",
    subject: `Help with ${APP_NAME}`,
  },
  {
    name: "Your data",
    tell: `Write from your ${APP_NAME} account's email address and say what should be deleted.`,
    subject: "My data",
    also: { href: "/data-deletion", label: "Deleting your data" },
  },
  {
    name: "A security problem",
    tell: "What you found and how to see it happen.",
    subject: `${APP_NAME}: security report`,
    also: { href: "/security#report", label: "How we handle reports" },
  },
  {
    name: "Is something down?",
    tell: "The status page says whether everything is running, hour by hour.",
    also: { href: "/status", label: "Status" },
  },
];

const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

export default function ContactPage() {
  return (
    <SitePage current="/contact">
      <PageHead
        title="Talk to us"
        lead="A plan for your team, a question about the app, your data or a security problem: write to us and a person answers."
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {CONTACT_EMAIL ? (
          <p>
            <a
              href={mailto(`${APP_NAME}`)}
              className="font-display text-[30px] sm:text-[52px] font-semibold leading-tight tracking-[-0.02em] underline decoration-amber decoration-[3px] underline-offset-[8px] hover:text-amber break-all"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        ) : (
          <p className="text-[17px] leading-relaxed text-ink-soft max-w-[40rem]">
            Our email address isn&rsquo;t up yet. On a team already? Settings → Report a bug or suggest something reaches us from inside the app.
          </p>
        )}
        {COMPANY_NAME_SET && (
          <p className="mt-5 text-[15px] text-ink-faint">
            {APP_NAME} is run by {COMPANY_NAME}.
          </p>
        )}
      </div>

      {/* The call sheet: what to write about. */}
      <section aria-labelledby="sheet" className="max-w-6xl mx-auto px-4 sm:px-6 mt-16 sm:mt-20">
        <div className="rounded-[22px] border border-line/15 bg-surface overflow-hidden">
          <div className="h-[10px] ld-stripes" aria-hidden />
          <div className="px-5 sm:px-8 pt-6 pb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="sheet" className="font-display text-[26px] sm:text-[30px] font-semibold">
              Call sheet
            </h2>
            <p className="text-[14px] text-ink-faint">What to write about, and what to tell us</p>
          </div>
          <ul className="divide-y divide-line/10 border-t border-line/10">
            {TOPICS.map((t) => (
              <li key={t.name} className="px-5 sm:px-8 py-5 grid gap-2 md:grid-cols-[15rem_minmax(0,1fr)_13rem] md:gap-8 md:items-baseline">
                <h3 className="font-semibold text-[16px]">{t.name}</h3>
                <p className="text-[15px] leading-relaxed text-ink-soft">{t.tell}</p>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-[14.5px] md:justify-end">
                  {t.subject && CONTACT_EMAIL && (
                    <a href={mailto(t.subject)} className={textLink}>
                      Write to us
                    </a>
                  )}
                  {t.also && (
                    <Link href={t.also.href} className={textLink}>
                      {t.also.label}
                    </Link>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </SitePage>
  );
}
