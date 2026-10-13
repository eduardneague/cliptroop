"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ExternalIcon, TrophyIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { fillVideoHistory } from "@/app/(dashboard)/analytics/actions";
import type { VideoKey, VideoPageData } from "../../lib/video";
import { scoreText, scoreTone } from "../../lib/scores";
import { ChartCard, Legend, LineChart, StackedColumns } from "../charts";
import { RetentionChart } from "../advanced/retention-chart";
import { compactNum, money, niceDay, pctOf, seconds } from "../advanced/format";

/*
 * One video's analytics (1.17.0): how it did next to the team's typical
 * video of the same kind, its views since it was posted, retention, where
 * the views came from, the same short elsewhere. Advanced: every number.
 */

const NAME = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" } as const;
const KIND = { short: "Short", long: "Long video", post: "Post" } as const;
const TYPE_NAME: Record<string, string> = { filler: "Everyday short", sponsorship: "Sponsored short", big: "Big short" };
const MINE = "rgb(var(--amber))";

type Tab = "overview" | "advanced";

function fmt(k: Pick<VideoKey, "format">, v: number | null, currency: string) {
  if (v === null || !Number.isFinite(v)) return "–";
  switch (k.format) {
    case "compact":
      return compactNum(v);
    case "pct":
      return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
    case "seconds":
      return seconds(v);
    case "hours":
      return `${v < 10 ? v.toFixed(1) : compactNum(v)} h`;
    case "money":
      return money(v, currency, true);
    case "decimal":
      return v.toFixed(v < 10 ? 2 : 1);
  }
}

/** Next to typical: "2.1×" (counts), "+6 pts" (percentages); good or not. */
function versus(k: VideoKey): { text: string; tone: "good" | "bad" | "same" } | null {
  if (k.value === null || k.typical === null) return null;
  const goodUp = k.good !== "down";
  if (k.format === "pct") {
    const d = k.value - k.typical;
    if (Math.abs(d) < 0.5) return { text: "about typical", tone: "same" };
    return { text: `${d > 0 ? "+" : "−"}${Math.abs(d) < 10 ? Math.abs(d).toFixed(1) : Math.round(Math.abs(d))} pts`, tone: d > 0 === goodUp ? "good" : "bad" };
  }
  if (k.typical === 0) return k.value > 0 ? { text: "above typical", tone: goodUp ? "good" : "bad" } : null;
  const r = k.value / k.typical;
  if (r > 0.9 && r < 1.1) return { text: "about typical", tone: "same" };
  return { text: r >= 1 ? `${scoreText(r)} typical` : `${Math.round((1 - r) * 100)}% under`, tone: r > 1 === goodUp ? "good" : "bad" };
}

const toneClass = { good: "text-green bg-green/10", bad: "text-coral bg-coral/10", same: "text-ink-soft bg-surface-2" } as const;
const ago = (days: number | null) => (days === null ? "" : days === 0 ? "today" : days === 1 ? "yesterday" : days < 60 ? `${days} days ago` : days < 730 ? `${Math.round(days / 30)} months ago` : `${Math.round(days / 365)} years ago`);

