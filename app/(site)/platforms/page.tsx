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
    `How ${APP_NAME} posts to YouTube, TikTok, Instagram and Facebook from your team's own accounts: what it asks each platform for, and why.`
  ),
  robots: { index: true, follow: true },
};

/**
 * Platforms (1.33.0): what ClipTroop does with each platform, every permission it asks for and what for, and how to
 * take access back. The content is lib/site/platforms.ts (the permissions there are the ones the app asks for).
 */
export default function PlatformsPage() {
  return (
    <SitePage current="/platforms">
      <PageHead
        title="Your accounts, your posts"
        lead={`${APP_NAME} posts your team's approved shorts to YouTube, TikTok, Instagram and Facebook from accounts your team connects, and reads their numbers back for Analytics. This page says exactly what it asks each platform for, and why.`}
      />

      {/* At a glance: a table on a computer; on a phone, where it wouldn't fit, the four platforms to jump to. */}
      <section aria-labelledby="glance" className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 id="glance" className="sr-only">At a glance</h2>
        <ul className="md:hidden flex flex-wrap gap-2">
          {SITE_PLATFORMS.map((p) => (
            <li key={p.id}>
              <a href={`#${p.id}`} className="inline-flex items-center gap-2 rounded-xl border border-line/15 px-3.5 h-10 text-[14px] hover:border-line/40 hover:bg-surface">
                <PlatformIcon platform={p.id} className="w-4 h-4" />
                {p.name}
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="text-[13px] text-ink-faint">
                <th className="pb-3 pr-6 font-semibold w-[22%]">Platform</th>
                <th className="pb-3 pr-6 font-semibold">You connect</th>
                <th className="pb-3 pr-6 font-semibold">{APP_NAME} posts</th>
                <th className="pb-3 font-semibold">Permissions</th>
              </tr>
            </thead>
            <tbody>
              {SITE_PLATFORMS.map((p) => (
                <tr key={p.id} className="border-t border-line/10 align-top">
                  <td className="py-4 pr-6">
                    <a href={`#${p.id}`} className="inline-flex items-center gap-2.5 font-semibold hover:text-amber">
                      <PlatformIcon platform={p.id} className="w-5 h-5" />
                      {p.name}
                    </a>
                  </td>
                  <td className="py-4 pr-6 text-ink-soft">{p.account}</td>
                  <td className="py-4 pr-6 text-ink-soft">{p.id === "youtube" ? "Shorts" : p.id === "facebook" ? "Reels on your Page" : p.id === "instagram" ? "Reels" : "Videos, by Direct Post"}</td>
                  <td className="py-4 text-ink-soft tabular-nums">
                    {p.permissions.filter((x) => !x.analytics).length} to post
                    {p.permissions.some((x) => x.analytics) && `, ${p.permissions.filter((x) => x.analytics).length} more for Analytics`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
