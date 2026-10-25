import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { APP_NAME } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { PLATFORM_PROMISES, SITE_PLATFORMS } from "@/lib/site/platforms";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { PageHead, SiteCta, SitePage, textLink } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  ...publicMetadata(
    "/platforms",
    "Platforms",
    `How ${APP_NAME} posts to YouTube, TikTok, Instagram and Facebook from your team's own accounts: what it asks each platform for, and why.`
  ),
  robots: { index: true, follow: true },
};

/** A permission's name, allowed to wrap after its dots and underscores (never inside a word). */
function Scope({ name }: { name: string }) {
  const parts = name.split(/(?<=[._])/);
  return (
    <code className="font-mono text-[13px]">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </code>
  );
}

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
          <section key={p.id} id={p.id} aria-labelledby={`${p.id}-name`} className="scroll-mt-24 grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
            <div>
              <h2 id={`${p.id}-name`} className="flex items-center gap-3 font-display text-[34px] sm:text-[42px] font-semibold leading-none tracking-[-0.02em]">
                <PlatformIcon platform={p.id} className="w-8 h-8 flex-shrink-0" />
                {p.name}
              </h2>
              <p className="mt-5 text-[16px] leading-relaxed text-ink-soft">{p.account}</p>
              <h3 className="mt-8 text-[15px] font-semibold">What {APP_NAME} posts</h3>
              <ul className="mt-3 space-y-3 text-[15.5px] leading-relaxed text-ink-soft list-disc pl-5 marker:text-amber">
                {p.posts.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <h3 className="mt-8 text-[15px] font-semibold">What it reads</h3>
              <p className="mt-3 text-[15.5px] leading-relaxed text-ink-soft">{p.reads}</p>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold">The permissions it asks for</h3>
              <div className="mt-3 rounded-2xl border border-line/15 bg-surface overflow-hidden">
                <table className="w-full text-left text-[14.5px]">
                  <thead className="sr-only">
                    <tr>
                      <th>Permission</th>
                      <th>What it&rsquo;s for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.permissions.map((x) => (
                      <tr key={x.scope} className="border-t border-line/10 first:border-t-0 align-top">
                        <td className="px-4 sm:px-5 py-4 w-[42%]">
                          <Scope name={x.scope} />
                          {x.analytics && <span className="mt-1.5 block text-[12.5px] text-ink-faint">Only with Analytics on</span>}
                        </td>
                        <td className="px-4 sm:px-5 py-4 leading-relaxed text-ink-soft">{x.use}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-5 text-[14.5px] leading-relaxed text-ink-soft">
                Disconnect it any time in Team → Connected accounts. {p.revoke} See{" "}
                <Link href="/data-deletion" className={textLink}>
                  deleting your data
                </Link>
                .
              </p>
            </div>
          </section>
        ))}
      </div>

      <SiteCta
        title="Connect yours"
        text={`Your team's Master or Scheduler connects each account from Team → Connected accounts, in a window from the platform itself. ${APP_NAME} never sees your password.`}
      />
    </SitePage>
  );
}
