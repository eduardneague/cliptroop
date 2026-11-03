import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { PUBLIC_CHANGELOG, KIND_LABEL, type ChangeKind, type Release } from "@/lib/changelog";
import { publicMetadata } from "@/lib/public-pages";
import { PageHead, SitePage, textLink } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  ...publicMetadata("/changelog", "Changelog", `Every ${APP_NAME} update, newest first: what's new, what's better and what's fixed.`),
  robots: { index: true, follow: true },
};

/*
 * The changelog (1.33.0): lib/changelog.ts, the same notes as the app's
 * What's new window, newest first. The latest LATEST updates; ?all=1 for
 * every one. A server page: the list never goes to the browser as code.
 */

const LATEST = 20;

const KIND_CLASS: Record<ChangeKind, string> = {
  new: "text-amber",
  better: "text-ink",
  fixed: "text-green",
};

/** "2026-10-25" → "October 25, 2026". */
function longDate(d: string) {
  const t = Date.parse(`${d}T12:00:00Z`);
  return Number.isNaN(t) ? d : new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** An address for one update: "#v1-32-5". */
const anchor = (v: string) => `v${v.replace(/\./g, "-")}`;

function Update({ r }: { r: Release }) {
  const id = anchor(r.version);
  return (
    <article id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 grid gap-3 md:gap-10 md:grid-cols-[11rem_minmax(0,1fr)] border-t border-line/15 pt-6 pb-10">
      <div>
        <a href={`#${id}`} className="font-display text-[22px] font-semibold tabular-nums hover:text-amber">
          {r.version}
        </a>
        {r.date && (
          <time dateTime={r.date} className="block mt-1 text-[13.5px] text-ink-faint">
            {longDate(r.date)}
          </time>
        )}
      </div>
      <div className="max-w-[44rem]">
        <h2 id={`${id}-title`} className="font-display text-[22px] sm:text-[24px] font-semibold leading-snug">
          {r.title}
        </h2>
        <ul className="mt-4 space-y-3">
          {r.changes.map((c, i) => (
            <li key={i} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 text-[15.5px] leading-relaxed">
              <span className={`text-[13.5px] font-semibold pt-[3px] ${KIND_CLASS[c.kind]}`}>{KIND_LABEL[c.kind]}</span>
              <span className="text-ink-soft">{c.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export default async function ChangelogPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const all = (await searchParams).all === "1";
  const shown = all ? PUBLIC_CHANGELOG : PUBLIC_CHANGELOG.slice(0, LATEST);
  return (
    <SitePage current="/changelog">
      <PageHead
        title="What’s new"
        lead={`Every update to ${APP_NAME}, newest first, in the same words as the app's own What's new. The app updates itself: there's nothing to install.`}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {shown.map((r) => (
          <Update key={r.version} r={r} />
        ))}
        <p className="border-t border-line/15 pt-6 text-[15px] text-ink-soft">
          {all ? (
            <>
              That&rsquo;s every update since {PUBLIC_CHANGELOG[PUBLIC_CHANGELOG.length - 1]?.version}.{" "}
              <Link href="/changelog" className={textLink}>
                Only the latest
              </Link>
            </>
          ) : (
            <>
              The latest {shown.length} of {PUBLIC_CHANGELOG.length} updates.{" "}
              <Link href="/changelog?all=1" className={textLink}>
                Every update
              </Link>
            </>
          )}
        </p>
      </div>
    </SitePage>
  );
}
