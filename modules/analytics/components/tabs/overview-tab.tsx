"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Mascot } from "@/components/ui/mascot";
import { Select } from "@/components/ui/select";
import type { SocialPlatform } from "@/lib/social/providers";
import type { RangeId, Window } from "../../lib/ranges";
import type { OvKey, OvMetric, OvTopResult, Overview } from "../../lib/overview";
import type { InsightsPreview } from "../../lib/insights";
import type { ContentItem } from "../../lib/queries";
import { addSeries, bucketDays, change, combineRates, defaultGran, gransFor, rollup, runningTotal, total, weightedAvg, type Gran, type Num, type TrendBucket } from "../../lib/trend-math";
import { hourRange } from "../../lib/live-math";
import { ago } from "../../lib/ago";
import { scoreText } from "../../lib/scores";
import { tipFor } from "../../lib/insights-math";
import { KIND_LABEL, KIND_PLURAL, isWide } from "../../lib/kinds";
import { CardStrip, ChartCard, fmtCompact, fmtInt, Legend, LineChart, MarkIcon, StackedColumns, type Mark, type Series } from "../charts";
import { RealtimePanel, useRealtime } from "../realtime-card";
import { ScoreBadge, videoHref } from "../content-list";
import type { PeriodPoint } from "../period-videos";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { PLATFORM, type P, ALL_P, SHORT_COLOR, LONG_COLOR, LIVE_COLOR, TOTAL_COLOR, niceDay, StatusRow, SetupCard, AccountNote } from "./shared";

// Only loaded when a point on the chart is clicked.
const PeriodVideos = dynamic(() => import("../period-videos").then((m) => m.PeriodVideos), { ssr: false });

/*
 * Analytics → Overview (1.20.0), like YouTube Studio's: the numbers that
 * matter as cards that switch the chart, a chart that does a lot (any of
 * those numbers, all platforms together or side by side, Shorts next to long
 * videos, per day / week / month or hour by hour for 48 hours, running
 * totals, the stretch before, the videos posted on each day), then what's
 * happening now, what got the views, the newest videos next to the usual,
 * and a few hints. 1.21.0: two columns of their own (no gaps between
 * cards of different heights): the chart, Shorts vs long videos, the top
 * content and the platforms on the left; realtime (bigger), the latest
 * videos one at a time and the hints on the right. On a phone realtime
 * comes right after the chart.
 */

