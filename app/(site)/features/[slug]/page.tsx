import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { FEATURES, deptOf, featureBySlug, neighbours } from "@/lib/site/features";
import { Play } from "@/components/landing/landing-client";
import { VISUALS } from "@/components/site/visuals";
import { FactList, SiteCta, SitePage, btnMain, btnQuiet, textLink } from "@/components/site/site-chrome";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/icons";

/*
 * One feature, one page (1.45.0): the owner, "describe every feature that is publicly available in separate pages".
 * Its words are lib/site/features.ts; its demo, components/site/visuals.tsx. Laid out like a call sheet: what it is,
 * who's on it, where it is in the app, then what it does part by part and the details, and the scenes either side of
 * it in the order a video is made.
 */

export const dynamicParams = false;
export function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const f = featureBySlug((await params).slug);
  if (!f) return {};
  return { ...publicMetadata(`/features/${f.slug}`, f.name, f.lead), robots: { index: true, follow: true } };
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const f = featureBySlug((await params).slug);
  if (!f) notFound();
  const dept = deptOf(f.dept);
  const n = FEATURES.indexOf(f) + 1;
  const { prev, next } = neighbours(f.slug);
  const Visual = VISUALS[f.visual];
  const related = f.related.map((s) => featureBySlug(s)).filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <SitePage current="/features">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16">
        <nav aria-label="Breadcrumb" className="text-[14px] text-ink-soft">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li>
              <Link href="/features" className="hover:text-ink underline-offset-2 hover:underline">
                Features
              </Link>
            </li>
            <li aria-hidden className="text-ink-faint">
              /
            </li>
            <li>
              <Link href={`/features#${dept.id}`} className="hover:text-ink underline-offset-2 hover:underline">
                {dept.name}
              </Link>
            </li>
            <li aria-hidden className="text-ink-faint">
              /
            </li>
            <li aria-current="page" className="text-ink font-semibold">
              {f.name}
            </li>
          </ol>
        </nav>

        <header className="mt-8 grid gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-end">
          <div>
            <span className="block w-14 h-[7px] rounded-[3px] ld-stripes" aria-hidden />
            <h1 className="mt-6 font-display font-semibold tracking-[-0.025em] leading-[1.02] text-[40px] sm:text-[56px] max-w-[18ch] text-balance">{f.title}</h1>
            <p className="mt-5 text-[17px] sm:text-[18px] leading-relaxed text-ink-soft max-w-[40rem]">{f.lead}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className={btnMain}>
                Create an account
              </Link>
              <Link href="/pricing" className={btnQuiet}>
                See pricing
              </Link>
            </div>
          </div>
          {/* The call sheet: who's on it, and where. */}
          <aside aria-label={`${f.name}, at a glance`} className="call-sheet bg-surface text-[14px]">
            <div className="px-5 py-3.5 flex items-baseline justify-between gap-3">
              <span className="font-display text-[19px] font-semibold">{f.name}</span>
              <span className="ld-scene-mark text-[15px] text-amber whitespace-nowrap">
                Scene {n} of {FEATURES.length}
              </span>
            </div>
            <div className="px-5 py-3.5 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2.5">
              <span className="text-ink-faint">Who</span>
              <span>
                {f.who.map((w) => (
                  <span key={w} className="block">
                    {w}
                  </span>
                ))}
              </span>
              <span className="text-ink-faint">Where</span>
              <span>{f.where}</span>
              <span className="text-ink-faint">Department</span>
              <span>
                <Link href={`/features#${dept.id}`} className={textLink}>
                  {dept.name}
                </Link>
              </span>
              <span className="text-ink-faint">Plans</span>
              <span>
                Every plan.{" "}
                <Link href="/pricing" className={textLink}>
                  Pricing
                </Link>
              </span>
            </div>
          </aside>
        </header>

        <Play className="mt-14 sm:mt-20">
          <div className="max-w-3xl mx-auto">
            <Visual />
          </div>
        </Play>

        <section aria-labelledby="what-title" className="mt-20 sm:mt-28">
          <h2 id="what-title" className="font-display text-[30px] sm:text-[38px] font-semibold leading-[1.05] tracking-[-0.02em]">
            What it does
          </h2>
          <div className="mt-8 divide-y divide-line/15 border-y border-line/15">
            {f.sections.map((s) => (
              <div key={s.title} className="py-7 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
                <h3 className="font-display text-[22px] sm:text-[24px] font-semibold leading-snug">{s.title}</h3>
                <p className="text-[16px] leading-relaxed text-ink-soft max-w-[40rem]">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="detail-title" className="mt-20 sm:mt-24">
          <h2 id="detail-title" className="font-display text-[30px] sm:text-[38px] font-semibold leading-[1.05] tracking-[-0.02em]">
            In detail
          </h2>
          <div className="mt-8">
            <FactList columns={3} items={f.details.map(([name, text]) => ({ name, text }))} />
          </div>
        </section>

        {related.length ? (
          <section aria-labelledby="with-title" className="mt-20 sm:mt-24">
            <h2 id="with-title" className="font-display text-[30px] sm:text-[38px] font-semibold leading-[1.05] tracking-[-0.02em]">
              Works with
            </h2>
            <ul className="mt-8 grid gap-x-10 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.slug} className="border-t border-line/15">
                  <Link href={`/features/${r.slug}`} className="group block py-4">
                    <span className="block font-semibold text-[16px] group-hover:text-amber">{r.name}</span>
                    <span className="mt-1 block text-[15px] leading-relaxed text-ink-soft">{r.line}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* The scenes either side, in the order a video is made. */}
        <nav aria-label="Other features" className="mt-20 sm:mt-24 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link href={`/features/${prev.slug}`} className="group rounded-2xl border border-line/15 px-5 py-4 hover:border-line/35 hover:bg-surface">
              <span className="flex items-center gap-1.5 text-[13px] text-ink-faint">
                <ArrowLeftIcon className="w-3.5 h-3.5" />
                Scene {n - 1}
              </span>
              <span className="mt-1 block font-display text-[20px] font-semibold group-hover:text-amber">{prev.name}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/features/${next.slug}`} className="group rounded-2xl border border-line/15 px-5 py-4 hover:border-line/35 hover:bg-surface sm:text-right">
              <span className="flex items-center gap-1.5 text-[13px] text-ink-faint sm:justify-end">
                Scene {n + 1}
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </span>
              <span className="mt-1 block font-display text-[20px] font-semibold group-hover:text-amber">{next.name}</span>
            </Link>
          ) : (
            <Link href="/pricing" className="group rounded-2xl border border-line/15 px-5 py-4 hover:border-line/35 hover:bg-surface sm:text-right">
              <span className="flex items-center gap-1.5 text-[13px] text-ink-faint sm:justify-end">
                That&rsquo;s every feature
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </span>
              <span className="mt-1 block font-display text-[20px] font-semibold group-hover:text-amber">Pricing</span>
            </Link>
          )}
        </nav>
      </div>

      <SiteCta
        title={`${f.name}, for your team`}
        text={`Every ${APP_NAME} plan has every feature, ${f.name} included. Create an account, name your team and choose its plan.`}
        primary={{ href: "/signup", label: "Create an account" }}
      />
    </SitePage>
  );
}
