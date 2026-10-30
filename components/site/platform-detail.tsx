import Link from "next/link";
import { Fragment } from "react";
import { APP_NAME } from "@/lib/brand";
import type { SitePlatform } from "@/lib/site/platforms";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { textLink } from "./site-chrome";

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
 * One platform in full (1.33.0 on Platforms; 1.45.0 shared with its own page, /platforms/<id>): what you connect,
 * what ClipTroop posts and reads, every permission it asks for with what it's for, and taking access back.
 * `own`: on its own page (its name is the page's title there, so a smaller heading here and no link to itself).
 */
export function PlatformDetail({ p, own = false }: { p: SitePlatform; own?: boolean }) {
  const H = own ? "h3" : "h2";
  return (
    <section id={p.id} aria-labelledby={`${p.id}-name`} className="scroll-mt-24 grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
      <div>
        {own ? (
          <h2 id={`${p.id}-name`} className="font-display text-[30px] sm:text-[38px] font-semibold leading-[1.05] tracking-[-0.02em]">
            What {APP_NAME} does with it
          </h2>
        ) : (
          <H id={`${p.id}-name`} className="flex items-center gap-3 font-display text-[34px] sm:text-[42px] font-semibold leading-none tracking-[-0.02em]">
            <PlatformIcon platform={p.id} className="w-8 h-8 flex-shrink-0" />
            {p.name}
          </H>
        )}
        <p className="mt-5 text-[16px] leading-relaxed text-ink-soft">{p.account}</p>
        <h3 className="mt-8 text-[15px] font-semibold">What {APP_NAME} posts</h3>
        <ul className="mt-3 space-y-3 text-[15.5px] leading-relaxed text-ink-soft list-disc pl-5 marker:text-amber">
          {p.posts.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <h3 className="mt-8 text-[15px] font-semibold">What it reads</h3>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-soft">{p.reads}</p>
        {!own && (
          <p className="mt-6 text-[15px]">
            <Link href={`/platforms/${p.id}`} className={textLink}>
              {p.name} in full
            </Link>
          </p>
        )}
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
  );
}