type Meta = { label: string; format: (n: number | null) => string; rate?: boolean; good?: "up" | "down"; hint?: string; noun?: string };
const hours = (n: number | null) => (n === null ? "–" : n === 0 ? "0" : n >= 100 ? fmtCompact(n) : n.toFixed(n >= 10 ? 0 : 1));
const pct = (n: number | null) => (n === null ? "–" : `${n.toFixed(1)}%`);
const secs = (n: number | null) => {
  if (n === null) return "–";
  const s = Math.round(n);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
function metaFor(key: OvKey, currency: string | null): Meta {
  switch (key) {
    case "views":
      return { label: "Views", format: fmtCompact, noun: "views" };
    case "watch":
      return { label: "Watch time", format: (n) => (n === null ? "–" : `${hours(n)} h`), hint: "hours, YouTube", noun: "hours watched" };
    case "followers":
      return { label: "Followers", format: (n) => (n === null ? "–" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtCompact(Math.abs(n))}`), hint: "gained − lost", noun: "new followers" };
    case "engagement":
      return { label: "Engagement", format: fmtCompact, hint: "likes, comments, shares", noun: "likes, comments and shares" };
    case "likes":
      return { label: "Likes", format: fmtCompact, noun: "likes" };
    case "comments":
      return { label: "Comments", format: fmtCompact, noun: "comments" };
    case "shares":
      return { label: "Shares", format: fmtCompact, noun: "shares" };
    case "impressions":
      return { label: "Impressions", format: fmtCompact, hint: "YouTube thumbnails", noun: "impressions" };
    case "ctr":
      return { label: "Impressions CTR", format: pct, rate: true, hint: "YouTube" };
    case "avgView":
      return { label: "Average view", format: secs, rate: true, hint: "YouTube" };
    case "revenue":
      return {
        label: "Revenue",
        format: (n) => {
          if (n === null) return "–";
          try {
            return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD", maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n);
          } catch {
            return n.toFixed(2);
          }
        },
        hint: "estimated",
      };
  }
}
/**
 * The cards, in this order (the rest can be picked in the chart's menu).
 * The same in the 48 hours (1.22.0: it only had views, likes and comments):
 * there, the numbers that only come per day are the last two days copied.
 */
const CARDS: OvKey[] = ["views", "watch", "followers", "engagement", "impressions", "ctr", "revenue"];

type Lines = "together" | "platform" | "kind";

/** One metric for some platforms, put together (rates weighted). */
function combine(m: OvMetric, ps: P[], rate: boolean, which: "now" | "prev"): { values: Num[]; weights: Num[] | null } {
  const list = ps.filter((p) => m.per[p]);
  if (!list.length) return { values: [], weights: null };
  if (rate) {
    const r = combineRates(list.map((p) => ({ values: m.per[p]![which], weights: m.weights?.[p]?.[which] ?? m.per[p]![which].map(() => 1) })));
    return { values: r.values, weights: r.weights };
  }
  return { values: addSeries(list.map((p) => m.per[p]![which])), weights: null };
}
const headline = (values: Num[], weights: Num[] | null, rate: boolean) => (rate ? weightedAvg(values, weights ?? values.map(() => 1)) : total(values));
/**
 * A fair comparison: the stretch before has numbers on most of the days this one has
 * (not when copying started part-way through it, which would read as a jump).
 */
/** The 48 hours lifted to a platform's own count (1.23.1): "YouTube", "each platform", or null. */
function liftedTo(o: Overview, ps: P[]): string | null {
  const lifted = ps.filter((p) => o.coverage?.[p]?.ratio);
  return !lifted.length ? null : lifted.length === 1 ? PLATFORM[lifted[0]].name : "each platform";
}

const fairBefore = (now: Num[], prev: Num[]) => {
  const n = now.filter((x) => x !== null).length;
  return n > 0 && prev.filter((x) => x !== null).length >= 0.8 * n;
};

export function OverviewTab({
  teamId,
  o,
  insights,
  compare,
  range,
  w,
  hrefs,
}: {
  teamId: string;
  o: Overview;
  insights: Promise<InsightsPreview>;
  compare: boolean;
  range: RangeId;
  w: Window;
  hrefs: { realtime: string; insights: string; content: string; audience: string; advanced: (platform: P | null) => string };
}) {
  const connected = o.status.some((s) => s.connected);
  const available = useMemo(() => ALL_P.filter((p) => o.metrics.some((m) => m.per[p])), [o.metrics]);
  const [platform, setPlatform] = useState<"all" | P>("all");
  const ps: P[] = platform === "all" ? available : available.filter((p) => p === platform);
  const cards = CARDS.filter((k) => o.metrics.some((m) => m.key === k && ps.some((p) => m.per[p])));
  const [key, setKey] = useState<OvKey>("views");
  const metric = o.metrics.find((m) => m.key === key && ps.some((p) => m.per[p])) ?? o.metrics.find((m) => m.key === cards[0]) ?? null;
  // The chart's settings: kept while moving between numbers.
  const [lines, setLines] = useState<Lines>("together");
  const [cumulative, setCumulative] = useState(false);
  const grans = gransFor(o.points.length, o.hourly);
  const [gran, setGran] = useState<Gran>(defaultGran(o.points.length, o.hourly));
  useEffect(() => setGran(defaultGran(o.points.length, o.hourly)), [o.points.length, o.hourly]);
  // A point clicked on the chart: its videos (any number, any grouping, hours too).
  const [picked, setPicked] = useState<{ points: PeriodPoint[]; index: number; hourly: boolean; key: OvKey } | null>(null);
  const closePicked = useCallback(() => setPicked(null), []);
  const [now] = useState(() => Date.now());
  // Realtime's numbers once, for the card on a phone (under the chart) or a computer (on the right).
  const rt = useRealtime(teamId);

  if (!connected && !o.hasData)
    return (
      <>
        <StatusRow status={o.status} />
        <SetupCard status={o.status} />
      </>
    );

  const meta = metric ? metaFor(metric.key, o.currency) : null;
  const words = rangeWords(range, w, o.hourly);
  const views = o.metrics.find((m) => m.key === "views");
  const vNow = views ? headline(combine(views, ps, false, "now").values, null, false) : null;
  const vPrev = views ? headline(combine(views, ps, false, "prev").values, null, false) : null;
  const vFair = views ? fairBefore(combine(views, ps, false, "now").values, combine(views, ps, false, "prev").values) : false;
  const vChange = compare && vFair ? change(vNow, vPrev) : null;
  const posted = o.markers.filter((m) => ps.includes(m.platform as P));
  const postedWords = (["short", "long", "live", "post"] as const)
    .map((k) => {
      const c = posted.filter((m) => m.kind === k).length;
      return c ? `${c} ${c === 1 ? KIND_LABEL[k].toLowerCase() : KIND_PLURAL[k]}` : null;
    })
    .filter(Boolean)
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
  // 48 hours: some hours worked out from the account's totals (before every video was counted).
  const estimated = o.hourly && !!views?.est && ps.some((p) => views.est?.[p]?.some(Boolean));
  // Lifetime while YouTube's earlier days are still being copied.
  const copying = !!w.lifetime && !!o.history && !o.history.done && ps.includes("youtube");

  return (
    <div className="space-y-5">
      {available.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap" role="radiogroup" aria-label="Platform">
          {(["all", ...available] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={platform === p}
              onClick={() => setPlatform(p)}
              className={`inline-flex items-center gap-1.5 rounded-lg border h-8 text-[12px] font-semibold transition-colors ${p === "all" ? "px-3" : "pl-1 pr-2.5"} ${
                platform === p ? (p === "all" ? "bg-ink text-paper border-ink" : "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)] text-ink") : "border-line/15 bg-surface/50 text-ink-soft hover:text-ink"
              }`}
            >
              {p !== "all" && <PlatformIcon platform={p} className="w-6 h-6 rounded-md" />}
              {p === "all" ? "All platforms" : PLATFORM[p].name}
            </button>
          ))}
        </div>
      )}
      <AccountNote status={o.status} className="-mt-2" />

      {/* The headline, like YouTube Studio's. */}
      <div>
        <h2 className="font-display text-[22px] sm:text-[26px] font-semibold leading-tight">
          {vNow === null ? (
            o.hourly ? (
              "Views in the last 48 hours"
            ) : (
              "No views copied for these days yet"
            )
          ) : (
            <>
              {platform === "all" ? "Your videos" : `Your ${PLATFORM[platform].name} videos`} got <span className="tabular-nums">{fmtInt(vNow)}</span> views {words}
            </>
          )}
        </h2>
        <p className="text-[13px] text-ink-soft mt-1 flex items-center gap-2 flex-wrap">
          {vChange !== null && (
            <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 h-5 text-[11.5px] font-bold ${Math.abs(vChange) < 0.05 ? "text-ink-soft bg-surface-2" : vChange > 0 ? "text-green bg-green/10" : "text-red bg-red/10"}`}>
              {vChange > 0 ? "+" : vChange < 0 ? "−" : ""}
              {Math.abs(vChange) >= 10 ? Math.round(Math.abs(vChange)) : Math.abs(vChange).toFixed(1)}%
            </span>
          )}
          {vChange !== null && <span>vs {fmtCompact(vPrev)} {o.hourly ? "in the 48 hours before" : `in the ${w.days} days before`}</span>}
          {postedWords && (
            <span className="text-ink-faint">
              {vChange !== null ? "· " : ""}
              {postedWords} posted
            </span>
          )}
          {estimated && <span className="text-ink-faint">· some hours estimated from the channel&rsquo;s total views</span>}
          {o.hourly && liftedTo(o, ps) && <span className="text-ink-faint">· matched to {liftedTo(o, ps)}&rsquo;s own count</span>}
        </p>
        {copying && (
          <p className="mt-2 inline-flex items-start gap-2 rounded-lg bg-surface-2/70 px-3 py-2 text-[12.5px] text-ink-soft max-w-2xl">
            <span className="mt-1 w-2 h-2 rounded-full bg-amber animate-pulse flex-shrink-0" aria-hidden />
            <span>
              Copying your channel&rsquo;s earlier days from YouTube, a year at a time
              {o.history?.from ? ` (back to ${niceDay(o.history.from, true)} so far)` : ""}. Lifetime adds up as they arrive.
              {o.youtube?.totalViews ? ` YouTube counts ${fmtInt(o.youtube.totalViews)} views on the channel all time.` : ""}
            </span>
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] items-start">
        <div className="space-y-5 min-w-0">
          {metric && meta ? (
            <section className="rounded-2xl border border-line/10 bg-surface min-w-0 overflow-hidden">
              {/* The numbers that matter: each card switches the chart (more than fit: scroll, with arrows). */}
              <CardStrip>
                {cards.map((k) => (
                  <KpiCard key={k} m={o.metrics.find((x) => x.key === k)!} ps={ps} meta={metaFor(k, o.currency)} on={metric.key === k} compare={compare} onPick={() => setKey(k)} />
                ))}
              </CardStrip>
              <div className="p-4 sm:p-5">
                <TrendChart
                  o={o}
                  m={metric}
                  meta={meta}
                  ps={ps}
                  lines={lines}
                  setLines={setLines}
                  cumulative={cumulative}
                  setCumulative={setCumulative}
                  gran={grans.includes(gran) ? gran : grans[0]}
                  grans={grans}
                  setGran={setGran}
                  compare={compare}
                  now={now}
                  onPick={(points, index, hourly) => setPicked({ points, index, hourly, key: metric.key })}
                  allKeys={o.metrics.filter((m) => ps.some((p) => m.per[p])).map((m) => m.key)}
                  setKey={setKey}
                />
                <div className="mt-4 pt-3 border-t border-line/10 flex items-center gap-3 flex-wrap">
                  <Link href={hrefs.advanced(platform === "all" ? null : platform)} scroll={false} className="inline-flex items-center gap-1 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold hover:border-line/30 hover:bg-surface-2">
                    See more
                    <span aria-hidden>→</span>
                  </Link>
                  <span className="text-[12px] text-ink-faint">Every number, split and video in Advanced</span>
                </div>
              </div>
            </section>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-line/15 py-10 px-6 text-center flex flex-col items-center">
              <Mascot mood="idle" size={88} />
              <p className="text-[15px] font-semibold mt-3">{o.hourly ? "No counts in the last 48 hours yet" : "No numbers for these days yet"}</p>
              <p className="text-[13px] text-ink-soft mt-1 max-w-md">
                {o.hourly ? "Counts come every 10 minutes once the accounts are connected and the first morning copy has run." : "They come with each morning's copy. Pick a longer range, or press Sync now."}
              </p>
            </div>
          )}
          {picked && (
            <PeriodVideos
              teamId={teamId}
              points={picked.points}
              index={picked.index}
              hourly={picked.hourly}
              metric={picked.key}
              label={metaFor(picked.key, o.currency).label}
              format={metaFor(picked.key, o.currency).format}
              platforms={ps}
              onClose={closePicked}
            />
          )}

          {/* Phones: what's happening now, right under the chart. */}
          <div className="lg:hidden">
            <RealtimePanel rt={rt} href={hrefs.realtime} only={platform === "all" ? null : (platform as SocialPlatform)} />
          </div>

          {/* YouTube: Shorts and long videos apart, and together. */}
          {views?.split && !o.hourly && ps.includes("youtube") && <YouTubeKinds m={views} points={o.points} compare={compare} words={words} channel={o.youtube} lifetime={!!w.lifetime} />}

          <Suspense fallback={<ListSkeleton title="Top content" rows={5} />}>
            <TopContent top={o.top} words={words} hourly={o.hourly} lifetime={!!w.lifetime} ps={ps} hrefContent={hrefs.content} />
          </Suspense>

          {views && !o.hourly && <WhereViews m={views} ps={ps} compare={compare} />}
        </div>

        <aside className="space-y-5 min-w-0" aria-label="Now, the latest videos and hints">
          <div className="hidden lg:block">
            <RealtimePanel rt={rt} href={hrefs.realtime} only={platform === "all" ? null : (platform as SocialPlatform)} />
          </div>
          <LatestContent items={o.latest.filter((v) => ps.includes(v.platform as P))} now={now} hrefContent={hrefs.content} />
          <Suspense fallback={<ListSkeleton title="Insights" rows={3} />}>
            <InsightsCard p={insights} href={hrefs.insights} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}

function rangeWords(range: RangeId, w: Window, hourly: boolean) {
  if (hourly) return "in the last 48 hours";
  if (range === "lifetime") return `since ${niceDay(w.from, true)}`;
  if (range === "custom") return `from ${niceDay(w.from)} to ${niceDay(w.to, true)}`;
  if (range === "12m") return "in the last 365 days";
  return `in the last ${w.days} days`;
}

function KpiCard({ m, ps, meta, on, compare, onPick }: { m: OvMetric; ps: P[]; meta: Meta; on: boolean; compare: boolean; onPick: () => void }) {
  const now = combine(m, ps, !!meta.rate, "now");
  const prev = combine(m, ps, !!meta.rate, "prev");
  const value = headline(now.values, now.weights, !!meta.rate);
  const before = headline(prev.values, prev.weights, !!meta.rate);
  // Rates move in points (4.1% → 4.6% = +0.5 pts), the rest in percent.
  const fair = fairBefore(now.values, prev.values);
  const delta = !compare || !fair || value === null || before === null ? null : meta.rate ? value - before : change(value, before);
  const good = (delta ?? 0) > 0;
  const flat = delta !== null && Math.abs(delta) < (meta.rate ? 0.05 : 0.5);
  // In the 48 hours, a number that only comes per day: which two days it is.
  const days = m.days ? daysWords(m.days) : null;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onPick}
      title={[meta.hint ? `${meta.label}: ${meta.hint}` : null, days ? `Only per day: ${days}, the last two days copied` : null, compare && !fair ? "Not enough numbers from the stretch before to compare" : null].filter(Boolean).join(" · ") || undefined}
      className={`relative flex-1 min-w-[8.75rem] text-left px-3.5 sm:px-4 py-3.5 transition-colors border-r border-line/10 last:border-r-0 ${on ? "bg-surface-2/60" : "hover:bg-surface-2/30"}`}
    >
      <span aria-hidden className={`absolute left-0 right-0 top-0 h-[3px] bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
      <span className={`block text-[12.5px] font-semibold truncate ${on ? "text-ink" : "text-ink-soft"}`}>{meta.label}</span>
      <span className="block font-display text-[24px] sm:text-[26px] font-semibold leading-none mt-1.5 tabular-nums">{meta.format(value)}</span>
      <span className="mt-2 flex items-center gap-2 min-h-[18px]">
        {delta !== null && (
          <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 h-[18px] text-[11px] font-bold tabular-nums whitespace-nowrap flex-shrink-0 ${flat ? "text-ink-soft bg-surface-2" : good === (meta.good !== "down") ? "text-green bg-green/10" : "text-red bg-red/10"}`}>
            {!flat && (
              <svg viewBox="0 0 10 10" className={`w-2 h-2 ${delta < 0 ? "rotate-180" : ""}`} aria-hidden>
                <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
              </svg>
            )}
            {flat ? "same" : meta.rate ? `${Math.abs(delta).toFixed(1)} pts` : `${Math.abs(delta) >= 10 ? Math.round(Math.abs(delta)) : Math.abs(delta).toFixed(1)}%`}
          </span>
        )}
        {days ? <span className="ml-auto text-[10.5px] font-semibold text-ink-faint whitespace-nowrap">{days}</span> : <Spark values={now.values} on={on} />}
      </span>
    </button>
  );
}

