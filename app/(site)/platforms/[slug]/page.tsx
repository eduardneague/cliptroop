import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { PLATFORM_PROMISES, SITE_PLATFORMS } from "@/lib/site/platforms";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Play } from "@/components/landing/landing-client";
import { MeasureVignette, PostVignette } from "@/components/landing/vignettes";
import { PlatformDetail } from "@/components/site/platform-detail";
import { FactList, SiteCta, SitePage, btnMain, btnQuiet, textLink } from "@/components/site/site-chrome";

/*
 * One platform, one page (1.45.0; TikTok first): what you connect, what ClipTroop posts there and how, what it reads
 * back, every permission with what it's for, and the promises that hold everywhere. The words are lib/site/platforms.ts,
 * the same ones as on Platforms.
 */

export const dynamicParams = false;
export function generateStaticParams() {
  return SITE_PLATFORMS.map((p) => ({ slug: p.id }));
}

const platformOf = (slug: string) => SITE_PLATFORMS.find((p) => p.id === slug) ?? null;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = platformOf((await params).slug);
  if (!p) return {};
  return {
    ...publicMetadata(`/platforms/${p.id}`, `${APP_NAME} and ${p.name}`, `How ${APP_NAME} posts your team's approved shorts to ${p.name}, what it reads back for Analytics, and every permission it asks for.`),
    robots: { index: true, follow: true },
  };
}

export default async function PlatformPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = platformOf((await params).slug);
  if (!p) notFound();
  const others = SITE_PLATFORMS.filter((x) => x.id !== p.id);
  return (
    <SitePage current="/platforms">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16">
        <nav aria-label="Breadcrumb" className="text-[14px] text-ink-soft">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li>
              <Link href="/platforms" className="hover:text-ink underline-offset-2 hover:underline">
                Platforms
              </Link>
            </li>
            <li aria-hidden className="text-ink-faint">
              /
            </li>
            <li aria-current="page" className="text-ink font-semibold">
              {p.name}
            </li>
          </ol>
        </nav>
        <header className="mt-8 grid gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-center">
          <div>
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-line/15 bg-surface">
              <PlatformIcon platform={p.id} className="w-7 h-7" />
            </span>
            <h1 className="mt-6 font-display font-semibold tracking-[-0.025em] leading-[1.02] text-[40px] sm:text-[56px] max-w-[16ch] text-balance">
              Posting to {p.name}, from your team&rsquo;s own account
            </h1>
            <p className="mt-5 text-[17px] sm:text-[18px] leading-relaxed text-ink-soft max-w-[38rem]">
              {APP_NAME} posts the shorts your team approved to {p.name} at the time you chose, shows every step until it&rsquo;s live, and reads the account&rsquo;s numbers back
              for Analytics. Here is exactly what it asks {p.name} for, and why.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className={btnMain}>
                Create an account
              </Link>
              <Link href="/features/posting" className={btnQuiet}>
                How posting works
              </Link>
            </div>
          </div>
          <Play>
            <div aria-hidden>
              <PostVignette />
            </div>
          </Play>
        </header>

        <div className="mt-20 sm:mt-28">
          <PlatformDetail p={p} own />
        </div>

        <section aria-labelledby="promises-title" className="mt-20 sm:mt-28">
          <h2 id="promises-title" className="font-display text-[30px] sm:text-[38px] font-semibold leading-[1.05] tracking-[-0.02em]">
            What holds on every platform
          </h2>
          <div className="mt-8">
            <FactList columns={2} items={PLATFORM_PROMISES.map((x) => ({ name: x.title, text: x.text }))} />
          </div>
        </section>

        <section aria-labelledby="numbers-title" className="mt-20 sm:mt-28 grid gap-10 lg:gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center">
          <div>
            <h2 id="numbers-title" className="font-display text-[30px] sm:text-[38px] font-semibold leading-[1.05] tracking-[-0.02em]">
              {p.name}&rsquo;s numbers, next to the rest
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-ink-soft max-w-[34rem]">
              With Analytics on, {p.name} sits beside your other platforms: one total or each on its own, every video counted, next to what your team made.
            </p>
            <p className="mt-5 text-[15px]">
              <Link href="/features/analytics" className={textLink}>
                More about Analytics
              </Link>
            </p>
          </div>
          <Play>
            <div aria-hidden>
              <MeasureVignette />
            </div>
          </Play>
        </section>

        <nav aria-label="The other platforms" className="mt-20 sm:mt-24 grid gap-3 sm:grid-cols-3">
          {others.map((o) => (
            <Link key={o.id} href={`/platforms/${o.id}`} className="group flex items-center gap-3 rounded-2xl border border-line/15 px-5 h-16 hover:border-line/35 hover:bg-surface">
              <PlatformIcon platform={o.id} className="w-6 h-6" />
              <span className="font-display text-[19px] font-semibold group-hover:text-amber">{o.name}</span>
            </Link>
          ))}
        </nav>
      </div>

      <SiteCta
        title={`Connect your ${p.name}`}
        text={`Your team's Master or Scheduler connects it from Team → Connected accounts, in a window from ${p.name} itself. ${APP_NAME} never sees your password.`}
      />
    </SitePage>
  );
}
