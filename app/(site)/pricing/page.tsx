import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { CheckIcon } from "@/components/ui/icons";
import { CURRENCY, PLAN_FACTS, gbLabel } from "@/lib/plans";
import { EVERY_PLAN, PLANS, PRICING_FAQ, priceLabel, type Plan } from "@/lib/site/plans";
import { askHref, btn, PageHead, SitePage, SiteSection, textLink } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  ...publicMetadata(
    "/pricing",
    "Pricing",
    `${APP_NAME}'s plans: Studio at ${CURRENCY}${PLAN_FACTS.studio.monthly} a person a month (${CURRENCY}${PLAN_FACTS.studio.yearly} billed yearly) with ${gbLabel(PLAN_FACTS.studio.storageGb)} of storage, and Network for agencies, priced with you. No free plan, no trial.`
  ),
  robots: { index: true, follow: true },
};

/*
 * Pricing (1.33.0; 1.45.0: ClipTroop open to everyone, no free plan or trial, prices ten times what they were, and
 * storage with each plan). The plans are lib/site/plans.ts, on lib/plans.ts's facts. Monthly or yearly is a pair of
 * radio buttons and CSS (.billing in landing.css): no script. What a team pays is worked out below for a few sizes, so
 * nobody has to multiply.
 */

const money = (n: number) => `${CURRENCY}${n.toLocaleString("en-US")}`;

