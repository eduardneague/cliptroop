"use client";

import { useCallback, useRef, useState } from "react";
import { loadVideoRevenueDays, type VideoRevenueDays } from "@/app/(dashboard)/analytics/actions";
import type { VideoKey, VideoPageData } from "../../lib/video";
import type { Num } from "../../lib/trend-math";
import { ChartCard, StatTile } from "../charts";
import { Breakdown, byCardHeight } from "../advanced/breakdowns";
import { compactNum, money, niceDay, seconds } from "../advanced/format";
import { DayBars, DayBarsChart, DayLine, KeyGrid, LiveCard, Milestones, NAME, pickKeys, RetentionCard, Siblings, TabbedChart, type ChartTab } from "./video-parts";

/*
 * A video's analytics in tabs, like YouTube Studio's (1.21.0): Overview
 * (the cards that switch its chart, realtime, its first days), Reach (how
 * people found it: impressions, click-through, sources, searches), Engagement
 * (how they watched and reacted: watch time, retention, likes), Audience
 * (who watched: subscribers or not, ages, countries, devices) and Revenue.
 * Everything next to the team's typical video of the same kind.
 */

export type VideoTab = "overview" | "reach" | "engagement" | "audience" | "revenue" | "advanced";

/** The tabs a video has: what its platform shares (and money for the people who see it). */
export function tabsFor(data: VideoPageData, revenueAllowed: boolean): VideoTab[] {
  const p = data.video.platform;
  const money = revenueAllowed && (p === "youtube" ? true : p === "facebook" && !!data.video.revenue);
  return [
    "overview",
    ...(p !== "tiktok" ? (["reach"] as const) : []),
    "engagement",
    ...(p === "youtube" ? (["audience"] as const) : []),
    ...(money ? (["revenue"] as const) : []),
    "advanced",
  ] as VideoTab[];
}
export const TAB_NAME: Record<VideoTab, string> = { overview: "Overview", reach: "Reach", engagement: "Engagement", audience: "Audience", revenue: "Revenue", advanced: "Advanced" };

// ---------------------------------------------------------------------------
// Its money per day (asked from YouTube when first needed)
// ---------------------------------------------------------------------------