export function VideoAnalytics({ teamId, data, tab: initialTab, from }: { teamId: string; data: VideoPageData; tab: Tab; from: "content" | "advanced" | "audience" | "dashboard" }) {
  const v = data.video;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [fill, setFill] = useState<"idle" | "working" | "failed">(data.canFill ? "working" : "idle");

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

  const change = (t: Tab) => {
    setTab(t);
    try {
      const url = new URL(window.location.href);
      if (t === "advanced") url.searchParams.set("tab", "advanced");
      else url.searchParams.delete("tab");
      window.history.replaceState(window.history.state, "", url);
    } catch {}
  };

  const back =
    from === "content"
      ? { href: "/analytics?tab=content", label: "Analytics · Content" }
      : from === "audience"
        ? { href: "/analytics?tab=audience", label: "Analytics · Audience" }
        : from === "dashboard"
          ? { href: "/dashboard", label: "Dashboard" }
          : { href: `/analytics?tab=advanced&platform=${v.platform}`, label: "Analytics · Advanced" };

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1400px] mx-auto space-y-5 sm:space-y-6">
      <nav className="flex items-center gap-2 text-[12.5px] text-ink-soft" aria-label="Where you are">
        <Link href={back.href} className="inline-flex items-center gap-1.5 rounded-lg px-2 h-8 -ml-2 font-semibold hover:bg-surface-2 hover:text-ink">
          <ArrowLeftIcon className="w-4 h-4" />
          {back.label}
        </Link>
      </nav>

      <Hero data={data} />

      <div className="flex items-center gap-3 flex-wrap">
        <Segmented<Tab>
          value={tab}
          onChange={change}
          ariaLabel="View"
          options={[
            { value: "overview", label: "Overview" },
            { value: "advanced", label: "Advanced" },
          ]}
        />
        {fill === "working" && (
          <span className="inline-flex items-center gap-2 text-[12px] text-ink-soft" role="status">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-amber/30 border-t-amber animate-spin" aria-hidden />
            Getting its full day-by-day history from YouTube…
          </span>
        )}
      </div>

      {tab === "overview" ? <Overview data={data} /> : <Advanced data={data} />}

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
  const tall = v.kind !== "long";
  return (
    <span className={`relative block rounded-xl overflow-hidden bg-surface-2 flex-shrink-0 ${tall ? "w-[112px] h-[199px] sm:w-[132px] sm:h-[235px]" : "w-full sm:w-[300px] aspect-video"}`}>
      {v.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.thumbnail} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
      ) : null}
      <PlatformIcon platform={v.platform} className="absolute bottom-2 right-2 w-6 h-6 rounded-md shadow" />
      {v.durationSec ? <span className="absolute bottom-2 left-2 rounded-md bg-black/70 text-white text-[11px] font-semibold px-1.5 h-5 inline-flex items-center tabular-nums">{seconds(v.durationSec)}</span> : null}
    </span>
  );
}

function Hero({ data }: { data: VideoPageData }) {
  const v = data.video;
  const tone = scoreTone(v.score);
  const viewsKey = data.keys.find((k) => k.key === "views");
  const tall = v.kind !== "long";
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
      <div className={`flex gap-4 sm:gap-5 ${tall ? "flex-row" : "flex-col sm:flex-row"}`}>
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
          <h1 className="mt-1.5 font-display text-[22px] sm:text-[28px] leading-[1.15] font-semibold break-words">{v.title || "Untitled"}</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            {v.publishedAt ? `Posted ${niceDay(v.publishedAt, true)}` : "Posting date unknown"}
            {data.ageDays !== null ? ` · ${ago(data.ageDays)}` : ""}
            {v.durationSec ? ` · ${seconds(v.durationSec)} long` : ""}
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
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
          {v.hook && (
            <blockquote className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-soft max-w-2xl">
              <span className="block text-[10.5px] font-bold uppercase tracking-wide text-ink-faint mb-0.5">Hook, from the script</span>
              {v.hook}
            </blockquote>
          )}
        </div>
        {/* The verdict: next to the team's usual. */}
        <div className={`sm:w-[230px] flex-shrink-0 self-start rounded-xl p-4 ${tall ? "hidden md:block" : ""} ${tone === "high" || tone === "up" ? "bg-green/10" : tone === "down" ? "bg-coral/10" : "bg-surface-2"}`}>
          <Verdict data={data} />
        </div>
      </div>
      {tall && (
        <div className={`md:hidden mt-4 rounded-xl p-4 ${tone === "high" || tone === "up" ? "bg-green/10" : tone === "down" ? "bg-coral/10" : "bg-surface-2"}`}>
          <Verdict data={data} />
        </div>
      )}
      {viewsKey?.rank && viewsKey.rank.of > 1 && (
        <p className="mt-3 text-[12px] text-ink-soft inline-flex items-center gap-1.5">
          <TrophyIcon className="w-3.5 h-3.5 text-gold" />#{viewsKey.rank.rank} of {viewsKey.rank.of} {data.peerWord} on {NAME[v.platform]} by {v.platform === "facebook" ? "plays" : "views"}
        </p>
      )}
    </section>
  );
}

