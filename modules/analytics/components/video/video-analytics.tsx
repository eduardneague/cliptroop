"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ClockIcon, CommentIcon, ExternalIcon, EyeIcon, MoneyIcon, ShareIcon, ThumbUpIcon, TrophyIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { fillVideoHistory, loadVideoDetails } from "@/app/(dashboard)/analytics/actions";
import type { VideoPageData } from "../../lib/video";
import { scoreText, scoreTone } from "../../lib/scores";
import { ChartCard } from "../charts";
import { Breakdown } from "../advanced/breakdowns";
import { compactNum, money, niceDay, seconds } from "../advanced/format";
import { fmt, NAME, toneClass, versus } from "./video-parts";
import { AudienceTab, EngagementTab, OverviewTab, ReachTab, RevenueTab, TAB_NAME, tabsFor, useVideoRevenue, type VideoTab } from "./video-tabs";
import { KIND_LABEL, isWide } from "../../lib/kinds";
import { fmtInt } from "../charts";

/*
 * One video's analytics (1.17.0; tabs like YouTube Studio's in 1.21.0):
 * its numbers at a glance with its counts right now, then Overview, Reach,
 * Engagement, Audience, Revenue and Advanced (every number, every day).
 * Everything next to the team's typical video of the same kind.
 */

const KIND = KIND_LABEL;
const TYPE_NAME: Record<string, string> = { filler: "Everyday short", sponsorship: "Sponsored short", big: "Big short" };

/**
 * YouTube's numbers for it are asked again after this long (the page asks;
 * at most every 10 minutes per server). 1.22.0: an hour (was half a day), so
 * its subscribers and revenue are as far along as YouTube Studio's.
 */
const DETAILS_STALE_MS = 3_600_000;