export type RevenueState = { state: "idle" | "loading" | "ok" | "error"; data?: VideoRevenueDays; error?: string };
export function useVideoRevenue(teamId: string, id: string) {
  const [rev, setRev] = useState<RevenueState>({ state: "idle" });
  const started = useRef(false);
  // Asked once, when first needed (its chart card or the Revenue tab).
  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setRev({ state: "loading" });
    loadVideoRevenueDays(teamId, id)
      .then((x) => setRev(x.error !== undefined ? { state: "error", error: x.error } : { state: "ok", data: x.data }))
      .catch(() => setRev({ state: "error", error: "Couldn't load it. Check your connection and try again." }));
  }, [teamId, id]);
  return { rev, load };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function OverviewTab({ data, revenueAllowed, revenue, onSeeMore }: { data: VideoPageData; revenueAllowed: boolean; revenue: ReturnType<typeof useVideoRevenue>; onSeeMore: () => void }) {
  const d = data.daily;
  const v = data.video;
  const key = (k: string) => data.keys.find((x) => x.key === k) ?? null;
  const [active, setActive] = useState("views");
  const money = revenueAllowed && v.platform === "youtube" && !!key("revenue");
  const pick = (k: string) => {
    setActive(k);
    if (k === "revenue") revenue.load();
  };
  const word = v.platform === "facebook" ? "Plays" : "Views";
  const revByDay = new Map((revenue.rev.data?.days ?? []).map((x) => [x.day, x.revenue]));
  const tabs: ChartTab[] = d
    ? [
        { key: "views", label: word, total: v.views, key2: key("views"), values: d.views, format: (n) => compactNum(n) },
        ...(d.watchMinutes.some((x) => x !== null) || key("watch_hours")
          ? [{ key: "watch", label: "Watch time (hours)", total: key("watch_hours")?.value ?? null, key2: key("watch_hours"), values: d.watchMinutes.map((x) => (x === null ? null : x / 60)), format: (n: number | null) => (n === null ? "–" : n < 10 ? n.toFixed(1) : compactNum(n)) }]
          : []),
        ...(v.platform === "youtube"
          ? [{ key: "subs", label: "Subscribers", total: key("subs")?.value ?? null, key2: key("subs"), values: d.subs.some((x) => x !== null) ? d.subs : null, format: (n: number | null) => (n === null ? "–" : `${n > 0 ? "+" : ""}${compactNum(n)}`), note: "Its subscribers per day come with its details from YouTube." }]
          : []),
        ...(money
          ? [
              {
                key: "revenue",
                label: "Estimated revenue",
                total: key("revenue")?.value ?? null,
                key2: key("revenue"),
                values: revenue.rev.state === "ok" ? d.days.map((day) => revByDay.get(day) ?? null) : null,
                format: (n: number | null) => money2(n, revenue.rev.data?.currency ?? data.currency),
                loading: revenue.rev.state === "loading",
                note: revenue.rev.state === "error" ? revenue.rev.error : revenue.rev.data?.note ?? "No revenue per day yet.",
              },
            ]
          : []),
      ]
    : [];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
      <div className="space-y-5 min-w-0">
        {d ? (
          <TabbedChart
            days={d.days}
            tabs={tabs}
            active={active}
            onPick={pick}
            typicalViews={data.growth && data.growth.typicalFrom >= 3 ? data.growth.typical : null}
            postedDay={v.day ?? (v.publishedAt ? v.publishedAt.slice(0, 10) : null)}
            footer={
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={onSeeMore} className="inline-flex items-center gap-1 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold hover:border-line/30 hover:bg-surface-2">
                  See more
                  <span aria-hidden>→</span>
                </button>
                <span className="text-[12px] text-ink-faint">Every number and every day in Advanced</span>
              </div>
            }
          />
        ) : (
          <ChartCard title={`${word} per day`} sub="Since it was posted">
            <p className="py-14 px-4 text-center text-[13px] text-ink-faint">
              {v.platform === "youtube" ? "YouTube hasn't sent its day-by-day numbers yet." : `Its day-by-day ${word.toLowerCase()} start with the morning copies after it was posted (${NAME[v.platform]} only shares totals).`}
            </p>
          </ChartCard>
        )}
        <Milestones data={data} />
        <KeyGrid keys={pickKeys(data, ["impressions", "ctr", "avg_view", "avg_pct", "hold", "skip", "likes", "comments", "shares", "saves", "engagement", "subs"])} currency={data.currency} label="At a glance" cols="sm:grid-cols-3 xl:grid-cols-4" />
      </div>
      <aside className="space-y-5 min-w-0" aria-label="Now and elsewhere">
        <LiveCard data={data} />
        {data.siblings.length > 0 && <Siblings data={data} />}
        {v.hook && (
          <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
            <h2 className="text-[14.5px] font-semibold">The hook</h2>
            <p className="text-[12px] text-ink-faint mt-0.5">The opening, from its script in ClipTroop</p>
            <blockquote className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink leading-snug">{v.hook}</blockquote>
          </section>
        )}
      </aside>
    </div>
  );
}

const money2 = (n: number | null, currency: string) => (n === null ? "–" : money(n, currency, true));

// ---------------------------------------------------------------------------
// Reach: how people found it
// ---------------------------------------------------------------------------

const REACH_DIMS = ["traffic_source", "search_term", "external_site", "suggested_by", "playlist"];
const AUDIENCE_DIMS = ["subscribed", "age_gender", "country", "device", "os", "playback_location", "sharing"];