function Verdict({ data }: { data: VideoPageData }) {
  const v = data.video;
  const tone = scoreTone(v.score);
  if (v.score === null)
    return (
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Next to your usual</div>
        <p className="mt-1 text-[13px] text-ink-soft">{v.views === null ? "No views from the platform yet." : `Not enough ${data.peerWord} yet to say what's typical.`}</p>
      </div>
    );
  const word = tone === "high" ? "An outlier" : tone === "up" ? "Above your usual" : tone === "down" ? "Under your usual" : "About your usual";
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{word}</div>
      <div className={`mt-1 font-display text-[40px] leading-none font-semibold tabular-nums ${tone === "high" || tone === "up" ? "text-green" : tone === "down" ? "text-coral" : ""}`}>{scoreText(v.score)}</div>
      <p className="mt-1.5 text-[12px] text-ink-soft leading-snug">
        your typical {data.peerWord.replace(/s$/, "")}: {compactNum(v.typical)} {v.platform === "facebook" ? "plays" : "views"} (the median of the ones before it)
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** Columns by how many numbers there are: full rows where possible. */
const COLS: Record<number, string> = {
  1: "sm:grid-cols-2",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
  6: "sm:grid-cols-3 xl:grid-cols-6",
  7: "sm:grid-cols-4",
  8: "sm:grid-cols-4",
  9: "sm:grid-cols-3 lg:grid-cols-5",
  10: "sm:grid-cols-3 lg:grid-cols-5",
  11: "sm:grid-cols-4 xl:grid-cols-6",
  12: "sm:grid-cols-4 xl:grid-cols-6",
};

const OVERVIEW_KEYS = ["views", "watch_hours", "avg_view", "avg_pct", "hold", "skip", "likes", "comments", "shares", "saves", "subs", "engagement", "revenue", "rpm"];

function Overview({ data }: { data: VideoPageData }) {
  const keys = OVERVIEW_KEYS.map((k) => data.keys.find((x) => x.key === k)).filter((k): k is VideoKey => !!k);
  return (
    <div className="space-y-5">
      <KeyGrid keys={keys} currency={data.currency} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Growth data={data} />
        <PerDay data={data} />
      </div>
      {data.retention && <Retention data={data} />}
      {data.splits && (data.splits.traffic.length > 0 || data.splits.searches.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SplitCard title="Where its views came from" sub="Since it was posted" rows={data.splits.traffic} limit={8} />
          <SplitCard title="What people searched to find it" sub="YouTube search terms, since it was posted" rows={data.splits.searches} limit={8} />
        </div>
      )}
      {data.siblings.length > 0 && <Siblings data={data} />}
    </div>
  );
}

function KeyGrid({ keys, currency }: { keys: VideoKey[]; currency: string }) {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface overflow-hidden" aria-label="Key numbers">
      <div className={`grid -mr-px -mb-px grid-cols-2 ${COLS[keys.length] ?? "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"}`}>
        {keys.map((k) => {
          const vs = versus(k);
          return (
            <div key={k.key} className="border-r border-b border-line/10 px-3.5 sm:px-5 py-3 min-w-0">
              <div className="text-[12px] text-ink-soft truncate">{k.label}</div>
              <div className="mt-0.5 font-display text-[21px] sm:text-[23px] leading-tight font-semibold tabular-nums truncate">{fmt(k, k.value, currency)}</div>
              <div className="mt-1 min-h-[18px] flex items-center gap-1.5 flex-wrap">
                {vs && <span className={`inline-flex items-center rounded-md px-1.5 h-[18px] text-[11px] font-bold tabular-nums ${toneClass[vs.tone]}`}>{vs.text}</span>}
                {k.typical !== null && <span className="text-[11px] text-ink-faint tabular-nums truncate">typical {fmt(k, k.typical, currency)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Growth({ data }: { data: VideoPageData }) {
  const g = data.growth;
  const v = data.video;
  const word = data.peerWord.replace(/s$/, "");
  const labels = useMemo(() => (g ? g.mine.map((_, i) => `Day ${i + 1}`) : []), [g]);
  if (!g)
    return (
      <ChartCard title="Views since it was posted" sub={`Day by day, next to your typical ${word}`}>
        <p className="py-14 px-4 text-center text-[13px] text-ink-faint">
          {v.platform === "youtube" ? "YouTube hasn't sent its day-by-day views yet." : `Its day-by-day views start with the morning copies after it was posted (${NAME[v.platform]} only shares totals).`}
        </p>
      </ChartCard>
    );
  const vs = g.versus;
  return (
    <ChartCard
      title="Views since it was posted"
      sub={g.typicalFrom >= 3 ? `Dashed: your typical ${word} at the same age (${g.typicalFrom} before it)` : `Not enough earlier ${data.peerWord} with day-by-day numbers for a typical line yet`}
      right={<Legend items={[{ key: "m", label: "This video", color: MINE }, ...(g.typicalFrom >= 3 ? [{ key: "t", label: `Typical ${word}`, color: "rgb(var(--ink-faint))", dashed: true }] : [])]} />}
    >
      <LineChart ariaLabel="Views since it was posted" labels={labels} series={[{ key: "mine", label: "This video", color: MINE, values: g.mine }]} previous={g.typicalFrom >= 3 ? { label: `Typical ${word}`, values: g.typical } : null} />
      {vs && (
        <p className={`mt-3 text-[13px] font-semibold ${vs.ahead ? "text-green" : "text-coral"}`}>
          {vs.ahead ? "Ahead of" : "Behind"} your typical {word} since day {vs.since + 1}
          {Number.isFinite(vs.ratio) ? ` (${scoreText(vs.ratio)} by day ${Math.min(g.mine.length, g.typical.length)})` : ""}.
        </p>
      )}
      {data.milestones.length > 0 && (
        <dl className="mt-3 pt-3 border-t border-line/10 grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-2">
          {data.milestones.map((m) => (
            <div key={m.day} className="min-w-0">
              <dt className="text-[11px] text-ink-faint">By day {m.day}</dt>
              <dd className="text-[15px] font-semibold tabular-nums">{compactNum(m.views)}</dd>
              {m.typical !== null && <dd className="text-[10.5px] text-ink-faint tabular-nums">typical {compactNum(m.typical)}</dd>}
            </div>
          ))}
        </dl>
      )}
    </ChartCard>
  );
}

function PerDay({ data }: { data: VideoPageData }) {
  const d = data.daily;
  const labels = useMemo(() => (d ? d.days.map((x) => niceDay(x)) : []), [d]);
  if (!d)
    return (
      <ChartCard title="Views per day" sub="Each day's own views">
        <p className="py-14 px-4 text-center text-[13px] text-ink-faint">No day-by-day views yet.</p>
      </ChartCard>
    );
  const last = d.views.length > 90 ? 90 : d.views.length;
  const start = d.views.length - last;
  return (
    <ChartCard title="Views per day" sub={d.views.length > 90 ? "The last 90 days with numbers" : d.source === "daily" ? "Each day's own views (YouTube's numbers)" : "The change between one morning's copy and the next"}>
      <StackedColumns ariaLabel="Views per day" labels={labels.slice(start)} series={[{ key: "v", label: "Views", color: MINE, values: d.views.slice(start).map((x) => x ?? 0) }]} format={(x) => compactNum(x)} />
    </ChartCard>
  );
}

function Retention({ data }: { data: VideoPageData }) {
  const r = data.retention!;
  const v = data.video;
  const s = v.retention;
  // The average in a quiet grey, dashed: this video is the one in colour.
  const series = [{ key: "v", label: "This video", color: MINE, values: r.mine }, ...(r.average ? [{ key: "a", label: `Your average ${data.peerWord.replace(/s$/, "")} (${r.averageCount})`, color: "rgb(var(--ink-faint))", values: r.average, dashed: true }] : [])];
  return (
    <ChartCard title="Retention" sub="The share of viewers still watching at each moment · 100% = everyone who started" right={<Legend items={series.map((x) => ({ key: x.key, label: x.label, color: x.color, dashed: "dashed" in x ? x.dashed : false }))} />}>
      <RetentionChart series={series} ariaLabel="Retention of this video" duration={v.durationSec} />
      {s && (
        <dl className="mt-4 pt-4 border-t border-line/10 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-3">
          {[
            v.kind === "long" ? ["After 30 s", pctOf(s.at30s)] : ["After 3 s", pctOf(s.at3s)],
            ["Halfway", pctOf(s.at50)],
            ["At the end", pctOf(s.end)],
            ["Steepest drop", s.biggestDrop ? `${Math.round(s.biggestDrop.at * 100)}% in` : "–"],
            ["Vs similar videos", s.relative === null ? "–" : `${Math.round(s.relative * 100)} / 100`],
          ].map(([k, val]) => (
            <div key={k}>
              <dt className="text-[11.5px] text-ink-faint">{k}</dt>
              <dd className="text-[17px] font-semibold tabular-nums">{val}</dd>
            </div>
          ))}
        </dl>
      )}
    </ChartCard>
  );
}

function SplitCard({ title, sub, rows, limit }: { title: string; sub: string; rows: { key: string; label: string; views: number | null; watchMinutes: number | null }[]; limit?: number }) {
  const [more, setMore] = useState(false);
  const total = rows.reduce((t, r) => t + (r.views ?? 0), 0);
  const shown = more || !limit ? rows : rows.slice(0, limit);
  return (
    <ChartCard title={title} sub={sub}>
      {rows.length ? (
        <>
          <ul className="space-y-2.5">
            {shown.map((r) => {
              const share = total ? (r.views ?? 0) / total : 0;
              return (
                <li key={r.key} className="min-w-0">
                  <div className="flex items-baseline gap-2 text-[13px] min-w-0">
                    <span className="flex-1 min-w-0 truncate" title={r.label}>
                      {r.label}
                    </span>
                    <span className="font-semibold tabular-nums">{compactNum(r.views)}</span>
                    <span className="w-10 text-right text-[12px] text-ink-faint tabular-nums">{Math.round(share * 100)}%</span>
                  </div>
                  <span className="mt-1 block h-1.5 rounded-[3px] bg-line/[0.07] overflow-hidden" aria-hidden>
                    <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(share > 0 ? 1.5 : 0, share * 100)}%`, background: MINE }} />
                  </span>
                </li>
              );
            })}
          </ul>
          {limit && rows.length > limit && (
            <button type="button" onClick={() => setMore((m) => !m)} className="mt-3 text-[12px] font-semibold text-ink-soft hover:text-ink">
              {more ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      ) : (
        <p className="py-6 text-center text-[12.5px] text-ink-faint">Not copied yet: a few videos get these each morning.</p>
      )}
    </ChartCard>
  );
}

function Siblings({ data }: { data: VideoPageData }) {
  const v = data.video;
  const all = [{ platform: v.platform, views: v.views }, ...data.siblings.map((s) => ({ platform: s.platform, views: s.views }))];
  const total = all.reduce((t, x) => t + (x.views ?? 0), 0);
  return (
    <ChartCard title="The same short everywhere" sub={`${compactNum(total)} views across ${all.length} platforms`}>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{ ...v, here: true }, ...data.siblings.map((s) => ({ ...s, here: false }))].map((s) => {
          const share = total ? (s.views ?? 0) / total : 0;
          const inner = (
            <>
              <span className="flex items-center gap-2 min-w-0">
                <PlatformIcon platform={s.platform} className="w-6 h-6 rounded-md flex-shrink-0" />
                <span className="text-[13px] font-semibold">{NAME[s.platform]}</span>
                {s.here && <span className="ml-auto text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">This one</span>}
              </span>
              <span className="mt-2 block font-display text-[22px] font-semibold tabular-nums">{compactNum(s.views)}</span>
              <span className="block text-[11.5px] text-ink-faint">
                {Math.round(share * 100)}% of its views · {compactNum(s.likes)} likes · {compactNum(s.comments)} comments
              </span>
            </>
          );
          return (
            <li key={`${s.platform}:${s.id}`}>
              {s.here ? (
                <div className="h-full rounded-xl border border-amber/40 bg-amber/[0.06] p-3.5">{inner}</div>
              ) : (
                <Link href={`/analytics/video/${s.platform}/${encodeURIComponent(s.id)}`} className="block h-full rounded-xl border border-line/10 p-3.5 hover:border-line/30 hover:bg-surface-2/40">
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
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
  const dayRows = d ? d.days.map((day, i) => ({ day, views: d.views[i], watch: d.watchMinutes[i] })).reverse() : [];
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

      {data.splits && (data.splits.traffic.length > 0 || data.splits.searches.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          <SplitCard title="Traffic sources" sub={data.splits.asOf ? `Since it was posted, to ${niceDay(data.splits.asOf, true)}` : "Since it was posted"} rows={data.splits.traffic} />
          <SplitCard title="Search terms" sub="Every YouTube search that led to it (the top 25)" rows={data.splits.searches} />
        </div>
      )}

      {dayRows.length > 0 && (
        <ChartCard title="Day by day" sub={d?.source === "daily" ? "YouTube's own numbers for each day" : "The change between one morning's copy and the next"}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint text-left">
                  <th className="py-1.5 pr-3">Day</th>
                  <th className="py-1.5 px-3 text-right">Views</th>
                  {d?.source === "daily" && <th className="py-1.5 pl-3 text-right">Watch time</th>}
                </tr>
              </thead>
              <tbody>
                {(allDays ? dayRows : dayRows.slice(0, 14)).map((r) => (
                  <tr key={r.day} className="border-t border-line/10">
                    <td className="py-1.5 pr-3 text-ink-soft whitespace-nowrap">{niceDay(r.day, true)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{r.views === null ? "–" : Math.round(r.views).toLocaleString("en-US")}</td>
                    {d?.source === "daily" && <td className="py-1.5 pl-3 text-right tabular-nums text-ink-soft">{r.watch === null ? "–" : `${compactNum(r.watch / 60)} h`}</td>}
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
