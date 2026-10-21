"use client";

import { Suspense, use, useMemo } from "react";
import Link from "next/link";
import { Segmented } from "@/components/ui/segmented";
import { generateIdeas } from "../../lib/ideas";
import { formatName } from "../../lib/formats";
import type { IdeasData, MiniVideo } from "../../lib/types";
import type { HomeData, Period } from "../../lib/view";
import { EmptyNote, heat, SectionHead, Thumb, Trend } from "../bits";
import { Lift } from "../charts";
import { useOutliers, useOutliersNav } from "../context";
import { formatColor, IdeaCard, leadSources, useIdeaMarks } from "../idea-card";
import { useShellNav } from "../shell-nav";
import { FeatureCard, Shelf, ShortCard, useVisible, VideoCard, VideoRow } from "../video-card";
import { multText } from "../../lib/scores";

/*
 * For you (1.27.0): the first thing on the page. The biggest outliers in the
 * niche lately (the headline one large), what's taking off right now, a few
 * ideas made for you, the formats and keywords that are winning, small
 * channels with big hits, and what your tracked channels just posted.
 */

const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

const SEE_ALL = "inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft hover:text-ink rounded-md px-2 h-8 hover:bg-surface-2";

export function HomeTab({ data }: { data: HomeData }) {
  const ctx = useOutliers();
  const nav = useShellNav();
  const short = ctx.kind === "short";
  // The team's hidden channels leave at once (they're gone on the next read too).
  const best = useVisible(data.best.rows);
  const rising = useVisible(data.rising);
  const small = useVisible(data.small);
  const [lead, ...rest] = best;
  // The stretch shown: the one picked, or a longer one when it had too little.
  const shownPeriod = data.widened ?? data.period;
  const days = shownPeriod === "week" ? 7 : shownPeriod === "year" ? 365 : 30;
  const stretch = (p: Period) => (p === "week" ? "in the last 7 days" : p === "month" ? "in the last 30 days" : "in the last year");
  const nothing = !best.length && !rising.length;

  if (nothing)
    return (
      <EmptyNote
        title={ctx.niche?.phase === "new" || ctx.niche?.counts?.videos === 0 ? "Collecting the first videos…" : "No outliers here yet"}
        action={
          <Link href={nav.href({ tab: "search" })} className="text-[13px] font-semibold text-amber hover:underline">
            Search everything collected
          </Link>
        }
      >
        {ctx.niche?.phase === "new" ? "A new niche fills in within a minute or two. This page updates by itself." : "Try another niche or kind, or a longer stretch of time."}
      </EmptyNote>
    );

  return (
    <div className="space-y-10">
      <section>
        <SectionHead
          title="The biggest outliers"
          sub={
            data.widened
              ? `Not much ${data.period === "week" ? "this week" : "this month"}, so these are ${short ? "Shorts" : "long videos"} posted ${stretch(data.widened)}`
              : `${ctx.niche ? ctx.niche.name : "Every niche"} · ${short ? "Shorts" : "long videos"} posted ${stretch(data.period)}`
          }
          right={
            <>
              <Segmented ariaLabel="How far back" size="sm" value={data.period} onChange={(p) => nav.go({ params: { period: p === "month" ? null : p } }, { replace: true })} options={PERIODS} className="hidden sm:inline-flex" />
              <Link href={nav.href({ tab: "search", params: { days, min: 1.5, sort: null } })} className={SEE_ALL}>
                See all
              </Link>
            </>
          }
        />
        <Segmented ariaLabel="How far back" size="sm" value={data.period} onChange={(p) => nav.go({ params: { period: p === "month" ? null : p } }, { replace: true })} options={PERIODS} className="sm:hidden mb-3" />
        {lead ? (
          short ? (
            // Whole rows at every width: the headline Short takes 2 × 2 places.
            <div className="grid gap-x-3 gap-y-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              <div className="col-span-2 sm:row-span-2">
                <FeatureCard v={lead} />
              </div>
              {rest.slice(0, 24).map((v, i) => (
                <div key={v.id} className={`min-w-0 ${i >= 20 ? "hidden 2xl:block" : i >= 16 ? "hidden xl:block" : i >= 12 ? "hidden lg:block" : i >= 8 ? "hidden md:block" : i >= 6 ? "hidden sm:block" : ""}`}>
                  <ShortCard v={v} eager={i < 4} />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-x-4 gap-y-6 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                <div className="min-[480px]:col-span-2 lg:row-span-2">
                  <FeatureCard v={lead} />
                </div>
                {rest.slice(0, 16).map((v, i) => (
                  <div key={v.id} className={`min-w-0 ${i >= 12 ? "hidden 2xl:block" : i >= 8 ? "hidden xl:block" : i >= 6 ? "hidden lg:block" : "hidden min-[480px]:block"}`}>
                    <VideoCard v={v} eager={i < 4} />
                  </div>
                ))}
              </div>
              {/* Phones: the rest in a row to swipe through, not a long column. */}
              <div className="relative min-[480px]:hidden -mx-4 px-4 mt-5 overflow-x-auto no-scrollbar snap-x snap-mandatory">
                <ul className="flex gap-3 pb-1">
                  {rest.slice(0, 16).map((v) => (
                    <li key={v.id} className="snap-start flex-shrink-0 w-[74vw] max-w-[300px]">
                      <VideoCard v={v} />
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )
        ) : (
          <EmptyNote title="Nothing in this stretch yet">Try a longer stretch of time.</EmptyNote>
        )}
      </section>

      <div className="grid gap-10 lg:gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <SectionHead
            title="Taking off right now"
            sub="Posted this week and already beating their channel"
            right={
              <Link href={nav.href({ tab: "search", params: { days: 7, sort: "projected" } })} className={SEE_ALL}>
                See all
              </Link>
            }
          />
          {rising.length ? (
            <ul className="divide-y divide-line/[0.07] rounded-2xl border border-line/10 bg-surface px-3 sm:px-4">
              {rising.slice(0, 8).map((v, i) => (
                <VideoRow key={v.id} v={v} className={i >= 5 ? "hidden md:flex" : ""} />
              ))}
            </ul>
          ) : (
            <EmptyNote title="Nothing new is taking off yet">Videos from this week show up here as their views come in.</EmptyNote>
          )}
        </section>
        <section className="min-w-0">
          <SectionHead
            title="Ideas for you"
            sub="Winning formats with your niche's topics. A new set every day."
            right={
              <Link href={nav.href({ tab: "ideas" })} className={SEE_ALL}>
                More ideas
              </Link>
            }
          />
          <Suspense fallback={<IdeasSkeleton />}>
            <HomeIdeas promise={data.ideas} seed={data.seed} year={data.year} />
          </Suspense>
        </section>
      </div>

      <div className="grid gap-10 lg:gap-8 md:grid-cols-2 xl:grid-cols-3">
        <section className="min-w-0">
          <SectionHead
            title="Formats that win here"
            right={
              <Link href={nav.href({ tab: "formats" })} className={SEE_ALL}>
                All formats
              </Link>
            }
          />
          {data.formats.length ? (
            <ul className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/[0.07]">
              {data.formats.slice(0, 6).map((f) => (
                <li key={f.id}>
                  <Link href={nav.href({ tab: "formats", params: { fmt: f.id } })} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                    <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: formatColor(f.id) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold truncate">{formatName(f.id)}</span>
                      <span className="block text-[11.5px] text-ink-faint">
                        {f.n} videos · {Math.round(f.hit * 100)}% hit 3×
                      </span>
                    </span>
                    <Trend mom={f.mom} n={f.recent + f.prev} />
                    <span className="text-[13px] w-12 text-right" title="Their median × usual, against the niche's">
                      <Lift lift={f.lift} n={f.n} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote title="Formats show up once there are enough videos" />
          )}
        </section>

        <section className="min-w-0">
          <SectionHead
            title="Keywords on the rise"
            right={
              <Link href={nav.href({ tab: "keywords" })} className={SEE_ALL}>
                All keywords
              </Link>
            }
          />
          {data.keywords.length ? (
            <div className="rounded-2xl border border-line/10 bg-surface p-4">
              <ul className="flex flex-wrap gap-2">
                {data.keywords.slice(0, 16).map((k) => {
                  const hot = k.lift >= 1.3;
                  return (
                    <li key={k.key}>
                      <Link
                        href={nav.href({ tab: "keywords", params: { kw: k.key } })}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[13px] font-semibold border transition-colors ${hot ? "border-green/30 bg-green/[0.07] hover:bg-green/[0.12]" : "border-line/15 hover:border-line/35"}`}
                        title={`${k.n} videos · median ${multText(k.med)} · ${k.mom >= 1.6 ? "rising" : "steady"}`}
                      >
                        {k.k}
                        {k.mom >= 1.6 && (
                          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-green" aria-label="rising">
                            <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
                          </svg>
                        )}
                        <span className={`text-[11.5px] font-display tabular-nums ${hot ? "text-green" : "text-ink-faint"}`}>{multText(k.lift)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11.5px] text-ink-faint">The number: how videos with the word do against the niche&rsquo;s usual. The arrow: more videos use it lately.</p>
            </div>
          ) : (
            <EmptyNote title="Keywords show up once there are enough videos" />
          )}
        </section>

        <section className="min-w-0 md:col-span-2 xl:col-span-1">
          <SectionHead
            title="Small channels, big hits"
            sub="Under 100K subscribers, 4× their usual or more"
            right={
              <Link href={nav.href({ tab: "search", params: { smax: 100000, min: 4, days: 120 } })} className={SEE_ALL}>
                See all
              </Link>
            }
          />
          {small.length ? (
            <ul className="divide-y divide-line/[0.07] rounded-2xl border border-line/10 bg-surface px-3 sm:px-4">
              {small.slice(0, 5).map((v) => (
                <VideoRow key={v.id} v={v} compact />
              ))}
            </ul>
          ) : (
            <EmptyNote title="None lately">Small channels with a big hit show up here.</EmptyNote>
          )}
        </section>
      </div>

      <section>
        <SectionHead
          title="From your tracked channels"
          sub="Their latest uploads (alerts go out when one takes off)"
          right={
            ctx.tracked.size ? (
              <Link href={nav.href({ tab: "search", params: { scope: "tracked", sort: "newest" } })} className={SEE_ALL}>
                See all
              </Link>
            ) : undefined
          }
        />
        {data.tracked.length ? (
          <Shelf rows={data.tracked} kind={short ? "short" : "long"} />
        ) : (
          <EmptyNote
            title={ctx.tracked.size ? "No new uploads from them lately" : "No tracked channels yet"}
            action={
              ctx.canManage && !ctx.tracked.size ? (
                <Link href={nav.href({ tab: "channels" })} className="inline-flex items-center rounded-lg bg-amber text-white px-3.5 h-9 text-[13px] font-semibold hover:brightness-110">
                  Pick channels to track
                </Link>
              ) : undefined
            }
          >
            {ctx.tracked.size ? "Their new videos show up here." : "Track the channels you watch most: their new videos show up here and you hear when one takes off."}
          </EmptyNote>
        )}
      </section>
    </div>
  );
}

function IdeasSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-line/10 bg-surface p-4 space-y-2.5">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-5 w-full rounded" />
          <div className="skeleton h-5 w-2/3 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-9 w-36 rounded-lg mt-3" />
        </div>
      ))}
    </div>
  );
}

function HomeIdeas({ promise, seed, year }: { promise: Promise<IdeasData>; seed: number; year: number }) {
  const data = use(promise);
  const ctx = useOutliers();
  const marks = useIdeaMarks(data.saved, data.dismissed);
  const short = ctx.kind === "short";
  const ideas = useMemo(
    () =>
      generateIdeas({
        seed,
        year,
        count: 8,
        kind: short ? "short" : "long",
        scope: "mixed",
        niche: ctx.niche ? { name: ctx.niche.name, keywords: ctx.niche.keywords } : null,
        local: data.local,
        cross: data.cross,
        mine: data.mine,
        dismissed: new Set(data.dismissed),
        titleOf: (id) => data.examples[id]?.title,
      }),
    [seed, year, short, ctx.niche, data]
  );
  const shown = ideas.filter((i) => !marks.hidden.has(i.key)).slice(0, 4);
  const leads = leadSources(shown, data.examples);
  // As tall as "Taking off right now" beside it: 2 in one column, 4 where there are two columns.
  const extra = "hidden md:flex lg:hidden 2xl:flex";
  if (!shown.length)
    return (
      <EmptyNote title="Ideas need a little more data">
        They&rsquo;re made from the niche&rsquo;s winning formats and topics. Check back once more videos are in.
      </EmptyNote>
    );
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
      {shown.map((idea, i) => (
        <div key={idea.key} className={`min-w-0 flex-col ${i >= 2 ? extra : "flex"}`}>
          <IdeaCard idea={idea} index={i} teamId={ctx.teamId} examples={data.examples} nicheName={ctx.niche?.name ?? null} kind={short ? "short" : "long"} savedId={marks.savedMap.get(idea.key) ?? null} onSaved={marks.markSaved} onHide={marks.hide} lead={leads.get(idea.key) ?? null} />
        </div>
      ))}
    </div>
  );
}

/** A format's best examples as small thumbnails (Formats, For you). */
export function ExampleThumbs({ ids, examples, max = 3 }: { ids: string[]; examples: Record<string, MiniVideo>; max?: number }) {
  const { openVideo } = useOutliersNav();
  const list = ids.map((id) => examples[id]).filter((x): x is MiniVideo => !!x).slice(0, max);
  if (!list.length) return null;
  return (
    <div className="flex gap-1.5">
      {list.map((e) => (
        <button key={e.id} type="button" onClick={() => openVideo(e.id)} title={`${e.title} · ${multText(e.score)}`} className={`relative rounded-md overflow-hidden bg-surface-2 ring-1 ring-line/10 hover:ring-line/40 flex-shrink-0 ${e.kind === "short" ? "w-[38px] aspect-[9/16]" : "w-[68px] aspect-video"}`}>
          <Thumb id={e.id} kind={e.kind} sizes="70px" tint={e.tint} />
          {e.score !== null && (
            <span className="absolute bottom-0.5 left-0.5 rounded-[3px] px-1 text-[10px] font-display font-semibold leading-[14px] text-white" style={{ background: e.score >= 2 ? heat(e.score).solid : "rgb(0 0 0 / 0.7)" }}>
              {multText(e.score)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
