import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import type { SitePlatform } from "@/lib/site/platforms";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { textLink } from "./site-chrome";

/**
 * One platform in full (1.33.0 on Platforms; 1.45.0 shared with its own page, /platforms/<id>): what you connect, what
 * ClipTroop posts there and how, what it reads back, and taking access back. 1.46.0: no list of the access it's
 * granted (the owner keeps that confidential), and the two columns fill the page's width.
 * `own`: on its own page (its name is the page's title there, so no icon heading and no link to itself).
 */
export function PlatformDetail({ p, own = false }: { p: SitePlatform; own?: boolean }) {
  return (
    <section id={p.id} aria-labelledby={`${p.id}-name`} className="scroll-mt-24 grid gap-10 lg:grid-cols-12 lg:gap-12" data-reveal>
      <div className="lg:col-span-7">
        {own ? (
          <h2 id={`${p.id}-name`} className="font-display text-[30px] sm:text-[38px] font-semibold leading-[1.05] tracking-[-0.02em]">
            What {APP_NAME} does with it
          </h2>
        ) : (
          <h2 id={`${p.id}-name`} className="flex items-center gap-3 font-display text-[34px] sm:text-[42px] font-semibold leading-none tracking-[-0.02em]">
            <PlatformIcon platform={p.id} className="w-8 h-8 flex-shrink-0" />
            {p.name}
          </h2>
        )}
        <p className="mt-5 text-[16.5px] leading-relaxed text-ink-soft">{p.account}</p>
        <h3 className="mt-8 font-display text-[21px] font-semibold">What {APP_NAME} posts</h3>
        <ol className="mt-4 space-y-4">
          {p.posts.map((t, i) => (
            <li key={t} className="grid grid-cols-[2rem_1fr] gap-3 text-[15.5px] leading-relaxed text-ink-soft">
              <span className="ld-scene-mark text-[17px] text-amber tabular-nums">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="lg:col-span-5 space-y-5">
        <div className="rounded-[22px] border border-line/15 bg-surface p-6">
          <h3 className="font-display text-[21px] font-semibold">What it reads</h3>
          <p className="mt-3 text-[15.5px] leading-relaxed text-ink-soft">{p.reads}</p>
        </div>
        <div className="rounded-[22px] border border-line/15 bg-surface p-6">
          <h3 className="font-display text-[21px] font-semibold">Taking access back</h3>
          <p className="mt-3 text-[15.5px] leading-relaxed text-ink-soft">
            Disconnect it any time in Team → Connected accounts: {APP_NAME} deletes its sign-in at once. {p.revoke} See{" "}
            <Link href="/data-deletion" className={textLink}>
              deleting your data
            </Link>
            .
          </p>
        </div>
        {!own && (
          <p className="text-[15px] pl-1">
            <Link href={`/platforms/${p.id}`} className={textLink}>
              {p.name} in full
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
