import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { CheckIcon } from "@/components/ui/icons";
import { EVERY_PLAN, PLANS, PRICING_FAQ, priceLabel, type Plan } from "@/lib/site/plans";
import { askHref, btn, PageHead, SitePage, SiteSection, textLink } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  ...publicMetadata("/pricing", "Pricing", `${APP_NAME}'s plans: free for a small crew, per person for teams of any size, and priced with you for agencies and networks.`),
  robots: { index: true, follow: true },
};

/*
 * Pricing (1.33.0). The plans are lib/site/plans.ts. Monthly or yearly is a
 * pair of radio buttons and CSS (.billing in landing.css): no script.
 */

function Price({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  const label = priceLabel(plan, yearly);
  return (
    <span className={yearly ? "price-yearly" : "price-monthly"}>
      {label === null ? (
        <span className="font-display text-[34px] font-semibold leading-none">Let&rsquo;s talk</span>
      ) : (
        <span className="font-display text-[46px] font-semibold leading-none tabular-nums">{label}</span>
      )}
    </span>
  );
}

function PlanColumn({ plan }: { plan: Plan }) {
  const dark = !!plan.featured;
  const ask = askHref(`${APP_NAME}: the ${plan.name} plan`);
  return (
    <section
      aria-labelledby={`plan-${plan.id}`}
      className={`relative flex flex-col rounded-[26px] p-6 sm:p-7 ${dark ? "bg-[rgb(43_33_24)] text-[rgb(246_240_228)] dark:ring-1 dark:ring-amber/40" : "border border-line/15 bg-surface"}`}
    >
      {dark && <span className="absolute left-7 right-7 top-0 h-[7px] rounded-b-[3px] ld-stripes-light" aria-hidden />}
      <h2 id={`plan-${plan.id}`} className="font-display text-[26px] font-semibold">
        {plan.name}
      </h2>
      <p className={`mt-1.5 text-[15px] leading-snug lg:min-h-[2.75em] ${dark ? "text-[rgb(246_240_228/0.7)]" : "text-ink-soft"}`}>{plan.for}</p>
      <div className="mt-6 min-h-[64px]">
        <Price plan={plan} yearly={false} />
        <Price plan={plan} yearly />
        <p className={`mt-2 text-[13.5px] ${dark ? "text-[rgb(246_240_228/0.65)]" : "text-ink-faint"}`}>
          {plan.unit}
          {plan.monthly !== null && plan.monthly > 0 && (
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
      <a
        href={ask}
        className={`${btn} mt-8 h-12 px-5 text-[15px] ${dark ? "bg-amber text-white hover:brightness-110" : "border border-line/20 hover:border-line/40 hover:bg-surface-2"}`}
      >
        {plan.monthly === null ? "Talk to us" : plan.monthly === 0 ? "Ask for an invite" : `Ask about ${plan.name}`}
      </a>
    </section>
  );
}

export default function PricingPage() {
  return (
    <SitePage current="/pricing">
      <PageHead
        title="Priced by the size of your crew"
        lead="Every plan has every feature. Plans differ in how many people make your videos, how many teams you run and how quickly we help."
      />

      <div className="billing max-w-6xl mx-auto px-4 sm:px-6">
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

        <div className="mt-8 grid gap-5 lg:grid-cols-3 items-stretch">
          {PLANS.map((p) => (
            <PlanColumn key={p.id} plan={p} />
          ))}
        </div>
      </div>

      <div className="mt-20 sm:mt-24 space-y-20 sm:space-y-24">
        <SiteSection id="every" title="In every plan">
          <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2 text-[15.5px]">
            {EVERY_PLAN.map((x) => (
              <li key={x} className="flex gap-2.5 border-t border-line/15 pt-4">
                <CheckIcon className="w-4 h-4 mt-1 flex-shrink-0 text-amber" />
                <span className="text-ink-soft">{x}</span>
              </li>
            ))}
          </ul>
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
        Prices in US dollars, before any sales tax. See what&rsquo;s in{" "}
        <Link href="/features" className={textLink}>
          every feature
        </Link>{" "}
        and{" "}
        <Link href="/platforms" className={textLink}>
          how {APP_NAME} uses your accounts
        </Link>
        .
      </p>
    </SitePage>
  );
}