export function ReachTab({ data, fetching }: { data: VideoPageData; fetching: boolean }) {
  const v = data.video;
  const d = data.daily;
  const imp = v.impressions;
  const ctr = v.ctr;
  const fromImp = imp !== null && ctr !== null ? Math.round(imp * (ctr / 100)) : null;
  const list = (data.breakdowns?.list ?? []).filter((b) => REACH_DIMS.includes(b.id)).sort((a, b) => REACH_DIMS.indexOf(a.id) - REACH_DIMS.indexOf(b.id));
  const hasImp = !!d && d.impressions.some((x) => x !== null);
  return (
    <div className="space-y-5">
      <KeyGrid keys={pickKeys(data, ["impressions", "ctr", "views", "engaged_views", "reach", "shares"])} currency={data.currency} label="Reach" />
      {v.platform === "youtube" && imp !== null && (
        <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5" aria-label="From impressions to watch time">
          <h2 className="text-[14.5px] font-semibold">From impressions to watch time</h2>
          <p className="text-[12px] text-ink-faint mt-0.5">How its thumbnail turned into views, over the days YouTube&rsquo;s reach reports cover</p>
          <ol className="mt-4 grid gap-2 sm:grid-cols-4">
            {[
              { label: "Impressions", value: compactNum(imp), sub: "times its thumbnail was shown on YouTube" },
              { label: "Click-through rate", value: ctr === null ? "–" : `${ctr.toFixed(1)}%`, sub: "of impressions became a view" },
              { label: "Views from impressions", value: compactNum(fromImp), sub: v.views ? `${Math.min(100, Math.round(((fromImp ?? 0) / v.views) * 100))}% of all its views` : "" },
              { label: "Watch time", value: v.watchMinutes === null ? "–" : `${compactNum(v.watchMinutes / 60)} h`, sub: v.avgViewSeconds !== null ? `${seconds(v.avgViewSeconds)} a view on average` : "" },
            ].map((s, i) => (
              <li key={s.label} className="relative rounded-xl bg-surface-2/60 px-3.5 py-3 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{s.label}</span>
                <span className="block font-display text-[24px] font-semibold tabular-nums leading-tight mt-0.5">{s.value}</span>
                <span className="block text-[11.5px] text-ink-faint">{s.sub}</span>
                {i < 3 && (
                  <span aria-hidden className="hidden sm:flex absolute -right-2 top-1/2 -translate-y-1/2 z-[1] w-4 h-4 rounded-[4px] bg-surface border border-line/15 items-center justify-center text-[10px] text-ink-faint">
                    ›
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {d && (
        <div className="grid gap-5 lg:grid-cols-2">
          {hasImp ? (
            <>
              <DayBars title="Impressions" days={d.days} values={d.impressions} format={(n) => compactNum(n)} empty="No impressions per day yet." />
              <DayLine
                title="Impressions click-through rate"
                sub="YouTube's reach reports"
                days={d.days}
                values={d.ctr}
                weights={d.impressions}
                weightWord="impressions"
                format={(n) => (n === null ? "–" : `${n.toFixed(n < 10 ? 1 : 0)}%`)}
                empty="No click-through rate per day yet."
              />
            </>
          ) : (
            <DayBars title={v.platform === "facebook" ? "Plays" : "Views"} days={d.days} values={d.views} format={(n) => compactNum(n)} empty="No views per day yet." />
          )}
        </div>
      )}
      {v.platform === "youtube" ? (
        list.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {byCardHeight(list).map((b) => (
              <div key={b.id} className="min-w-0">
                <Breakdown b={b} compare={false} />
              </div>
            ))}
          </div>
        ) : (
          <Waiting fetching={fetching} what="where its views came from" />
        )
      ) : (
        <p className="text-[12.5px] text-ink-faint max-w-3xl">{NAME[v.platform]} doesn&rsquo;t share where a video&rsquo;s views came from with apps like ClipTroop.</p>
      )}
    </div>
  );
}

function Waiting({ fetching, what }: { fetching: boolean; what: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-line/20 px-4 py-8 text-center text-[13px] text-ink-soft">
      {fetching ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-amber/30 border-t-amber animate-spin" aria-hidden />
          Asking YouTube {what}…
        </span>
      ) : (
        `YouTube hasn't sent ${what} yet. It's asked when this page opens (at most every 10 minutes).`
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Engagement: how they watched and reacted
// ---------------------------------------------------------------------------

const metricKey = (data: VideoPageData, key: string, label: string): VideoKey | null => {
  const value = data.video.metrics[key];
  return typeof value === "number" ? { key, label, value, typical: null, format: "compact", rank: null } : null;
};

export function EngagementTab({ data }: { data: VideoPageData }) {
  const v = data.video;
  const d = data.daily;
  const dislikes = typeof v.metrics.dislikes === "number" ? v.metrics.dislikes : null;
  const keys = [
    ...pickKeys(data, ["watch_hours", "avg_view", "avg_pct", "hold", "skip", "likes"]),
    ...[metricKey(data, "dislikes", "Dislikes")].filter((x): x is VideoKey => !!x),
    ...pickKeys(data, ["like_rate", "comments", "shares", "saves", "reposts", "replays", "engagement"]),
    ...[metricKey(data, "playlist_adds", "Added to playlists"), metricKey(data, "card_clicks", "Card clicks")].filter((x): x is VideoKey => !!x),
  ];
  const likes = v.likes ?? 0;
  const both = likes + (dislikes ?? 0);
  return (
    <div className="space-y-5">
      <KeyGrid keys={keys} currency={data.currency} label="Engagement" />
      {v.platform === "youtube" && dislikes !== null && both > 0 && (
        <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5" aria-label="Likes and dislikes">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-[14.5px] font-semibold">Likes vs dislikes</h2>
            <span className="text-[12px] text-ink-faint">{Math.round((likes / both) * 100)}% liked it</span>
          </div>
          <div className="mt-3 flex h-3 rounded-[4px] overflow-hidden gap-[2px]" role="img" aria-label={`${likes} likes, ${dislikes} dislikes`}>
            <span style={{ width: `${(likes / both) * 100}%`, background: "rgb(var(--green))" }} />
            <span style={{ width: `${(dislikes / both) * 100}%`, background: "rgb(var(--coral))" }} />
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-ink-soft tabular-nums">
            <span>{compactNum(likes)} likes</span>
            <span>{compactNum(dislikes)} dislikes</span>
          </div>
        </section>
      )}
      {data.retention && <RetentionCard data={data} />}
      {d && d.source === "daily" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <DayBars title="Watch time (hours)" days={d.days} values={d.watchMinutes.map((x) => (x === null ? null : x / 60))} format={(n) => (n === null ? "–" : n < 10 ? n.toFixed(1) : compactNum(n))} empty="No watch time per day yet." />
          <DayLine title="Average view duration" sub="Per day" days={d.days} values={d.avgView} weights={d.views} weightWord="views" format={(n) => seconds(n)} empty="Its average view per day comes with its details from YouTube." />
          {d.likes.some((x) => x !== null) && <DayBars title="Likes" days={d.days} values={d.likes} format={(n) => compactNum(n)} color="rgb(var(--green))" empty="No likes per day yet." />}
          {d.comments.some((x) => x !== null) && <DayBars title="Comments" days={d.days} values={d.comments} format={(n) => compactNum(n)} color="rgb(var(--blue))" empty="No comments per day yet." />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audience: who watched
// ---------------------------------------------------------------------------

export function AudienceTab({ data, fetching }: { data: VideoPageData; fetching: boolean }) {
  const v = data.video;
  const d = data.daily;
  const list = (data.breakdowns?.list ?? []).filter((b) => AUDIENCE_DIMS.includes(b.id)).sort((a, b) => AUDIENCE_DIMS.indexOf(a.id) - AUDIENCE_DIMS.indexOf(b.id));
  const sub = list.find((b) => b.id === "subscribed");
  const subViews = sub?.rows.find((r) => r.key === "SUBSCRIBED")?.views ?? null;
  const allViews = sub ? sub.rows.reduce((t, r) => t + (r.views ?? 0), 0) : 0;
  const gained = v.subscribersGained;
  const lost = typeof v.metrics.subscribers_lost === "number" ? v.metrics.subscribers_lost : null;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile label="Subscribers gained" value={gained} compare={false} />
        <StatTile label="Subscribers lost" value={lost} compare={false} good="down" />
        <StatTile label="Net subscribers" value={gained === null ? null : gained - (lost ?? 0)} compare={false} format={(n) => (n === null ? "–" : `${n > 0 ? "+" : ""}${compactNum(n)}`)} />
        <StatTile label="Views from subscribers" value={subViews !== null && allViews ? (subViews / allViews) * 100 : null} compare={false} format={(n) => (n === null ? "–" : `${Math.round(n)}%`)} hint="the rest: people not subscribed" />
      </div>
      {d && d.subs.some((x) => x !== null) && <DayBars title="Subscribers" sub="Per day, gained minus lost" days={d.days} values={d.subs} format={(n) => compactNum(n)} color="rgb(var(--green))" empty="No subscribers per day yet." />}
      {list.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {byCardHeight(list).map((b) => (
            <div key={b.id} className="min-w-0">
              <Breakdown b={b} compare={false} />
            </div>
          ))}
        </div>
      ) : (
        <Waiting fetching={fetching} what="who watched it" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

export function RevenueTab({ data, revenue }: { data: VideoPageData; revenue: ReturnType<typeof useVideoRevenue> }) {
  const v = data.video;
  const r = v.revenue;
  const cur = data.currency;
  const m = (n: number | null) => (n === null ? "–" : money(n, cur, true));
  const st = revenue.rev;
  const days = st.data?.days ?? [];
  const dayVals: Num[] = days.map((x) => x.revenue);
  const best = [...days].sort((a, b) => b.revenue - a.revenue).slice(0, 7);
  const dcur = st.data?.currency ?? cur;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile className="ring-1 ring-amber/30" label={v.platform === "youtube" ? "Estimated revenue" : "Earnings"} value={r?.revenue ?? null} compare={false} format={m} hint="since it was posted" />
        <StatTile label="Per 1,000 views (RPM)" value={r?.rpm ?? null} compare={false} format={m} hint={data.typicalRpm !== null ? `typical ${m(data.typicalRpm)}` : undefined} />
        <StatTile label="CPM" value={r?.cpm ?? null} compare={false} format={m} hint="advertisers paid per 1,000 ads" />
        <StatTile label="Playback-based CPM" value={r?.playbackCpm ?? null} compare={false} format={m} />
        <StatTile label="Ad impressions" value={r?.adImpressions ?? null} compare={false} />
        <StatTile label="Monetized playbacks" value={r?.monetizedPlaybacks ?? null} compare={false} />
      </div>
      {v.platform === "youtube" && (
        <ChartCard title="Revenue per day" sub={`Since it was posted · ${dcur}`}>
          {st.state === "idle" || st.state === "loading" ? (
            <div className="skeleton h-[220px] rounded-xl" aria-busy="true" aria-label="Loading" />
          ) : st.state === "error" ? (
            <p className="rounded-xl border border-red/20 bg-red/5 px-4 py-3 text-[13px] text-ink-soft">{st.error}</p>
          ) : days.length && dayVals.some((x) => (x ?? 0) > 0) ? (
            <>
              <DayBarsChart title="Revenue per day" days={days.map((x) => x.day)} values={dayVals} format={(n) => money2(n, dcur)} height={220} />
              <div className="mt-4 pt-3 border-t border-line/10">
                <p className="text-[12px] font-semibold text-ink-soft mb-1.5">Its best days</p>
                <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-[13px]">
                  {best.map((x) => (
                    <li key={x.day} className="flex items-baseline gap-2">
                      <span className="text-ink-soft flex-1">{niceDay(x.day, true)}</span>
                      <b className="tabular-nums">{money2(x.revenue, dcur)}</b>
                      {x.cpm !== null && <span className="text-[11.5px] text-ink-faint tabular-nums">CPM {money2(x.cpm, dcur)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-[13px] text-ink-faint">{st.data?.note ?? "No revenue per day for it yet."}</p>
          )}
        </ChartCard>
      )}
      <p className="text-[12px] text-ink-faint">Revenue is the platform&rsquo;s estimate, in {cur}; it can change for a few days after.</p>
    </div>
  );
}

