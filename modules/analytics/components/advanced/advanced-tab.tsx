"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { Mascot } from "@/components/ui/mascot";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { AdvancedData, Content } from "../../lib/advanced";
import { TIKTOK_MORE } from "../../lib/advanced-labels";
import type { SocialPlatform } from "@/lib/social/providers";
import { ChartCard, Legend, LineChart } from "../charts";
import { MetricGroups } from "./metric-groups";
import { RetentionChart } from "./retention-chart";
import { Breakdown, byCardHeight } from "./breakdowns";
import { VideoTable } from "./videos";
import { BestPerforming } from "./best";
import { formatValue, niceDay, pctOf } from "./format";
import { ADV_VIEWS, ADV_VIEW_LABEL, type AdvView } from "./views";
import { SparkleIcon } from "./sparkle";

export { SparkleIcon };

const NAME: Record<SocialPlatform, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
const SHORT_COLOR = "rgb(var(--chart-short))";
const LONG_COLOR = "rgb(var(--chart-long))";


export function AdvancedTab({
  teamId,
  data,
  compare,
  view: initialView,
  viewHref,
  onPlatform,
  onContent,
  onDownload,
  insightsHref,
}: {
  teamId: string;
  data: AdvancedData;
  compare: boolean;
  /** Which of Advanced's own tabs (`?view=`). */
  view: AdvView;
  viewHref: (v: AdvView) => string;
  onPlatform: (p: SocialPlatform) => void;
  onContent: (c: Content) => void;
  onDownload: () => void;
  /** "What works" lives in Insights (1.20.0). */
  insightsHref: string;
}) {
  const p = data.platform;
  const usable = data.platforms.find((x) => x.platform === p)?.usable ?? false;
  const has: Record<AdvView, boolean> = {
    summary: data.groups.length > 0,
    trends: data.series.length > 0,
    best: data.videos.length > 0,
    retention: !!data.retention,
    traffic: data.breakdowns.some((b) => TRAFFIC.includes(b.id)),
    audience: data.breakdowns.some((b) => !TRAFFIC.includes(b.id)),
    videos: true,
  };
  const views = ADV_VIEWS.filter((v) => has[v]);
  // The tabs switch here (everything is loaded); the address keeps the one shown.
  const [view, setViewState] = useState<AdvView>(initialView);
  useEffect(() => setViewState(initialView), [initialView]);
  const shown: AdvView = views.includes(view) ? view : (views[0] ?? "videos");
  const setView = (v: AdvView) => {
    setViewState(v);
    try {
      window.history.replaceState(window.history.state, "", viewHref(v));
    } catch {}
  };

  return (
    <div className="space-y-5">
      {/* Which platform, which videos, and the export. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Platform">
          {data.platforms.map((x) => {
            const on = x.platform === p;
            return (
              <button
                key={x.platform}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPlatform(x.platform)}
                className={`inline-flex items-center gap-2 rounded-lg border pl-1 pr-3 h-9 text-[13px] font-semibold transition-colors ${
                  on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)] text-ink" : "border-line/15 bg-surface/50 text-ink-soft hover:text-ink hover:bg-surface"
                }`}
              >
                <PlatformIcon platform={x.platform} className={`w-7 h-7 rounded-md ${x.usable ? "" : "opacity-40 grayscale"}`} />
                {NAME[x.platform]}
              </button>
            );
          })}
        </div>
        {p === "youtube" && usable && (
          <Segmented<Content>
            value={data.content}
            onChange={onContent}
            ariaLabel="Videos"
            options={[
              { value: "all", label: "Everything" },
              { value: "shorts", label: "Shorts" },
              { value: "long", label: "Long videos" },
              // 1.22.0: live streams apart (YouTube used to count them as long videos).
              { value: "live", label: "Live streams" },
            ]}
          />
        )}
        <span className="flex-1" />
        <button type="button" onClick={onDownload} className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] hover:brightness-110 shadow-sm">
          <SparkleIcon />
          Download for Claude
        </button>
      </div>

      {!usable ? (
        <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
          <Mascot mood="idle" size={100} className="flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-[22px] font-semibold">{NAME[p]} isn&rsquo;t sharing numbers yet</h2>
            <p className="mt-2 text-[14px] text-ink-soft max-w-xl">
              Connect it in{" "}
              <Link href="/team?tab=accounts" className="font-semibold text-amber hover:underline">
                Team → Connected accounts
              </Link>{" "}
              (or reconnect it once so it may read stats). Everything here fills in with the next morning&rsquo;s copy.
            </p>
          </div>
        </div>
      ) : !data.hasData ? (
        <p className="rounded-2xl border border-dashed border-line/20 py-12 px-6 text-center text-[13.5px] text-ink-soft">
          No {NAME[p]} numbers for these days yet. They come with the morning copy (or press Sync now).
        </p>
      ) : (
        <>
          <nav aria-label="Advanced" className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 border-b border-line/10">
            {views.map((v) => (
              <a
                key={v}
                href={viewHref(v)}
                aria-current={shown === v ? "page" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  setView(v);
                }}
                className={`relative px-2.5 h-9 inline-flex items-center text-[13px] font-semibold whitespace-nowrap transition-colors ${shown === v ? "text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {ADV_VIEW_LABEL[v]}
                <span aria-hidden className={`absolute left-1.5 right-1.5 -bottom-px h-[2px] rounded-[2px] bg-ink transition-opacity ${shown === v ? "opacity-100" : "opacity-0"}`} />
              </a>
            ))}
          </nav>
          {data.notes.length > 0 && (
            <ul className="-mt-2 space-y-0.5 text-[12px] text-ink-faint">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          {shown === "summary" && (
            <Section id="glance" title="At a glance" sub={`${niceDay(data.days[0])} – ${niceDay(data.days[data.days.length - 1], true)}${compare ? ", next to the same stretch before" : ""}`}>
              <MetricGroups groups={data.groups} compare={compare} currency={data.currency} />
              <p className="mt-4 text-[12.5px] text-ink-soft">
                Patterns in these videos (length, posting time, titles, hooks) and what changed lately are in{" "}
                <Link href={insightsHref} className="font-semibold text-amber hover:underline">
                  Insights →
                </Link>
              </p>
            </Section>
          )}

          {shown === "trends" && (
            <Section id="daily" title="Day by day" sub="Any number, every day of the range">
              <DailyChart data={data} compare={compare} />
            </Section>
          )}

          {shown === "best" && (
            <Section id="best" title="Best performing" sub={`Your top ${NAME[p]} videos by what matters. Click one for everything about it.`}>
              <BestPerforming data={data} />
            </Section>
          )}

          {shown === "retention" && (
            <Section id="retention" title="Retention" sub="Where viewers stop watching: the share still watching at each point of a video, averaged over your videos">
              <RetentionBlock data={data} />
            </Section>
          )}

          {shown === "traffic" && (
            <Section id="traffic" title="Traffic" sub="How people find the videos">
              {/* An even grid (1.21.0): every card in a row as tall as the row; lists start short. */}
              <div className="grid gap-4 lg:grid-cols-2">
                {byCardHeight(data.breakdowns.filter((b) => TRAFFIC.includes(b.id))).map((b) => (
                    <div key={b.id} className="min-w-0">
                      <Breakdown b={b} compare={compare} />
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {shown === "audience" && (
            <Section id="audience" title="Audience" sub="Who watches, on what, and where">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {byCardHeight(data.breakdowns.filter((b) => !TRAFFIC.includes(b.id))).map((b) => (
                    <div key={b.id} className="min-w-0">
                      <Breakdown b={b} compare={compare} />
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {shown === "videos" && (
            <Section id="videos" title="Videos" sub={`Every ${NAME[p]} video ClipTroop has numbers for, with everything ${NAME[p]} shares about it`}>
              <VideoTable teamId={teamId} platform={p} videos={data.videos} currency={data.currency} withMoney={data.revenueAllowed && data.videos.some((v) => v.revenue)} />
              {p === "tiktok" && <p className="mt-3 text-[12px] text-ink-faint max-w-3xl">{TIKTOK_MORE}</p>}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

const TRAFFIC = ["traffic_source", "search_term", "external_site", "suggested_by", "playlist"];

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={`adv-${id}`} className="scroll-mt-20">
      <div className="mb-3">
        <h2 className="font-display text-[21px] font-semibold leading-tight">{title}</h2>
        {sub && <p className="text-[12.5px] text-ink-soft mt-0.5">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function DailyChart({ data, compare }: { data: AdvancedData; compare: boolean }) {
  const [key, setKey] = useState(data.series[0]?.key ?? "views");
  const s = data.series.find((x) => x.key === key) ?? data.series[0];
  const labels = useMemo(() => data.days.map((d) => niceDay(d)), [data.days]);
  if (!s) return null;
  const fmt = (n: number | null) => formatValue(s.format, n, data.currency);
  return (
    <ChartCard
      title={s.label}
      sub={compare ? `Dashed: the ${data.days.length} days before` : "Per day"}
      right={
        <div className="w-[15rem] max-w-full">
          <Select value={s.key} onChange={(v) => v && setKey(v)} ariaLabel="Number to show" className="!h-8 !text-[12.5px]" menuMinWidth={260} searchable options={data.series.map((x) => ({ value: x.key, label: x.label }))} />
        </div>
      }
    >
      {s.values.some((v) => v !== null) ? (
        <LineChart ariaLabel={`${s.label} per day`} labels={labels} series={[{ key: s.key, label: s.label, color: "rgb(var(--amber))", values: s.values }]} previous={compare ? { label: "Before", values: s.prev } : null} format={fmt} />
      ) : (
        <p className="py-16 text-center text-[13px] text-ink-faint">No {s.label.toLowerCase()} per day in this range.</p>
      )}
    </ChartCard>
  );
}

function RetentionBlock({ data }: { data: AdvancedData }) {
  const r = data.retention!;
  const series = [
    ...(r.shorts.length ? [{ key: "shorts", label: `${data.platform === "facebook" ? "Reels" : "Shorts"} (${r.counts.shorts})`, color: SHORT_COLOR, values: r.shorts.map((p) => p[1]) }] : []),
    ...(r.long.length ? [{ key: "long", label: `Long videos (${r.counts.long})`, color: LONG_COLOR, values: r.long.map((p) => p[1]) }] : []),
  ];
  const facts = (label: string, s: typeof r.shortsSummary, color: string, long = false) =>
    s && (
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
          <span className="text-[12px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          {[
            long ? ["After 30 s", pctOf(s.at30s)] : ["After 3 s", pctOf(s.at3s)],
            ["Halfway", pctOf(s.at50)],
            ["At the end", pctOf(s.end)],
            ["Vs similar videos", s.relative === null ? "–" : `${Math.round(s.relative * 100)} / 100`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11.5px] text-ink-faint">{k}</dt>
              <dd className="text-[17px] font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  return (
    <ChartCard title="Still watching" sub="Hover the chart for any point · 100% = everyone who started (Shorts go above it when people rewatch)" right={<Legend items={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))} />}>
      <RetentionChart series={series} ariaLabel="Average retention" />
      <div className="mt-4 pt-4 border-t border-line/10 grid gap-5 lg:grid-cols-2">
        {facts(data.platform === "facebook" ? "Reels" : "Shorts", r.shortsSummary, SHORT_COLOR)}
        {facts("Long videos", r.longSummary, LONG_COLOR, true)}
      </div>
      <p className="mt-3 text-[11.5px] text-ink-faint">“Vs similar videos” is YouTube&rsquo;s comparison with all videos of a similar length: 50 is typical, higher keeps viewers better.</p>
    </ChartCard>
  );
}
