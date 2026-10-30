import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { CheckIcon } from "@/components/ui/icons";
import { CURRENCY, PLAN_FACTS, gbLabel } from "@/lib/plans";
import { EVERY_PLAN, PLANS, PRICING_FAQ } from "@/lib/site/plans";
import { askHref, PageHead, SitePage, textLink } from "@/components/site/site-chrome";
import { PricingPlans } from "@/components/site/pricing-plans";

export const metadata: Metadata = {
  ...publicMetadata(
    "/pricing",
    "Pricing",
    `${APP_NAME}'s plans: Studio at ${CURRENCY}${PLAN_FACTS.studio.monthly} a person a month (${CURRENCY}${PLAN_FACTS.studio.yearly} billed yearly) with ${gbLabel(PLAN_FACTS.studio.storageGb)} of storage, and Network for agencies, priced with you. No free plan, no trial.`
  ),
  robots: { index: true, follow: true },
};

/*
 * Pricing (1.33.0; 1.45.0: open to everyone, no free plan or trial, ten times the price, storage with each plan;
 * 1.46.0: rebuilt edge to edge, "much more beautiful"). The plans and what a team pays: PricingPlans (monthly or
 * yearly, how many people, the totals worked out as you choose). Then storage, side by side, every plan, questions.
 */

const money = (n: number) => `${CURRENCY}${n.toLocaleString("en-US")}`;

const COMPARE: { row: string; studio: string; network: string }[] = [
  { row: "Price a person, a month", studio: `${money(PLAN_FACTS.studio.monthly ?? 0)}, or ${money(PLAN_FACTS.studio.yearly ?? 0)} billed yearly`, network: "Priced with you" },
  { row: "Teams", studio: "One", network: "Several, one person in many" },
  { row: "People", studio: "As many as you need", network: "As many as you need" },
  { row: "Storage", studio: `${gbLabel(PLAN_FACTS.studio.storageGb)} for the team`, network: `${gbLabel(PLAN_FACTS.network.storageGb)} for each team, more when you need it` },
  { row: "Features", studio: "Every one", network: "Every one" },
  { row: "Setting up", studio: "You, in the app", network: "Each team set up with you" },
  { row: "Invoices", studio: "Monthly or yearly", network: "Your way" },
];

const COUNTS = ["Short and long videos uploaded for review and posting", "Thumbnails and the mockup library", "Pictures in scripts and editing sketches", "Logos and media-kit photos"];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-display text-[32px] sm:text-[42px] font-semibold leading-[1.04] tracking-[-0.02em]">
      {children}
    </h2>
  );
}