export function VideoAnalytics({
  teamId,
  data,
  tab: initialTab,
  from,
  revenueAllowed,
}: {
  teamId: string;
  data: VideoPageData;
  tab: VideoTab;
  from: "content" | "advanced" | "audience" | "dashboard" | "overview" | "realtime" | "insights" | "search" | "posting";
  revenueAllowed: boolean;
}) {
  const v = data.video;
  const router = useRouter();
  const tabs = tabsFor(data, revenueAllowed);
  const [tab, setTab] = useState<VideoTab>(tabs.includes(initialTab) ? initialTab : "overview");
  const [fill, setFill] = useState<"idle" | "working" | "failed">(data.canFill ? "working" : "idle");
  const stale = v.platform === "youtube" && (!data.breakdowns?.fetchedAt || Date.parse(data.breakdowns.fetchedAt) < Date.parse(data.today) - DETAILS_STALE_MS);
  const [details, setDetails] = useState<"idle" | "working" | "failed">(stale ? "working" : "idle");
  const revenue = useVideoRevenue(teamId, v.id);
  const loadRevenue = revenue.load;

  // YouTube sends a video's whole day-by-day history on request: fetched once when the start is missing.
  useEffect(() => {
    if (!data.canFill) return;
    let live = true;
    setFill("working");
    fillVideoHistory(teamId, v.id)
      .then((r) => {
        if (!live) return;
        if (r.error !== undefined) return setFill("failed");
        setFill("idle");
        if (r.filled > 0) router.refresh();
      })
      .catch(() => live && setFill("failed"));
    return () => {
      live = false;
    };
  }, [teamId, v.id, data.canFill, router]);

  // Everything else about it (where its views came from, who watched, its subscribers per day): asked when missing or half a day old.
  useEffect(() => {
    if (!stale) return;
    let live = true;
    setDetails("working");
    loadVideoDetails(teamId, v.id)
      .then((r) => {
        if (!live) return;
        if (r.error !== undefined) return setDetails("failed");
        setDetails("idle");
        if (r.saved > 0) router.refresh();
      })
      .catch(() => live && setDetails("failed"));
    return () => {
      live = false;
    };
    // (Once per opening: the refresh brings fresh numbers, not another ask.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, v.id]);

  // The Revenue tab asks for its money per day as it opens.
  useEffect(() => {
    if (tab === "revenue" && v.platform === "youtube") loadRevenue();
  }, [tab, v.platform, loadRevenue]);

  const change = (t: VideoTab) => {
    setTab(t);
    try {
      const url = new URL(window.location.href);
      if (t === "overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", t);
      window.history.replaceState(window.history.state, "", url);
    } catch {}
  };

  const TAB_BACK: Partial<Record<typeof from, string>> = { content: "Content", audience: "Audience", overview: "Overview", realtime: "Realtime", insights: "Insights", search: "Overview" };
  const back =
    from === "dashboard"
      ? { href: "/dashboard", label: "Dashboard" }
      : from === "posting"
        ? { href: "/posting?tab=posted", label: "Posting" }
        : from === "advanced"
          ? { href: `/analytics?tab=advanced&platform=${v.platform}`, label: "Analytics · Advanced" }
          : { href: `/analytics?tab=${from === "search" ? "overview" : from}`, label: `Analytics · ${TAB_BACK[from] ?? "Overview"}` };

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1400px] mx-auto space-y-5 sm:space-y-6">
      <nav className="flex items-center gap-2 text-[12.5px] text-ink-soft" aria-label="Where you are">
        <Link href={back.href} className="inline-flex items-center gap-1.5 rounded-lg px-2 h-8 -ml-2 font-semibold hover:bg-surface-2 hover:text-ink">
          <ArrowLeftIcon className="w-4 h-4" />
          {back.label}
        </Link>
      </nav>

      <Hero data={data} revenueAllowed={revenueAllowed} />

      <div>
        <nav className="flex items-center gap-0.5 border-b border-line/15 overflow-x-auto no-scrollbar -mx-4 px-3 sm:mx-0 sm:px-0" aria-label="This video's analytics">
          {tabs.map((id) => {
            const on = id === tab;
            return (
              <button
                key={id}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => change(id)}
                className={`relative px-2.5 sm:px-3.5 h-11 inline-flex items-center text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {TAB_NAME[id]}
                <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-[2px] bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
              </button>
            );
          })}
        </nav>
        {(fill === "working" || details === "working") && (
          <p className="mt-2 inline-flex items-center gap-2 text-[12px] text-ink-soft" role="status">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-amber/30 border-t-amber animate-spin" aria-hidden />
            {fill === "working" ? "Getting its full day-by-day history from YouTube…" : "Getting the latest details from YouTube…"}
          </p>
        )}
      </div>

      {tab === "overview" && <OverviewTab data={data} revenueAllowed={revenueAllowed} revenue={revenue} onSeeMore={() => change("advanced")} />}
      {tab === "reach" && <ReachTab data={data} fetching={details === "working"} />}
      {tab === "engagement" && <EngagementTab data={data} />}
      {tab === "audience" && <AudienceTab data={data} fetching={details === "working"} />}
      {tab === "revenue" && <RevenueTab data={data} revenue={revenue} />}
      {tab === "advanced" && <Advanced data={data} />}

      {data.notes.length > 0 && (
        <ul className="space-y-0.5 text-[12px] text-ink-faint">
          {data.notes.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ data }: { data: VideoPageData }) {
  const v = data.video;
  const tall = !isWide(v.kind);
  return (
    <span
      className={`relative block rounded-xl overflow-hidden bg-surface-2 flex-shrink-0 self-start ${
        tall ? "w-[120px] h-[213px] sm:w-[150px] sm:h-[267px] xl:w-[168px] xl:h-[299px]" : "w-full sm:w-[320px] lg:w-[380px] xl:w-[420px] aspect-video"
      }`}
    >
      {v.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.thumbnail} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
      ) : null}
      <PlatformIcon platform={v.platform} className="absolute bottom-2 right-2 w-6 h-6 rounded-md shadow" />
      {v.durationSec ? <span className="absolute bottom-2 left-2 rounded-md bg-black/70 text-white text-[11px] font-semibold px-1.5 h-5 inline-flex items-center tabular-nums">{seconds(v.durationSec)}</span> : null}
    </span>
  );
}

/** Money in big type: a currency written as its code ("RON 922.61") gets the code small, so it fits with the other numbers. */
function MoneyValue({ n, currency }: { n: number | null; currency: string }) {
  const text = money(n, currency);
  const m = /^([A-Z]{3})[\s ]*(.+)$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      <span className="text-[0.55em] font-bold tracking-wide text-ink-soft mr-1">{m[1]}</span>
      {m[2]}
    </>
  );
}

const ago = (days: number | null) => (days === null ? "" : days === 0 ? "today" : days === 1 ? "yesterday" : days < 60 ? `${days} days ago` : days < 730 ? `${Math.round(days / 30)} months ago` : `${Math.round(days / 365)} years ago`);

/** To 3 digits, written in full ("23,900"), like YouTube's ranges. */
const round3 = (n: number) => {
  const a = Math.abs(n);
  if (a < 1000) return Math.round(n).toLocaleString("en-US");
  const step = Math.pow(10, Math.floor(Math.log10(a)) - 2);
  return (Math.round(n / step) * step).toLocaleString("en-US");
};

/**
 * "This Short got 39,228 views. That's similar to the 23,900–39,700 you
 * usually get by day 12." (1.22.0, like YouTube Studio's.)
 */
function usualWords(data: VideoPageData): { lead: string; rest: string; tone: "up" | "same" | "down" } | null {
  const v = data.video;
  const u = data.usual;
  if (v.views === null) return null;
  const noun = v.platform === "facebook" ? "plays" : "views";
  const thing = v.kind === "short" ? (v.platform === "youtube" ? "Short" : v.platform === "tiktok" ? "video" : "Reel") : v.kind === "long" ? "video" : v.kind === "live" ? "live stream" : "post";
  const lead = `This ${thing} got ${fmtInt(v.views)} ${noun}.`;
  if (!u || u.high <= 0) return { lead, rest: "", tone: "same" };
  const tone = v.views > u.high ? "up" : v.views < u.low ? "down" : "same";
  const word = tone === "up" ? "more than" : tone === "down" ? "fewer than" : "similar to";
  return { lead, rest: ` That's ${word} the ${round3(u.low)}–${round3(u.high)} you usually get${u.day ? ` by day ${u.day}` : ""}.`, tone };
}

/**
 * The top of the page (1.22.0: a bigger picture, the exact views with what
 * the ones before it usually got, every main number in one row; the "right
 * now" box went: the realtime card below has it): the video, its views, its
 * numbers with their icons (watch time, average % viewed, likes, comments,
 * shares, subscribers, revenue), and how it does next to the usual.
 */
function Hero({ data, revenueAllowed }: { data: VideoPageData; revenueAllowed: boolean }) {
  const v = data.video;
  const tone = scoreTone(v.score);
  const viewsKey = data.keys.find((k) => k.key === "views");
  const tall = !isWide(v.kind);
  const key = (k: string) => data.keys.find((x) => x.key === k) ?? null;
  // Subscribers like YouTube Studio's: gained minus lost.
  const lost = typeof v.metrics.subscribers_lost === "number" ? v.metrics.subscribers_lost : null;
  const subs = v.platform === "youtube" ? (v.subscribersGained === null ? null : v.subscribersGained - (lost ?? 0)) : (v.subscribersGained ?? v.metrics.followers_gained ?? null);
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtInt(Math.abs(n))}`;
  const stats: { k: string; icon: React.ReactNode; label: string; value: React.ReactNode; title?: string }[] = [
    ...(v.watchMinutes !== null ? [{ k: "watch", icon: <ClockIcon className="w-4 h-4" />, label: "Watch time", value: `${v.watchMinutes / 60 < 10 ? (v.watchMinutes / 60).toFixed(1) : compactNum(v.watchMinutes / 60)} h`, title: `${fmtInt(v.watchMinutes / 60)} hours` }] : []),
    ...(v.avgViewPct !== null ? [{ k: "pct", icon: <PercentIcon />, label: "Average % viewed", value: `${v.avgViewPct.toFixed(1)}%` }] : []),
    ...(v.avgViewSeconds !== null ? [{ k: "avg", icon: <StopwatchIcon />, label: v.platform === "youtube" ? "Average view" : "Average watch", value: seconds(v.avgViewSeconds) }] : []),
    { k: "likes", icon: <ThumbUpIcon className="w-4 h-4" />, label: v.platform === "facebook" ? "Reactions" : "Likes", value: compactNum(v.likes), title: v.likes !== null ? fmtInt(v.likes) : undefined },
    { k: "comments", icon: <CommentIcon className="w-4 h-4" />, label: "Comments", value: compactNum(v.comments), title: v.comments !== null ? fmtInt(v.comments) : undefined },
    ...(v.shares !== null ? [{ k: "shares", icon: <ShareIcon className="w-4 h-4" />, label: "Shares", value: compactNum(v.shares), title: fmtInt(v.shares) }] : []),
    ...(subs !== null ? [{ k: "subs", icon: <PersonPlusIcon />, label: v.platform === "youtube" ? "Subscribers" : "Followers", value: signed(subs), title: v.platform === "youtube" ? `${fmtInt(v.subscribersGained)} gained${lost !== null ? `, ${fmtInt(lost)} lost` : ""}` : undefined }] : []),
    ...(revenueAllowed && key("revenue") ? [{ k: "revenue", icon: <MoneyIcon className="w-4 h-4" />, label: v.platform === "youtube" ? "Revenue" : "Earnings", value: <MoneyValue n={key("revenue")!.value} currency={data.currency} /> }] : []),
  ];
  const usual = usualWords(data);
  const numbers = (
    <>
      {/* Its views, exactly, next to what the ones before it usually got. */}
      <div className="mt-4 rounded-xl bg-surface-2/60 px-4 py-3">
        <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
          <span className="inline-flex items-baseline gap-2">
            <EyeIcon className="w-[18px] h-[18px] text-ink-soft self-center" />
            <span className="font-display text-[32px] sm:text-[38px] leading-none font-semibold tabular-nums">{fmtInt(v.views)}</span>
            <span className="text-[14px] font-semibold text-ink-soft">{v.platform === "facebook" ? "plays" : "views"}</span>
          </span>
          {v.score !== null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2 h-7 text-[12.5px] font-bold tabular-nums ${tone === "high" || tone === "up" ? "text-green bg-green/10" : tone === "down" ? "text-coral bg-coral/10" : "text-ink-soft bg-surface"}`}
              title={`Your typical ${data.peerWord.replace(/s$/, "")}: ${fmtInt(v.typical)} ${v.platform === "facebook" ? "plays" : "views"} (the median of the ones before it)`}
            >
              {scoreText(v.score)} <span className="font-semibold">your usual</span>
            </span>
          )}
          {viewsKey?.rank && viewsKey.rank.of > 1 && (
            <span className="text-[12px] text-ink-soft inline-flex items-center gap-1.5">
              <TrophyIcon className="w-3.5 h-3.5 text-gold" />#{viewsKey.rank.rank} of {viewsKey.rank.of} {data.peerWord}
            </span>
          )}
        </div>
        {usual && (
          <p className="mt-1.5 text-[13px] text-ink-soft leading-snug">
            {usual.lead}
            {usual.rest && <b className={`font-semibold ${usual.tone === "up" ? "text-green" : usual.tone === "down" ? "text-coral" : "text-ink"}`}>{usual.rest}</b>}
          </p>
        )}
      </div>
      {/* Its main numbers: in one row when they fit, else in even rows (globals.css, .stat-grid). */}
      <div className="stat-cq mt-3.5">
        <dl className="stat-grid" data-n={stats.length} aria-label="Its numbers so far">
          {stats.map((x) => (
            <div key={x.k} className="min-w-0" title={x.title}>
              <dt className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-faint whitespace-nowrap">
                <span className="text-ink-soft">{x.icon}</span>
                {x.label}
              </dt>
              <dd className="font-display text-[21px] sm:text-[23px] leading-tight font-semibold tabular-nums whitespace-nowrap">{x.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-3.5 flex items-center gap-2 flex-wrap">
        {v.url && (
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold hover:border-line/30">
            Open on {NAME[v.platform]}
            <ExternalIcon className="w-3.5 h-3.5" />
          </a>
        )}
        {v.ours && (
          <Link href={v.ours.kind === "short" ? `/shorts/${v.ours.id}` : `/videos/${v.ours.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold text-amber hover:border-line/30">
            #{v.ours.number ?? "?"} in ClipTroop
          </Link>
        )}
      </div>
    </>
  );
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
      <div className={`flex gap-4 sm:gap-6 ${tall ? "flex-row" : "flex-col sm:flex-row"}`}>
        <Thumb data={data} />
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-soft flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <PlatformIcon platform={v.platform} className="w-4 h-4 rounded-[4px]" />
              {NAME[v.platform]}
            </span>
            <span aria-hidden>·</span>
            <span>{KIND[v.kind]}</span>
            {v.ours?.type && (
              <>
                <span aria-hidden>·</span>
                <span>{TYPE_NAME[v.ours.type] ?? v.ours.type}</span>
              </>
            )}
          </div>
          <h1 className="mt-1.5 font-display text-[21px] sm:text-[28px] leading-[1.15] font-semibold break-words">{v.title || "Untitled"}</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            {v.publishedAt ? `Posted ${niceDay(v.publishedAt, true)}` : "Posting date unknown"}
            {data.ageDays !== null ? ` · ${ago(data.ageDays)}` : ""}
            {v.durationSec ? ` · ${seconds(v.durationSec)} long` : ""}
          </p>
          {/* A Short's picture is tall: on a phone its numbers go under both. */}
          <div className={tall ? "hidden sm:block" : ""}>{numbers}</div>
        </div>
      </div>
      {tall && <div className="sm:hidden">{numbers}</div>}
    </section>
  );
}

function PercentIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M12.5 3.5l-9 9" />
      <circle cx="4.5" cy="4.5" r="1.8" />
      <circle cx="11.5" cy="11.5" r="1.8" />
    </svg>
  );
}
function StopwatchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="9" r="5.25" />
      <path d="M8 9V6.5M6.5 1.75h3M12.4 4.1l.9-.9" />
    </svg>
  );
}
function PersonPlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6.5" cy="5.5" r="2.75" />
      <path d="M1.75 13.75c.6-2.4 2.5-3.75 4.75-3.75s4.15 1.35 4.75 3.75M12.75 4.75v4M10.75 6.75h4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Advanced: every number
// ---------------------------------------------------------------------------

const EXTRA: Record<string, string> = {
  dislikes: "Dislikes",
  subscribers_lost: "Subscribers lost",
  playlist_adds: "Added to playlists",
  playlist_removes: "Removed from playlists",
  premium_views: "YouTube Premium views",
  premium_watch_minutes: "Premium watch minutes",
  card_impressions: "Card impressions",
  card_clicks: "Card clicks",
  card_teaser_impressions: "Card teaser impressions",
  card_teaser_clicks: "Card teaser clicks",
  annotation_clicks: "Annotation clicks",
  total_watch_seconds: "Total watch time",
  interactions: "Interactions",
  crossposted_views: "Views from cross-posts",
  facebook_views: "Views on Facebook",
  total_plays: "Plays with replays",
  replays: "Replays",
  reach: "Reach",
  followers_gained: "Followers gained",
  profile_visits: "Profile visits",
  follows: "Follows",
};

function Advanced({ data }: { data: VideoPageData }) {
  const v = data.video;
  const [allDays, setAllDays] = useState(false);
  const extras = Object.entries(v.metrics)
    .map(([k, val]) => [k.startsWith("reactions_") ? `Reactions: ${k.slice(10)}` : EXTRA[k] ?? null, k === "total_watch_seconds" ? seconds(val) : compactNum(val)] as const)
    .filter((x): x is readonly [string, string] => !!x[0]);
  const d = data.daily;
  const dayRows = d
    ? d.days.map((day, i) => ({ day, views: d.views[i], watch: d.watchMinutes[i], avg: d.avgView[i], likes: d.likes[i], comments: d.comments[i], subs: d.subs[i], impressions: d.impressions[i], ctr: d.ctr[i] })).reverse()
    : [];
  // The columns there are numbers for.
  const has = (f: keyof (typeof dayRows)[number]) => dayRows.some((r) => r[f] !== null && r[f] !== undefined);
  const cols: { f: keyof (typeof dayRows)[number]; label: string; show: (r: (typeof dayRows)[number]) => string }[] = [
    { f: "watch", label: "Watch time", show: (r) => (r.watch === null ? "–" : `${compactNum(r.watch / 60)} h`) },
    { f: "avg", label: "Average view", show: (r) => seconds(r.avg) },
    { f: "subs", label: "Subscribers", show: (r) => (r.subs === null ? "–" : `${r.subs > 0 ? "+" : ""}${compactNum(r.subs)}`) },
    { f: "likes", label: "Likes", show: (r) => compactNum(r.likes) },
    { f: "comments", label: "Comments", show: (r) => compactNum(r.comments) },
    { f: "impressions", label: "Impressions", show: (r) => compactNum(r.impressions) },
    { f: "ctr", label: "CTR", show: (r) => (r.ctr === null ? "–" : `${r.ctr.toFixed(1)}%`) },
  ];
  const dayCols = d?.source === "daily" ? cols.filter((c) => has(c.f)) : [];
  const splits = (data.breakdowns?.list ?? []).filter((b) => ["traffic_source", "search_term"].includes(b.id));
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line/10 bg-surface overflow-x-auto" aria-label="Every number">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint text-left">
              <th className="px-4 py-2.5">Number</th>
              <th className="px-3 py-2.5 text-right">This video</th>
              <th className="px-3 py-2.5 text-right">Typical {data.peerWord.replace(/s$/, "")}</th>
              <th className="px-3 py-2.5 text-right">Compared</th>
              <th className="px-4 py-2.5 text-right">Rank</th>
            </tr>
          </thead>
          <tbody>
            {data.keys.map((k) => {
              const vs = versus(k);
              return (
                <tr key={k.key} className="border-t border-line/10">
                  <td className="px-4 py-2.5 font-semibold">{k.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmt(k, k.value, data.currency)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">{fmt(k, k.typical, data.currency)}</td>
                  <td className="px-3 py-2.5 text-right">{vs ? <span className={`inline-flex items-center rounded-md px-1.5 h-[18px] text-[11px] font-bold tabular-nums ${toneClass[vs.tone]}`}>{vs.text}</span> : <span className="text-ink-faint">–</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-soft whitespace-nowrap">{k.rank ? `#${k.rank.rank} of ${k.rank.of}` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {(extras.length > 0 || v.revenue) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {extras.length > 0 && (
            <ChartCard title={`Everything else ${NAME[v.platform]} shares`} sub="Lifetime numbers">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {extras.map(([label, val]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11.5px] text-ink-faint truncate">{label}</dt>
                    <dd className="text-[15px] font-semibold tabular-nums">{val}</dd>
                  </div>
                ))}
              </dl>
            </ChartCard>
          )}
          {v.revenue && (
            <ChartCard title="Money" sub={`Lifetime, in ${data.currency}`}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {[
                  ["Revenue", money(v.revenue.revenue, data.currency)],
                  ["Per 1,000 views (RPM)", money(v.revenue.rpm, data.currency, true)],
                  ["Typical RPM", money(data.typicalRpm, data.currency, true)],
                  ["CPM", money(v.revenue.cpm, data.currency, true)],
                  ["Playback-based CPM", money(v.revenue.playbackCpm, data.currency, true)],
                  ["Ad impressions", compactNum(v.revenue.adImpressions)],
                  ["Monetized playbacks", compactNum(v.revenue.monetizedPlaybacks)],
                ].map(([label, val]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11.5px] text-ink-faint truncate">{label}</dt>
                    <dd className="text-[15px] font-semibold tabular-nums">{val}</dd>
                  </div>
                ))}
              </dl>
            </ChartCard>
          )}
        </div>
      )}

      {splits.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {splits.map((b) => (
            <div key={b.id} className="min-w-0">
              <Breakdown b={{ ...b, sub: data.breakdowns?.asOf ? `Since it was posted, to ${niceDay(data.breakdowns.asOf, true)}` : b.sub }} compare={false} />
            </div>
          ))}
        </div>
      )}

      {dayRows.length > 0 && (
        <ChartCard title="Day by day" sub={d?.source === "daily" ? "YouTube's own numbers for each day" : "The change between one morning's copy and the next"}>
          <div className="overflow-x-auto">
            <table className={`w-full text-[12.5px] ${dayCols.length > 3 ? "min-w-[720px]" : "min-w-[420px]"}`}>
              <thead>
                <tr className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint text-left">
                  <th className="py-1.5 pr-3">Day</th>
                  <th className="py-1.5 px-3 text-right">Views</th>
                  {dayCols.map((c) => (
                    <th key={c.f} className="py-1.5 px-3 text-right whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(allDays ? dayRows : dayRows.slice(0, 14)).map((r) => (
                  <tr key={r.day} className="border-t border-line/10">
                    <td className="py-1.5 pr-3 text-ink-soft whitespace-nowrap">{niceDay(r.day, true)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{r.views === null ? "–" : Math.round(r.views).toLocaleString("en-US")}</td>
                    {dayCols.map((c) => (
                      <td key={c.f} className="py-1.5 px-3 text-right tabular-nums text-ink-soft">
                        {c.show(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dayRows.length > 14 && (
            <button type="button" onClick={() => setAllDays((a) => !a)} className="mt-3 text-[12px] font-semibold text-ink-soft hover:text-ink">
              {allDays ? "Show the last 14 days" : `Show all ${dayRows.length} days`}
            </button>
          )}
        </ChartCard>
      )}
    </div>
  );
}
