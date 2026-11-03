import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { PLATFORM_PROMISES, SITE_PLATFORMS } from "@/lib/site/platforms";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { PageHead, SiteCta, SitePage, textLink } from "@/components/site/site-chrome";
import { PlatformDetail } from "@/components/site/platform-detail";

export const metadata: Metadata = {
  ...publicMetadata(
    "/platforms",
    "Platforms",
    `How ${APP_NAME} posts to YouTube, TikTok, Instagram and Facebook from your team's own accounts: what it does on each, and how to take access back.`
  ),
  robots: { index: true, follow: true },
};

/**
 * Platforms (1.33.0): what ClipTroop does with each platform and how to take access back; each has its own page too
 * (1.45.0). The content is lib/site/platforms.ts. 1.46.0: the access each platform grants isn't listed (confidential).
 */
export default function PlatformsPage() {
  return (
    <SitePage current="/platforms">
      <PageHead
        title="Your accounts, your posts"
        lead={`${APP_NAME} posts your team's approved shorts to YouTube, TikTok, Instagram and Facebook from accounts your team connects, and reads their numbers back for Analytics. Here is what it does on each one, and how to take access back.`}
      />

      {/* The four, each to its own page. */}
      <section aria-labelledby="glance" className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 id="glance" className="sr-only">The platforms</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SITE_PLATFORMS.map((p, i) => (
            <li key={p.id} data-reveal style={{ ["--i" as string]: i }}>
              <Link href={`/platforms/${p.id}`} className="site-card group flex h-full flex-col rounded-[22px] border border-line/15 bg-surface p-5">
                <span className="flex items-center gap-3">
                  <PlatformIcon platform={p.id} className="w-8 h-8" />
                  <span className="font-display text-[23px] font-semibold group-hover:text-amber transition-colors">{p.name}</span>
                </span>
                <span className="mt-4 text-[14.5px] leading-relaxed text-ink-soft flex-1">{p.account}</span>
                <span className="mt-4 text-[14px] font-semibold text-ink">
                  {p.id === "youtube" ? "Shorts" : p.id === "facebook" ? "Reels on your Page" : p.id === "instagram" ? "Reels, shared to the feed" : "Videos, by Direct Post"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* What holds everywhere: the page's one dark band. */}
      <section aria-labelledby="promises" className="mt-20 sm:mt-28 bg-[rgb(43_33_24)] text-[rgb(246_240_228)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <span className="block w-14 h-[7px] rounded-[3px] ld-stripes-light" aria-hidden />
          <h2 id="promises" className="mt-5 font-display text-[32px] sm:text-[44px] font-semibold leading-[1.04] tracking-[-0.02em] max-w-[18ch]">
            The same on every platform
          </h2>
          <dl className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {PLATFORM_PROMISES.map((x) => (
              <div key={x.title}>
                <dt className="font-display text-[21px] font-semibold">{x.title}</dt>
                <dd className="mt-2 text-[15.5px] leading-relaxed text-[rgb(246_240_228/0.75)]">{x.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Each platform. */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-20 sm:mt-28 space-y-20 sm:space-y-28">
        {SITE_PLATFORMS.map((p) => (
          <PlatformDetail key={p.id} p={p} />
        ))}
      </div>

      <SiteCta
        title="Connect yours"
        text={`Your team's Master or Scheduler connects each account from Team → Connected accounts, in a window from the platform itself. ${APP_NAME} never sees your password.`}
      />
    </SitePage>
  );
}