/** Two days as a stretch: "Oct 11–12", "Sep 30 – Oct 1". */
function daysWords(days: string[]) {
  const a = days[0];
  const b = days[days.length - 1];
  if (!a || !b) return "";
  if (a === b) return niceDay(a);
  return a.slice(0, 7) === b.slice(0, 7) ? `${niceDay(a)}–${Number(b.slice(8))}` : `${niceDay(a)} – ${niceDay(b)}`;
}

/** A tiny line of the days (no axes): the shape at a glance. */
function Spark({ values, on }: { values: Num[]; on: boolean }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 3) return null;
  const max = Math.max(...pts.map((p) => p[1]));
  const min = Math.min(0, ...pts.map((p) => p[1]));
  const W = 56;
  const H = 16;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * W;
  const y = (v: number) => H - 1 - ((v - min) / (max - min || 1)) * (H - 2);
  return (
    <svg width={W} height={H} aria-hidden className="ml-auto flex-shrink-0 overflow-visible">
      <path d={pts.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("")} fill="none" stroke={on ? "rgb(var(--amber))" : "rgb(var(--ink-faint))"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function TrendChart({
  o,
  m,
  meta,
  ps,
  lines,
  setLines,
  cumulative,
  setCumulative,
  gran,
  grans,
  setGran,
  compare,
  now,
  onPick,
  allKeys,
  setKey,
}: {
  o: Overview;
  m: OvMetric;
  meta: Meta;
  ps: P[];
  lines: Lines;
  setLines: (l: Lines) => void;
  cumulative: boolean;
  setCumulative: (v: boolean) => void;
  gran: Gran;
  grans: Gran[];
  setGran: (g: Gran) => void;
  compare: boolean;
  now: number;
  /** A point clicked: every point of the chart (to step through) and which one. */
  onPick?: (points: PeriodPoint[], index: number, hourly: boolean) => void;
  allKeys: OvKey[];
  setKey: (k: OvKey) => void;
}) {
  const rate = !!meta.rate;
  const withData = ps.filter((p) => m.per[p]?.now.some((v) => v !== null));
  const canKind = !!m.split && ps.includes("youtube");
  const mode: Lines = lines === "kind" && !canKind ? "together" : lines === "platform" && withData.length < 2 ? "together" : lines;
  // In the 48 hours, a number that only comes per day (1.22.0): its two days, as columns.
  const perDay = !!m.days;
  const points = useMemo(() => m.days ?? o.points, [m.days, o.points]);
  const hours = o.hourly && !perDay;
  const run = cumulative && !rate && !perDay;

  // Buckets: hours as they are; days, weeks or months.
  const buckets = useMemo<TrendBucket[]>(
    () =>
      hours
        ? points.map((at, i) => ({ key: at, label: new Date(at).toLocaleTimeString("en-US", { hour: "numeric" }), tip: `${hourRange(Date.parse(at), now)}${i === points.length - 1 ? " (so far)" : ""}`, idx: [i] }))
        : bucketDays(points, perDay || gran === "hour" ? "day" : gran),
    [hours, perDay, points, gran, now]
  );
  const shape = (values: Num[], weights: Num[] | null) => {
    const r = rollup(values, buckets, rate ? (weights ?? undefined) : undefined);
    return run ? runningTotal(r) : r;
  };
  // The points worked out from the account's totals (hour by hour, views): a running total stays so from the first one on.
  const estOf = (flags: boolean[] | undefined) => {
    if (!flags?.some(Boolean)) return undefined;
    const per = buckets.map((b) => b.idx.some((i) => flags[i]));
    let seen = false;
    return run ? per.map((f) => (seen = seen || f)) : per;
  };
  const estFor = (list: P[]) => (m.est ? estOf(points.map((_, i) => list.some((p) => !!m.est?.[p]?.[i]))) : undefined);
  let series: Series[] = [];
  let previous: { label: string; values: Num[] } | null = null;
  if (mode === "platform") {
    series = withData.map((p) => ({ key: p, label: PLATFORM[p].name, color: PLATFORM[p].color, values: shape(m.per[p]!.now, m.weights?.[p]?.now ?? null), est: estOf(m.est?.[p]) }));
  } else if (mode === "kind" && m.split) {
    series = [
      { key: "shorts", label: "Shorts", color: SHORT_COLOR, values: shape(m.split.shorts.now, m.split.wShorts?.now ?? null) },
      { key: "long", label: "Long videos", color: LONG_COLOR, values: shape(m.split.long.now, m.split.wLong?.now ?? null) },
      ...(m.split.live ? [{ key: "live", label: "Live streams", color: LIVE_COLOR, values: shape(m.split.live.now, m.split.wLive?.now ?? null) }] : []),
    ];
  } else {
    const a = combine(m, ps, rate, "now");
    const b = combine(m, ps, rate, "prev");
    const color = withData.length === 1 ? PLATFORM[withData[0]].color : TOTAL_COLOR;
    series = [{ key: "total", label: meta.label, color, values: shape(a.values, a.weights), est: estFor(withData) }];
    if (compare && !perDay && fairBefore(a.values, b.values)) previous = { label: o.hourly ? "48 hours before" : "Before", values: shape(b.values, b.weights) };
  }
  const has = series.some((s) => s.values.some((v) => v !== null));
  const anyEstimated = series.some((s) => s.est?.some(Boolean));
  // Videos posted in each bucket: one icon under it, listing them (1.22.0).
  const bucketOf = new Map<number, number>();
  buckets.forEach((b, bi) => b.idx.forEach((i) => bucketOf.set(i, bi)));
  const marksBy = new Map<number, Mark[]>();
  if (!perDay)
    for (const mk of o.markers) {
      if (!ps.includes(mk.platform as P)) continue;
      const bi = bucketOf.get(mk.i);
      if (bi === undefined) continue;
      marksBy.set(bi, [
        ...(marksBy.get(bi) ?? []),
        { title: mk.title || "Untitled", kind: mk.kind, id: `${mk.platform}:${mk.id}`, platform: mk.platform, thumbnail: mk.thumbnail, at: mk.at, href: videoHref(mk, "overview") },
      ]);
    }
  const markKinds = (["short", "long", "live", "post"] as const).filter((k) => [...marksBy.values()].some((xs) => xs.some((x) => x.kind === k)));
  // The best point (not for running totals).
  const best = !run && series.length === 1 ? series[0].values.reduce<{ i: number; v: number } | null>((b, v, i) => (v !== null && (!b || v > b.v) ? { i, v } : b), null) : null;
  const unit = hours ? "hour" : perDay || gran === "day" ? "day" : gran === "week" ? "week" : "month";

  // Every point as a stretch of time with the chart's numbers there, for the dialog (any number, any grouping).
  const pickPoints = (): PeriodPoint[] => {
    const all = combine(m, ps, rate, "now");
    const tot = rollup(all.values, buckets, rate ? (all.weights ?? undefined) : undefined);
    const per = new Map(withData.map((p) => [p, rollup(m.per[p]!.now, buckets, rate ? (m.weights?.[p]?.now ?? undefined) : undefined)]));
    const est = hours ? estFor(withData) : undefined;
    return buckets.map((b, bi) => {
      const a = points[b.idx[0]];
      const z = points[b.idx[b.idx.length - 1]];
      const day = !hours && a === z;
      return {
        from: a,
        to: hours ? new Date(Date.parse(a) + 3_600_000).toISOString() : z,
        title: day ? new Date(`${a}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : b.tip,
        short: hours ? b.label : day ? niceDay(a) : daysWords([a, z]),
        total: tot[bi] ?? null,
        per: Object.fromEntries(withData.map((p) => [p, per.get(p)?.[bi] ?? null])),
        estimated: !!est?.[bi],
      };
    });
  };
  const pick = onPick ? (i: number) => onPick(pickPoints(), i, hours) : undefined;

  return (
    <div>
      <div className="flex items-start gap-x-3 gap-y-2.5 mb-3 flex-wrap">
        <div className="flex-1 basis-56 min-w-0">
          <h3 className="text-[14.5px] font-semibold">
            {meta.label} {run ? "· running total" : `per ${unit}`}
          </h3>
          <p className="text-[12px] text-ink-faint mt-0.5 first-letter:uppercase">
            {[
              meta.hint && mode !== "kind" && !(mode === "together" && withData.length === 1) ? meta.hint : null,
              mode === "platform" ? "by platform" : mode === "kind" ? `YouTube Shorts next to long videos${m.split?.live ? " and live streams" : ""}` : withData.length > 1 ? "all platforms together" : (PLATFORM[withData[0] ?? ps[0]]?.name ?? null),
              perDay ? `${daysWords(points)}, the last two days copied` : null,
              previous ? "dashed grey: the same stretch before" : compare && mode === "together" && !perDay ? "nothing to compare with before yet" : null,
              pick ? `click ${unit === "hour" ? "an" : "a"} ${unit} for its videos` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(withData.length > 1 || canKind) && (
            <Seg
              value={mode}
              onChange={(v) => setLines(v as Lines)}
              label="Lines"
              options={[
                { value: "together", label: "Together" },
                ...(withData.length > 1 ? [{ value: "platform", label: "By platform" }] : []),
                ...(canKind ? [{ value: "kind", label: m.split?.live ? "By kind" : "Shorts · long" }] : []),
              ]}
            />
          )}
          {!rate && !perDay && (
            <Seg
              value={run ? "run" : "per"}
              onChange={(v) => setCumulative(v === "run")}
              label="Show"
              options={[
                { value: "per", label: `Per ${unit}` },
                { value: "run", label: "Running total" },
              ]}
            />
          )}
          {grans.length > 1 && !perDay && (
            <Seg
              value={gran}
              onChange={(v) => setGran(v as Gran)}
              label="Group by"
              options={grans.map((g) => ({ value: g, label: g === "day" ? "Days" : g === "week" ? "Weeks" : g === "month" ? "Months" : "Hours" }))}
            />
          )}
          {allKeys.filter((k) => !CARDS.includes(k)).length > 0 && (
            <div className="w-[9.5rem]">
              <Select
                value={CARDS.includes(m.key) ? null : m.key}
                onChange={(v) => v && setKey(v as OvKey)}
                ariaLabel="More numbers"
                placeholder="More numbers"
                className="!h-7 !text-[12px]"
                menuMinWidth={200}
                options={allKeys.filter((k) => !CARDS.includes(k)).map((k) => ({ value: k, label: metaFor(k, o.currency).label }))}
              />
            </div>
          )}
        </div>
      </div>
      {series.length > 1 && (
        <div className="mb-2">
          <Legend shape={perDay ? "rect" : "line"} items={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))} />
        </div>
      )}
      {has ? (
        perDay ? (
          <StackedColumns
            ariaLabel={`${meta.label} per day`}
            labels={buckets.map((b) => b.label)}
            tips={buckets.map((b) => b.tip)}
            series={(rate || mode !== "platform" ? series.slice(0, 1) : series).map((x) => ({ key: x.key, label: x.label, color: x.color, values: x.values.map((v) => v ?? 0) }))}
            format={meta.format}
            showTotal={!rate && mode === "platform" && series.length > 1}
            height={280}
            onPick={pick}
            pickHint="Click for this day's videos"
          />
        ) : (
          <LineChart
            ariaLabel={`${meta.label} ${run ? "running total" : `per ${unit}`}`}
            labels={buckets.map((b) => b.label)}
            tips={buckets.map((b) => b.tip)}
            series={series}
            previous={previous}
            format={meta.format}
            height={280}
            area={series.length === 1}
            marks={[...marksBy.entries()].map(([i, items]) => ({ i, items }))}
            markDays={!hours}
            onPick={pick}
            pickHint={`Click for this ${unit}'s videos`}
          />
        )
      ) : (
        <p className="py-20 text-center text-[13px] text-ink-faint">No {meta.label.toLowerCase()} {hours ? "in these hours" : "on these days"} yet.</p>
      )}
      <div className="mt-2 flex items-center gap-x-5 gap-y-1 flex-wrap text-[11.5px] text-ink-faint">
        {markKinds.length > 0 && (
          <span className="inline-flex items-center gap-1">
            {markKinds.map((k) => (
              <MarkIcon key={k} kind={k} />
            ))}
            <span className="ml-0.5">videos posted: point at one for the list</span>
          </span>
        )}
        {best && best.v > 0 && (
          <span>
            Best {unit}: <b className="text-ink-soft">{buckets[best.i]?.tip}</b> ({meta.format(best.v)})
          </span>
        )}
        {anyEstimated && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="2" aria-hidden className="overflow-visible">
              <line x1="1" x2="15" y1="1" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" />
            </svg>
            estimated from the channel&rsquo;s total views (every video wasn&rsquo;t counted yet)
          </span>
        )}
        {hours && !anyEstimated && o.since && Date.now() - Date.parse(o.since) < 96 * 3_600_000 && <span>Counting since {ago(o.since, Date.now())}: the hours before that are empty.</span>}
        {perDay && <span>{meta.label} only comes per day, so the 48 hours show the last two days copied.</span>}
      </div>
    </div>
  );
}

function Seg({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line/15 p-0.5">
      {options.map((x) => (
        <button
          key={x.value}
          type="button"
          role="radio"
          aria-checked={value === x.value}
          onClick={() => onChange(x.value)}
          className={`px-2.5 h-7 rounded-md text-[12px] font-semibold whitespace-nowrap transition-colors ${value === x.value ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}

/** What got the most views in the range (Lifetime: since each was posted), like YouTube Studio's top content. */
function TopContent({ top, words, hourly, lifetime, ps, hrefContent }: { top: Promise<OvTopResult>; words: string; hourly: boolean; lifetime: boolean; ps: P[]; hrefContent: string }) {
  const r = use(top);
  const items = r.items.filter((i) => ps.includes(i.platform as P)).slice(0, 10);
  const max = Math.max(1, ...items.map((i) => i.gained));
  const unit = hourly ? "48 hours" : lifetime ? "all time" : r.exact ? "in range" : "views";
  return (
    <section className="rounded-2xl border border-line/10 bg-surface min-w-0" aria-label="Top content">
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] font-semibold">Top content</h2>
          <p className="text-[12px] text-ink-faint mt-0.5">{lifetime ? "Most views since each one was posted" : r.exact ? `Most views ${words}` : `Most viewed of the videos posted ${words}`}</p>
        </div>
        <Link href={hrefContent} scroll={false} className="flex-shrink-0 text-[12.5px] font-semibold text-amber hover:underline mt-0.5">
          Every video →
        </Link>
      </div>
      {items.length ? (
        <>
          <div className="hidden sm:grid grid-cols-[1.25rem_minmax(0,1fr)_6.5rem] gap-3 px-5 pb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            <span />
            <span>Content</span>
            <span className="text-right">Views · {unit}</span>
          </div>
          <ol className="pb-2">
            {items.map((v, i) => (
              <li key={`${v.platform}:${v.id}`} className="border-t border-line/10 first:border-t-0 sm:first:border-t">
                <Link href={videoHref(v, "overview")} className="grid grid-cols-[1rem_3.5rem_minmax(0,1fr)_auto] sm:grid-cols-[1.25rem_4.5rem_minmax(0,1fr)_6.5rem] items-center gap-2.5 sm:gap-3 px-4 sm:px-5 py-2 hover:bg-surface-2/50 transition-colors">
                  <span className="text-[11.5px] font-bold text-ink-faint tabular-nums text-right">{i + 1}</span>
                  <VideoThumb v={v} className="w-14 h-8 sm:w-[4.5rem] sm:h-10" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{v.title || "Untitled"}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint min-w-0">
                      {v.kind !== "post" && <MarkIcon kind={v.kind} className="w-3 h-3" />}
                      <span className="truncate">
                        {KIND_LABEL[v.kind]}
                        {v.publishedAt ? ` · ${niceDay(v.publishedAt.slice(0, 10), true)}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="text-right min-w-[4.5rem]">
                    <span className="block text-[13.5px] font-bold tabular-nums">{fmtCompact(v.gained)}</span>
                    <span className="mt-1 ml-auto block h-1 w-full max-w-[6rem] rounded-[2px] bg-line/[0.07] overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-[2px] ml-auto" style={{ width: `${Math.max(4, (v.gained / max) * 100)}%`, background: PLATFORM[v.platform as P]?.color ?? TOTAL_COLOR }} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="px-4 sm:px-5 pb-4 text-[13px] text-ink-faint">Nothing got views {words} yet.</p>
      )}
    </section>
  );
}

function VideoThumb({ v, className }: { v: ContentItem; className: string }) {
  return (
    <span className={`relative rounded-md overflow-hidden bg-surface-2 flex-shrink-0 block ${className}`}>
      {v.thumbnail && (
        <>
          {!isWide(v.kind) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.thumbnail} alt="" aria-hidden loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-60" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className={`relative w-full h-full ${isWide(v.kind) ? "object-cover" : "object-contain"}`} />
        </>
      )}
      <PlatformIcon platform={v.platform} className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-[4px]" />
    </span>
  );
}

/**
 * The newest videos one at a time, like YouTube Studio's "Latest content":
 * the picture, how it's doing next to the usual for its kind, its numbers so
 * far, and a way into its own analytics; ‹ › (or swipe) for the next ones.
 */
function LatestContent({ items, now, hrefContent }: { items: ContentItem[]; now: number; hrefContent: string }) {
  const list = items.slice(0, 6);
  const [at, setAt] = useState(0);
  const i = Math.min(at, Math.max(0, list.length - 1));
  const v = list[i];
  const [touch, setTouch] = useState<number | null>(null);
  const go = (d: number) => setAt((x) => (list.length ? (x + d + list.length) % list.length : 0));
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0" aria-label="Latest content" aria-roledescription="carousel">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-semibold flex-1 min-w-0">Latest content</h2>
        {list.length > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => go(-1)} aria-label="The newer one" className="w-7 h-7 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="text-[11.5px] font-semibold text-ink-soft tabular-nums min-w-[2.75rem] text-center" aria-live="polite">
              {i + 1} of {list.length}
            </span>
            <button type="button" onClick={() => go(1)} aria-label="The one before" className="w-7 h-7 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      {v ? (
        <div
          key={`${v.platform}:${v.id}`}
          className="mt-3 animate-[fadein_.25s_ease_both]"
          onTouchStart={(e) => setTouch(e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const x = e.changedTouches[0]?.clientX;
            if (touch !== null && x !== undefined && Math.abs(x - touch) > 40) go(x < touch ? 1 : -1);
            setTouch(null);
          }}
        >
          <Link href={videoHref(v, "overview")} className="group block">
            <span className="relative block">
              <VideoThumb v={v} className="w-full aspect-video !rounded-xl" />
              {v.score !== null && v.score !== undefined && <ScoreBadge score={v.score} className="absolute top-2 left-2 shadow-sm !bg-surface/95" />}
            </span>
            <span className="block mt-2.5 text-[14px] font-semibold leading-snug line-clamp-2 group-hover:underline">{v.title || "Untitled"}</span>
          </Link>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-faint min-w-0">
            {v.kind !== "post" && <MarkIcon kind={v.kind} className="w-3.5 h-3.5" />}
            <span className="truncate">
              {KIND_LABEL[v.kind]} · {PLATFORM[v.platform as P]?.name ?? v.platform} · {v.publishedAt ? `posted ${ago(v.publishedAt, now)}` : "–"}
            </span>
          </p>
          {v.score !== null && v.score !== undefined && v.typical ? (
            <p className="mt-2 text-[12.5px] text-ink-soft">
              <b className="text-ink">{scoreText(v.score)}</b> your usual {KIND_LABEL[v.kind].toLowerCase()} on {PLATFORM[v.platform as P]?.name ?? v.platform} ({fmtCompact(v.typical)} views)
            </p>
          ) : null}
          <dl className="mt-3 grid grid-cols-3 rounded-xl border border-line/10 overflow-hidden">
            {[
              ["Views", v.views],
              ["Likes", v.likes],
              ["Comments", v.comments],
            ].map(([label, value]) => (
              <div key={label as string} className="px-3 py-2 border-r border-line/10 last:border-r-0 min-w-0">
                <dt className="text-[11px] text-ink-faint">{label}</dt>
                <dd className="text-[16px] font-semibold tabular-nums">{fmtCompact(value as number | null)}</dd>
              </div>
            ))}
          </dl>
          {v.platform === "youtube" && (v.impressions !== null && v.impressions !== undefined) && (
            <p className="mt-2 text-[11.5px] text-ink-faint tabular-nums">
              {fmtCompact(v.impressions)} impressions{v.ctr !== null && v.ctr !== undefined ? ` · ${v.ctr.toFixed(1)}% click-through` : ""}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Link href={videoHref(v, "overview")} className="inline-flex items-center gap-1 rounded-lg bg-ink text-paper px-3 h-8 text-[12.5px] font-semibold hover:opacity-90">
              Its analytics
              <span aria-hidden>→</span>
            </Link>
            <Link href={hrefContent} scroll={false} className="text-[12.5px] font-semibold text-amber hover:underline">
              All content
            </Link>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-ink-faint">No videos yet.</p>
      )}
    </section>
  );
}

const TONE = {
  good: { d: "M4 12.5 9.5 7l3 3L18 4.5M18 4.5h-4.5M18 4.5V9", c: "text-green bg-green/10" },
  bad: { d: "M4 7.5 9.5 13l3-3L18 15.5M18 15.5h-4.5M18 15.5V11", c: "text-coral bg-coral/10" },
  info: { d: "M10 9v5M10 6.2v.1", c: "text-blue bg-blue/10" },
} as const;
export function ToneIcon({ tone }: { tone: "good" | "bad" | "info" }) {
  return (
    <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${TONE[tone].c}`} aria-hidden>
      <svg viewBox="0 0 22 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={TONE[tone].d} />
      </svg>
    </span>
  );
}

function InsightsCard({ p, href }: { p: Promise<InsightsPreview>; href: string }) {
  const i = use(p);
  const items = [
    ...i.alerts.map((a) => ({ key: a.id, tone: a.tone, title: a.title, tip: a.tip, platform: a.platform })),
    ...i.findings.map((f) => ({ key: f.id, tone: f.tone, title: f.title, tip: tipFor(f), platform: f.platform })),
  ].slice(0, 4);
  return (
    <ChartCard title="Insights" sub="What changed lately, and what works in your videos">
      {items.length ? (
        <ul className="space-y-3">
          {items.map((x) => (
            <li key={x.key} className="flex gap-2.5 min-w-0">
              <ToneIcon tone={x.tone} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-snug flex items-start gap-1.5">
                  {x.platform && <PlatformIcon platform={x.platform as SocialPlatform} className="w-4 h-4 rounded mt-px flex-shrink-0" />}
                  <span className="min-w-0">{x.title}</span>
                </p>
                {x.tip && <p className="text-[12px] text-ink-soft leading-snug mt-0.5">{x.tip}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-faint">Nothing stands out yet. Hints show up as videos settle (a week after posting).</p>
      )}
      <Link href={href} scroll={false} className="mt-3 inline-block text-[12.5px] font-semibold text-amber hover:underline">
        All insights →
      </Link>
    </ChartCard>
  );
}

function WhereViews({ m, ps, compare }: { m: OvMetric; ps: P[]; compare: boolean }) {
  const rows = ps
    .filter((p) => m.per[p])
    .map((p) => ({ p, now: total(m.per[p]!.now) ?? 0, prev: total(m.per[p]!.prev) }))
    .filter((r) => r.now > 0 || (r.prev ?? 0) > 0)
    .sort((a, b) => b.now - a.now);
  const all = rows.reduce((t, r) => t + r.now, 0);
  if (rows.length < 2) return null;
  return (
    <ChartCard title="Views by platform" sub="Each platform's share of the views in this range">
      <div className="flex h-3 rounded-[4px] overflow-hidden gap-[2px]" role="img" aria-label={rows.map((r) => `${PLATFORM[r.p].name} ${Math.round((r.now / Math.max(1, all)) * 100)}%`).join(", ")}>
        {rows.map((r) => (
          <span key={r.p} style={{ width: `${(r.now / Math.max(1, all)) * 100}%`, background: PLATFORM[r.p].color }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {rows.map((r) => {
          const ch = compare && fairBefore(m.per[r.p]!.now, m.per[r.p]!.prev) ? change(r.now, r.prev) : null;
          return (
            <li key={r.p} className="flex items-center gap-2 text-[13px]">
              <PlatformIcon platform={r.p} className="w-5 h-5 rounded" />
              <span className="flex-1 min-w-0 truncate text-ink-soft">{PLATFORM[r.p].name}</span>
              <span className="font-semibold tabular-nums">{fmtCompact(r.now)}</span>
              <span className="w-11 text-right text-[12px] text-ink-faint tabular-nums">{Math.round((r.now / Math.max(1, all)) * 100)}%</span>
              {compare && (
                <span className={`w-14 text-right text-[11.5px] font-semibold tabular-nums ${ch === null ? "text-ink-faint" : ch >= 0 ? "text-green" : "text-red"}`}>
                  {ch === null ? "–" : `${ch >= 0 ? "+" : "−"}${Math.abs(ch) >= 10 ? Math.round(Math.abs(ch)) : Math.abs(ch).toFixed(1)}%`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

/**
 * YouTube's views, Shorts apart from long videos (1.20.0): the three numbers
 * (all of YouTube, Shorts, long videos) with their share and change, and a
 * chart of both stacked per day / week / month (the stack is YouTube's
 * total), or each one's share of the views over time. 1.22.0: live streams
 * are their own kind (YouTube's LIVE_STREAM used to count as a long video).
 */
function YouTubeKinds({ m, points, compare, words, channel, lifetime }: { m: OvMetric; points: string[]; compare: boolean; words: string; channel: Overview["youtube"]; lifetime: boolean }) {
  const split = m.split!;
  const yt = m.per.youtube;
  const grans = gransFor(points.length, false);
  const [gran, setGran] = useState<Gran>(defaultGran(points.length, false));
  const [view, setView] = useState<"views" | "share" | "lines">("views");
  useEffect(() => setGran(defaultGran(points.length, false)), [points.length]);
  const g = grans.includes(gran) ? gran : grans[0];
  const buckets = useMemo(() => bucketDays(points, g === "hour" ? "day" : g), [points, g]);
  const kinds = [
    { key: "shorts", label: "Shorts", color: SHORT_COLOR, s: split.shorts },
    { key: "long", label: "Long videos", color: LONG_COLOR, s: split.long },
    ...(split.live ? [{ key: "live", label: "Live streams", color: LIVE_COLOR, s: split.live }] : []),
  ];
  const sums = kinds.map((k) => ({ ...k, now: total(k.s.now), prev: total(k.s.prev) }));
  const both = sums.reduce((t, k) => t + (k.now ?? 0), 0);
  // YouTube's own total (it can include a little more than the kinds: stories, and days before YouTube split them).
  const tN = yt ? total(yt.now) : both || null;
  const tP = yt ? total(yt.prev) : sums.reduce((t, k) => t + (k.prev ?? 0), 0) || null;
  const delta = (now: Num, prev: Num, a: Num[], b: Num[]) => (compare && fairBefore(a, b) ? change(now, prev) : null);
  const rolled = kinds.map((k) => rollup(k.s.now, buckets));
  const sharesAt = (i: number) => {
    const t = rolled.reduce((a, r) => a + (r[i] ?? 0), 0);
    return rolled.map((r) => (t > 0 ? ((r[i] ?? 0) / t) * 100 : 0));
  };
  const tiles: { key: string; label: string; value: Num; share: number | null; ch: Num; color: string | null }[] = [
    { key: "all", label: "YouTube views", value: tN, share: null, ch: delta(tN, tP, yt?.now ?? split.shorts.now, yt?.prev ?? split.shorts.prev), color: null },
    ...sums.map((k) => ({ key: k.key, label: k.label, value: k.now, share: both ? ((k.now ?? 0) / both) * 100 : null, ch: delta(k.now, k.prev, k.s.now, k.s.prev), color: k.color })),
  ];
  const unit = g === "week" ? "week" : g === "month" ? "month" : "day";
  const fmtPct = (n: number | null) => (n === null ? "–" : `${Math.round(n)}%`);
  const names = kinds.map((k) => k.label.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1");
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0" aria-label="YouTube: Shorts, long videos and live streams">
      <div className="flex items-start gap-x-3 gap-y-2.5 mb-4 flex-wrap">
        <div className="flex-1 basis-60 min-w-0">
          <h2 className="text-[14.5px] font-semibold flex items-center gap-2">
            <PlatformIcon platform="youtube" className="w-5 h-5 rounded" />
            {split.live ? "Shorts, long videos and live streams" : "Shorts vs long videos"}
          </h2>
          <p className="text-[12px] text-ink-faint mt-0.5">YouTube views {words}, {names} apart</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Seg
            value={view}
            onChange={(v) => setView(v as typeof view)}
            label="Show"
            options={[
              { value: "views", label: "Views" },
              { value: "lines", label: "Side by side" },
              { value: "share", label: "Share" },
            ]}
          />
          {grans.length > 1 && (
            <Seg value={g} onChange={(v) => setGran(v as Gran)} label="Group by" options={grans.map((x) => ({ value: x, label: x === "day" ? "Days" : x === "week" ? "Weeks" : "Months" }))} />
          )}
        </div>
      </div>
      <div className={`grid gap-px rounded-xl border border-line/10 bg-line/10 overflow-hidden mb-4 ${tiles.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {tiles.map((t) => (
          <div key={t.key} className="bg-surface px-3 sm:px-4 py-3 min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] text-ink-soft min-w-0">
              {t.color && <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: t.color }} aria-hidden />}
              <span className="truncate">{t.label}</span>
            </div>
            <div className="font-display text-[22px] sm:text-[26px] font-semibold leading-tight tabular-nums mt-0.5" title={t.value !== null ? fmtInt(t.value) : undefined}>
              {fmtCompact(t.value)}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5 min-h-[18px]">
              {t.share !== null && <span className="text-[11.5px] text-ink-faint tabular-nums">{Math.round(t.share)}% of views</span>}
              {t.ch !== null && (
                <span className={`text-[11px] font-bold tabular-nums ${Math.abs(t.ch) < 0.5 ? "text-ink-faint" : t.ch > 0 ? "text-green" : "text-red"}`}>
                  {Math.abs(t.ch) < 0.5 ? "same" : `${t.ch > 0 ? "+" : "−"}${Math.abs(t.ch) >= 10 ? Math.round(Math.abs(t.ch)) : Math.abs(t.ch).toFixed(1)}%`}
                </span>
              )}
              {t.key === "all" && channel?.totalViews !== null && channel?.totalViews !== undefined && !lifetime && (
                <span className="text-[11.5px] text-ink-faint tabular-nums" title="Every view the channel ever got, as YouTube counts it now">
                  {t.ch !== null ? "· " : ""}
                  {fmtCompact(channel.totalViews)} all-time
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {rolled.some((r) => r.some((v) => (v ?? 0) > 0)) ? (
        view === "lines" ? (
          <LineChart
            ariaLabel={`YouTube ${names} views per ${unit}`}
            labels={buckets.map((b) => b.label)}
            tips={buckets.map((b) => b.tip)}
            series={kinds.map((k, i) => ({ key: k.key, label: k.label, color: k.color, values: rolled[i] }))}
            height={240}
          />
        ) : (
          <StackedColumns
            ariaLabel={view === "share" ? `Each kind's share of YouTube views per ${unit}` : `YouTube views per ${unit}: ${names}`}
            labels={buckets.map((b) => b.label)}
            tips={buckets.map((b) => b.tip)}
            series={kinds.map((k, i) => ({ key: k.key, label: k.label, color: k.color, values: view === "share" ? buckets.map((_, bi) => sharesAt(bi)[i]) : rolled[i].map((v) => v ?? 0) }))}
            format={view === "share" ? fmtPct : fmtCompact}
            showTotal={view !== "share"}
            height={240}
          />
        )
      ) : (
        <p className="py-14 text-center text-[13px] text-ink-faint">YouTube hasn&rsquo;t split these days by kind yet.</p>
      )}
      <div className="mt-2">
        <Legend shape={view === "lines" ? "line" : "rect"} items={kinds.map((k) => ({ key: k.key, label: k.label, color: k.color }))} />
      </div>
    </section>
  );
}

function ListSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5" aria-label={title} aria-busy>
      <div className="skeleton h-4 w-32 rounded" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-16 h-9 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-2 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The Overview as a CSV: each day (or hour) with every number, all platforms together and each one. */
export function overviewCsv(o: Overview): (string | number | null)[][] {
  const head: string[] = [o.hourly ? "Hour" : "Date"];
  const cols: Num[][] = [];
  // (In the 48 hours, the numbers that only come per day aren't hours: left out.)
  for (const m of o.metrics.filter((x) => !x.days)) {
    const meta = metaFor(m.key, o.currency);
    const ps = ALL_P.filter((p) => m.per[p]);
    const all = combine(m, ps, !!meta.rate, "now");
    head.push(`${meta.label}${m.key === "revenue" && o.currency ? ` (${o.currency})` : ""}`);
    cols.push(all.values);
    if (ps.length > 1)
      for (const p of ps) {
        head.push(`${meta.label} · ${PLATFORM[p].name}`);
        cols.push(m.per[p]!.now);
      }
  }
  const round = (v: Num) => (v === null ? null : Math.round(v * 100) / 100);
  return [head, ...o.points.map((d, i) => [o.hourly ? d.slice(0, 16).replace("T", " ") : d, ...cols.map((c) => round(c[i] ?? null))])];
}