function Price({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  const label = priceLabel(plan, yearly);
  return (
    <span className={yearly ? "price-yearly" : "price-monthly"}>
      {label === null ? (
        <span className="font-display text-[34px] font-semibold leading-none">Priced with you</span>
      ) : (
        <span className="font-display text-[50px] font-semibold leading-none tabular-nums">{label}</span>
      )}
    </span>
  );
}

function PlanColumn({ plan }: { plan: Plan }) {
  const dark = !!plan.featured;
  const custom = plan.monthly === null;
  return (
    <section
      aria-labelledby={`plan-${plan.id}`}
      className={`relative flex flex-col rounded-[26px] p-6 sm:p-8 ${dark ? "bg-[rgb(43_33_24)] text-[rgb(246_240_228)] dark:ring-1 dark:ring-amber/40" : "border border-line/15 bg-surface"}`}
    >
      {dark && <span className="absolute left-8 right-8 top-0 h-[7px] rounded-b-[3px] ld-stripes-light" aria-hidden />}
      <h2 id={`plan-${plan.id}`} className="font-display text-[28px] font-semibold">
        {plan.name}
      </h2>
      <p className={`mt-1.5 text-[15px] leading-snug ${dark ? "text-[rgb(246_240_228/0.7)]" : "text-ink-soft"}`}>{plan.for}</p>
      <div className="mt-7 min-h-[76px]">
        <Price plan={plan} yearly={false} />
        <Price plan={plan} yearly />
        <p className={`mt-2 text-[14px] ${dark ? "text-[rgb(246_240_228/0.65)]" : "text-ink-faint"}`}>
          {plan.unit}
          {!custom && (
            <>
              <span className="price-monthly">, billed monthly</span>
              <span className="price-yearly">, billed yearly</span>
            </>
          )}
        </p>
      </div>
      <ul className="mt-6 space-y-2.5 text-[15px] flex-1">
        {plan.includes.map((x) => (
          <li key={x} className="flex gap-2.5">
            <CheckIcon className="w-4 h-4 mt-1 flex-shrink-0 text-amber" />
            <span className={dark ? "text-[rgb(246_240_228/0.85)]" : "text-ink-soft"}>{x}</span>
          </li>
        ))}
      </ul>
      {custom ? (
        <a href={askHref(`${APP_NAME}: the ${plan.name} plan`)} className={`${btn} mt-8 h-12 px-5 text-[15px] border border-line/20 hover:border-line/40 hover:bg-surface-2`}>
          Talk to us about {plan.name}
        </a>
      ) : (
        <Link href="/signup" className={`${btn} mt-8 h-12 px-5 text-[15px] ${dark ? "bg-amber text-white hover:brightness-110" : "border border-line/20 hover:border-line/40"}`}>
          Create an account
        </Link>
      )}
    </section>
  );
}

const SIZES = [1, 3, 5, 10];

const COMPARE: { row: string; studio: string; network: string }[] = [
  { row: "Price a person, a month", studio: `${money(PLAN_FACTS.studio.monthly ?? 0)}, or ${money(PLAN_FACTS.studio.yearly ?? 0)} billed yearly`, network: "Priced with you" },
  { row: "Teams", studio: "One", network: "Several, one person in many" },
  { row: "People", studio: "As many as you need", network: "As many as you need" },
  { row: "Storage", studio: `${gbLabel(PLAN_FACTS.studio.storageGb)} for the team`, network: `${gbLabel(PLAN_FACTS.network.storageGb)} for each team, more when you need it` },
  { row: "Features", studio: "Every one", network: "Every one" },
  { row: "Setting up", studio: "You, in the app", network: "Each team set up with you" },
  { row: "Invoices", studio: "Monthly or yearly", network: "Your way" },
];

export default function PricingPage() {
  const studio = PLAN_FACTS.studio;
  return (
    <SitePage current="/pricing">
      <PageHead
        title="One price a person, every feature"
        lead="No free plan and no trial. Studio is for one team making its own videos; Network is for agencies and networks running several. Both have every feature: they differ in teams, storage and how we set you up."
      />

      <div className="billing max-w-5xl mx-auto px-4 sm:px-6">
        <fieldset className="inline-flex rounded-xl border border-line/15 p-1 bg-surface">
          <legend className="sr-only">Billing</legend>
          <input type="radio" name="billing" id="billing-monthly" className="sr-only" defaultChecked />
          <label htmlFor="billing-monthly" className="billing-option rounded-lg px-4 h-9 inline-flex items-center text-[14px] font-semibold cursor-pointer">
            Monthly
          </label>
          <input type="radio" name="billing" id="billing-yearly" className="sr-only" />
          <label htmlFor="billing-yearly" className="billing-option rounded-lg px-4 h-9 inline-flex items-center text-[14px] font-semibold cursor-pointer">
            Yearly, two months free
          </label>
        </fieldset>

        <div className="mt-8 grid gap-5 md:grid-cols-2 items-stretch">
          {PLANS.map((p) => (
            <PlanColumn key={p.id} plan={p} />
          ))}
        </div>
      </div>

      <div className="mt-20 sm:mt-24 space-y-20 sm:space-y-24">
        <SiteSection id="examples" title="What a team pays" lead={`${studio.name}, worked out for a few team sizes. Everyone with a place on the team counts.`}>
          <div className="rounded-2xl border border-line/15 bg-surface overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-[15px] tabular-nums">
              <thead>
                <tr className="text-[13px] text-ink-faint">
                  <th scope="col" className="px-5 py-3 font-semibold">
                    People
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Billed monthly
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Billed yearly
                  </th>
                </tr>
              </thead>
              <tbody>
                {SIZES.map((n) => (
                  <tr key={n} className="border-t border-line/10">
                    <th scope="row" className="px-5 py-3.5 font-semibold">
                      {n === 1 ? "1 person" : `${n} people`}
                    </th>
                    <td className="px-5 py-3.5 text-ink-soft">{money((studio.monthly ?? 0) * n)} a month</td>
                    <td className="px-5 py-3.5 text-ink-soft">
                      {money((studio.yearly ?? 0) * n * 12)} a year <span className="text-ink-faint">({money((studio.yearly ?? 0) * n)} a month)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SiteSection>

        <SiteSection id="compare" title="Side by side">
          <div className="rounded-2xl border border-line/15 bg-surface overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-[15px]">
              <thead>
                <tr className="text-[13px] text-ink-faint">
                  <th scope="col" className="px-5 py-3 font-semibold">
                    <span className="sr-only">What</span>
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink">
                    Studio
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold text-ink">
                    Network
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((c) => (
                  <tr key={c.row} className="border-t border-line/10 align-top">
                    <th scope="row" className="px-5 py-3.5 font-semibold w-[30%]">
                      {c.row}
                    </th>
                    <td className="px-5 py-3.5 text-ink-soft">{c.studio}</td>
                    <td className="px-5 py-3.5 text-ink-soft">{c.network}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SiteSection>

        <SiteSection id="every" title="In every plan">
          <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2 text-[15.5px]">
            {EVERY_PLAN.map((x) => (
              <li key={x} className="flex gap-2.5 border-t border-line/15 pt-4">
                <CheckIcon className="w-4 h-4 mt-1 flex-shrink-0 text-amber" />
                <span className="text-ink-soft">{x}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[15px]">
            <Link href="/features" className={textLink}>
              Every feature, department by department
            </Link>
          </p>
        </SiteSection>

        <SiteSection id="questions" title="Questions">
          <div className="divide-y divide-line/15 border-y border-line/15">
            {PRICING_FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[16.5px] font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="text-ink-faint text-[22px] leading-none transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[15.5px] leading-relaxed text-ink-soft max-w-[40rem]">{f.a}</p>
              </details>
            ))}
          </div>
        </SiteSection>
      </div>

      <p className="max-w-6xl mx-auto px-4 sm:px-6 mt-12 text-[14px] text-ink-faint">
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
    </SitePage>
  );
}
