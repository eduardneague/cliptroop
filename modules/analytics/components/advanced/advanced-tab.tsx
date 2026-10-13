"use client";

import { useMemo, useState } from "react";
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
import { FindingCard, PatternsBlock } from "./findings";
import { RetentionChart } from "./retention-chart";
import { Breakdown } from "./breakdowns";
import { VideoTable } from "./videos";
import { BestPerforming } from "./best";
import { formatValue, niceDay, pctOf } from "./format";

const NAME: Record<SocialPlatform, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
const SHORT_COLOR = "rgb(var(--chart-short))";
const LONG_COLOR = "rgb(var(--chart-long))";

/** Sparkles: "a deeper read" (generic, no brand mark). */
export function SparkleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11 2.5c.4 3.9 2.6 6.1 6.5 6.5-3.9.4-6.1 2.6-6.5 6.5-.4-3.9-2.6-6.1-6.5-6.5 3.9-.4 6.1-2.6 6.5-6.5Z" />
      <path d="M18.5 13.5c.2 2 1.3 3.1 3.3 3.3-2 .2-3.1 1.3-3.3 3.3-.2-2-1.3-3.1-3.3-3.3 2-.2 3.1-1.3 3.3-3.3Z" opacity=".7" />
    </svg>
  );
}

export function AdvancedTab({
  teamId,
  data,
  compare,
  onPlatform,
  onContent,
  onDownload,
}: {
  teamId: string;
  data: AdvancedData;
  compare: boolean;
  onPlatform: (p: SocialPlatform) => void;
  onContent: (c: Content) => void;
  onDownload: () => void;
}) {
  const p = data.platform;
  const usable = data.platforms.find((x) => x.platform === p)?.usable ?? false;
  const sections = [
    { id: "glance", label: "At a glance", show: data.groups.length > 0 },
    { id: "best", label: "Best performing", show: data.videos.length > 0 },
    { id: "works", label: "What works", show: true },
    { id: "daily", label: "Day by day", show: data.series.length > 0 },
    { id: "retention", label: "Retention", show: !!data.retention },
    { id: "traffic", label: "Traffic", show: data.breakdowns.some((b) => TRAFFIC.includes(b.id)) },
    { id: "audience", label: "Audience", show: data.breakdowns.some((b) => !TRAFFIC.includes(b.id)) },
    { id: "videos", label: "Videos", show: true },
  ].filter((s) => s.show);

  return (
    <div className="space-y-6">
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
          {sections.length > 2 && (
            <nav aria-label="On this page" className="-mt-2 flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
              {sections.map((s) => (
                <a key={s.id} href={`#adv-${s.id}`} className="rounded-md px-2.5 h-7 inline-flex items-center text-[12px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 whitespace-nowrap">
                  {s.label}
                </a>
              ))}
            </nav>
          )}
          {data.notes.length > 0 && (
            <ul className="-mt-3 space-y-0.5 text-[12px] text-ink-faint">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          {data.groups.length > 0 && (
            <Section id="glance" title="At a glance" sub={`${niceDay(data.days[0])} – ${niceDay(data.days[data.days.length - 1], true)}${compare ? ", next to the same stretch before" : ""}`}>
              <MetricGroups groups={data.groups} compare={compare} currency={data.currency} />
            </Section>
          )}

          {data.videos.length > 0 && (
            <Section id="best" title="Best performing" sub={`Your top ${NAME[p]} videos by what matters. Click one for everything about it.`}>
              <BestPerforming data={data} />
            </Section>
          )}

          <Section id="works" title="What works" sub={`Patterns in your own ${NAME[p]} videos: no guessing, just your numbers side by side. Strongest first.`}>
            <WhatWorks data={data} onDownload={onDownload} />
          </Section>

          {data.series.length > 0 && (
            <Section id="daily" title="Day by day" sub="Any number, every day of the range">
              <DailyChart data={data} compare={compare} />
            </Section>
          )}

          {data.retention && (
            <Section id="retention" title="Retention" sub="Where viewers stop watching: the share still watching at each point of a video, averaged over your videos">
              <RetentionBlock data={data} />
            </Section>
          )}

          {data.breakdowns.some((b) => TRAFFIC.includes(b.id)) && (
            <Section id="traffic" title="Traffic" sub="How people find the videos">
              {/* Columns that fill top to bottom, so tall and short cards pack without gaps. */}
              <div className="columns-1 lg:columns-2 gap-4">
                {data.breakdowns
                  .filter((b) => TRAFFIC.includes(b.id))
                  .map((b) => (
                    <div key={b.id} className="break-inside-avoid mb-4">
                      <Breakdown b={b} compare={compare} />
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {data.breakdowns.some((b) => !TRAFFIC.includes(b.id)) && (
            <Section id="audience" title="Audience" sub="Who watches, on what, and where">
              <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
                {data.breakdowns
                  .filter((b) => !TRAFFIC.includes(b.id))
                  .map((b) => (
                    <div key={b.id} className="break-inside-avoid mb-4">
                      <Breakdown b={b} compare={compare} />
                    </div>
                  ))}
              </div>
            </Section>
          )}

          <Section id="videos" title="Videos" sub={`Every ${NAME[p]} video ClipTroop has numbers for, with everything ${NAME[p]} shares about it`}>
            <VideoTable teamId={teamId} platform={p} videos={data.videos} currency={data.currency} withMoney={data.revenueAllowed && data.videos.some((v) => v.revenue)} />
            {p === "tiktok" && <p className="mt-3 text-[12px] text-ink-faint max-w-3xl">{TIKTOK_MORE}</p>}
          </Section>
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

function WhatWorks({ data, onDownload }: { data: AdvancedData; onDownload: () => void }) {
  const p = data.patterns;
  const shortLabel = data.platform === "youtube" ? "Shorts" : data.platform === "tiktok" ? "Videos" : "Reels";
  return (
    <div className="space-y-4">
      <div className={`grid gap-5 ${p.long && p.long.considered > 0 ? "xl:grid-cols-2" : ""}`}>
        {p.short && <PatternsBlock p={p.short} label={shortLabel} />}
        {p.long && p.long.considered > 0 && <PatternsBlock p={p.long} label="Long videos" />}
      </div>
      {p.cross && (
        <ul>
          <FindingCard f={p.cross} />
        </ul>
      )}
      <div className="rounded-2xl border border-amber/30 bg-amber/[0.07] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Want a deeper read?</p>
          <p className="text-[12.5px] text-ink-soft mt-0.5">
            Download everything ClipTroop knows about these videos (numbers, retention, hooks, thumbnails) as one file, then drop it into a chat with Claude and ask what to do next. Free with any Claude plan.
          </p>
        </div>
        <button type="button" onClick={onDownload} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] hover:brightness-110 flex-shrink-0">
          <SparkleIcon />
          Download for Claude
        </button>
      </div>
    </div>
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