export default function PricingPage() {
  const studio = PLAN_FACTS.studio;
  const network = PLAN_FACTS.network;
  const half = Math.ceil(PRICING_FAQ.length / 2);
  return (
    <SitePage current="/pricing">
      <PageHead
        title="One price a person, every feature"
        lead="No free plan and no trial. Studio is for one team making its own videos; Network is for agencies and networks running several. Both have every feature: they differ in teams, storage and how we set you up."
      />

      <PricingPlans plans={PLANS} currency={CURRENCY} talkHref={askHref(`${APP_NAME}: the Network plan`)} />

      {/* Storage: what each plan holds, to scale. */}
      <section aria-labelledby="storage-title" className="max-w-6xl mx-auto px-4 sm:px-6 mt-24 sm:mt-32">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5" data-reveal>
            <H2 id="storage-title">Storage that comes with it</H2>
            <p className="mt-4 text-[16.5px] leading-relaxed text-ink-soft">
              Every plan holds the team&rsquo;s files. Team → Team shows what you use, file type by file type, and uploaded videos clear themselves 7 to 30 days after
              they&rsquo;re posted everywhere (you choose how long).
            </p>
            <ul className="mt-6 space-y-2.5">
              {COUNTS.map((x) => (
                <li key={x} className="flex gap-2.5 text-[15px] text-ink-soft">
                  <CheckIcon className="w-4 h-4 mt-1 flex-shrink-0 text-amber" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-7 space-y-5">
            {[
              { name: studio.name, gb: studio.storageGb, note: "for the team" },
              { name: network.name, gb: network.storageGb, note: "for each team, more when you need it" },
            ].map((x, i) => (
              <div key={x.name} className="rounded-[24px] border border-line/15 bg-surface p-6 sm:p-7" data-reveal style={{ ["--i" as string]: i }}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-display text-[24px] font-semibold">{x.name}</span>
                  <span className="text-[15px] text-ink-soft">
                    <b className="font-display text-[28px] text-ink tabular-nums">{gbLabel(x.gb)}</b> {x.note}
                  </span>
                </div>
                <div className="mt-5 h-3 rounded-full bg-line/10 overflow-hidden" aria-hidden>
                  <span className="price-bar block h-full rounded-full bg-amber" style={{ width: `${(x.gb / network.storageGb) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Side by side. */}
      <section aria-labelledby="compare-title" className="max-w-6xl mx-auto px-4 sm:px-6 mt-24 sm:mt-32" data-reveal>
        <H2 id="compare-title">Side by side</H2>
        <div className="mt-8 rounded-[24px] border border-line/15 bg-surface overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-[15.5px]">
            <thead>
              <tr>
                <th scope="col" className="px-6 py-4 w-[30%]">
                  <span className="sr-only">What</span>
                </th>
                <th scope="col" className="px-6 py-4 font-display text-[20px] font-semibold">
                  Studio
                </th>
                <th scope="col" className="px-6 py-4 font-display text-[20px] font-semibold">
                  Network
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((c) => (
                <tr key={c.row} className="border-t border-line/10 align-top">
                  <th scope="row" className="px-6 py-4 font-semibold">
                    {c.row}
                  </th>
                  <td className="px-6 py-4 text-ink-soft">{c.studio}</td>
                  <td className="px-6 py-4 text-ink-soft">{c.network}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* In every plan: the dark band. */}
      <section aria-labelledby="every-title" className="mt-24 sm:mt-32 bg-[rgb(43_33_24)] text-[rgb(246_240_228)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid gap-10 lg:grid-cols-12 lg:gap-12 lg:items-center">
          <div className="lg:col-span-5" data-reveal>
            <span className="block w-14 h-[7px] rounded-[3px] ld-stripes-light" aria-hidden />
            <h2 id="every-title" className="mt-5 font-display text-[32px] sm:text-[42px] font-semibold leading-[1.04] tracking-[-0.02em]">
              In every plan
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[rgb(246_240_228/0.75)]">
              Nothing is locked behind a bigger plan.{" "}
              <Link href="/features" className="underline underline-offset-2 decoration-[rgb(246_240_228/0.4)] hover:decoration-amber">
                Every feature, department by department
              </Link>
              .
            </p>
          </div>
          <ul className="lg:col-span-7 grid gap-4 sm:grid-cols-2">
            {EVERY_PLAN.map((x, i) => (
              <li key={x} className="flex gap-3 rounded-2xl border border-[rgb(255_244_230/0.12)] bg-[rgb(255_244_230/0.05)] px-5 py-4 text-[15.5px]" data-reveal style={{ ["--i" as string]: i }}>
                <CheckIcon className="w-4 h-4 mt-1 flex-shrink-0 text-amber" />
                <span className="text-[rgb(246_240_228/0.88)]">{x}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Questions, in two columns. */}
      <section aria-labelledby="questions-title" className="max-w-6xl mx-auto px-4 sm:px-6 mt-24 sm:mt-32">
        <div data-reveal>
          <H2 id="questions-title">Questions</H2>
        </div>
        <div className="mt-8 grid gap-x-12 lg:grid-cols-2">
          {[PRICING_FAQ.slice(0, half), PRICING_FAQ.slice(half)].map((col, k) => (
            <div key={k} className="divide-y divide-line/15 border-y border-line/15 lg:[&:last-child]:border-t-line/15">
              {col.map((f) => (
                <details key={f.q} className="site-faq group py-4">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[16.5px] font-semibold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="text-ink-faint text-[22px] leading-none transition-transform duration-300 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-[15.5px] leading-relaxed text-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-10 text-[14px] text-ink-faint">
          Prices in US dollars, before any sales tax. See{" "}
          <Link href="/platforms" className={textLink}>
            how {APP_NAME} uses your accounts
          </Link>{" "}
          and the{" "}
          <Link href="/terms" className={textLink}>
            terms
          </Link>
          .
        </p>
      </section>
    </SitePage>
  );
}
