import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { publicMetadata } from "@/lib/public-pages";
import { DEPTS, FEATURES, featuresIn } from "@/lib/site/features";
import { Play } from "@/components/landing/landing-client";
import { VISUALS } from "@/components/site/visuals";
import { PageHead, SiteCta, SitePage, btnMain, btnQuiet } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  ...publicMetadata(
    "/features",
    "Features",
    `Everything ${APP_NAME} does, in the order a video is made: planning, scripts, filming and editing, review, thumbnails, posting to four platforms, analytics, objectives, the media kit and research.`
  ),
  robots: { index: true, follow: true },
};

/*
 * Features (1.33.0; 1.45.0: an index of every feature's own page). The departments in the order a video is made, each
 * with its demo beside it on a computer; every feature a line and a link to its page (/features/<slug>).
 */
export default function FeaturesPage() {
  return (
    <SitePage current="/features">
      <PageHead
        title="The whole production, in one place"
        lead={`From the first idea to the numbers a month after posting: ${FEATURES.length} parts of ${APP_NAME}, in the order a video is made. Every plan has all of them.`}
      >
        <Link href="/signup" className={btnMain}>
          Create an account
        </Link>
        <Link href="/pricing" className={btnQuiet}>
          See pricing
        </Link>
      </PageHead>

      <nav aria-label="Departments" className="max-w-6xl mx-auto px-4 sm:px-6">
        <ol className="flex flex-wrap gap-2">
          {DEPTS.map((d) => (
            <li key={d.id}>
              <a href={`#${d.id}`} className="inline-flex items-center rounded-xl border border-line/15 px-3.5 h-10 text-[14px] hover:border-line/40 hover:bg-surface">
                {d.name}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-16 sm:mt-24 space-y-24 sm:space-y-32">
        {DEPTS.map((d, i) => {
          const list = featuresIn(d.id);
          const Visual = VISUALS[list[0].visual];
          return (
            <section key={d.id} id={d.id} aria-labelledby={`${d.id}-title`} className="scroll-mt-24 grid gap-8 lg:gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-9 h-[7px] rounded-[3px] ld-stripes" aria-hidden />
                  <span className="ld-scene-mark text-[17px] text-amber">Reel {i + 1}</span>
                </div>
                <h2 id={`${d.id}-title`} className="font-display text-[34px] sm:text-[44px] font-semibold leading-[1.03] tracking-[-0.02em]">
                  {d.name}
                </h2>
                <p className="mt-3 text-[16.5px] leading-relaxed text-ink-soft max-w-[28rem]">{d.line}</p>
                <Play className="mt-8 hidden lg:block">
                  <div aria-hidden>
                    <Visual />
                  </div>
                </Play>
              </div>
              <ul className="border-b border-line/15">
                {list.map((f) => (
                  <li key={f.slug} className="border-t border-line/15">
                    <Link href={`/features/${f.slug}`} className="group grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 py-6 items-baseline">
                      <span className="font-display text-[24px] sm:text-[28px] font-semibold leading-tight group-hover:text-amber transition-colors">{f.name}</span>
                      <span className="ld-scene-mark text-[15px] text-ink-faint whitespace-nowrap">Scene {FEATURES.indexOf(f) + 1}</span>
                      <span className="col-span-2 text-[16px] leading-relaxed text-ink-soft max-w-[36rem]">{f.line}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <SiteCta
        text={`Every plan has every feature, nothing locked. Create an account, name your team and choose its plan; your team opens as soon as it's on.`}
        primary={{ href: "/signup", label: "Create an account" }}
      />
    </SitePage>
  );
}
