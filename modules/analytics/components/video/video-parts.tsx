"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { VideoKey, VideoPageData } from "../../lib/video";
import { scoreText } from "../../lib/scores";
import { bucketDays, defaultGran, gransFor, rollup, runningTotal, type Gran, type Num } from "../../lib/trend-math";
import { hourRange } from "../../lib/live-math";
import { ago as agoFrom } from "../../lib/ago";
import { CardStrip, ChartCard, Legend, LineChart, StackedColumns } from "../charts";
import { RetentionChart } from "../advanced/retention-chart";
import { isWide } from "../../lib/kinds";
import { compactNum, money, niceDay, pctOf, seconds } from "../advanced/format";

/*
 * The pieces of a video's analytics page (1.21.0): its numbers as tiles
 * next to the usual, a chart whose cards switch it (like YouTube Studio's),
 * its realtime card, retention, the same short elsewhere.
 */

export const NAME = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" } as const;
export const MINE = "rgb(var(--amber))";

export function fmt(k: Pick<VideoKey, "format">, v: number | null, currency: string) {
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
export function versus(k: VideoKey): { text: string; tone: "good" | "bad" | "same" } | null {
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
export const toneClass = { good: "text-green bg-green/10", bad: "text-coral bg-coral/10", same: "text-ink-soft bg-surface-2" } as const;

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

/** Numbers as tiles, each next to the typical video of its kind. */
export function KeyGrid({ keys, currency, label = "Key numbers", cols }: { keys: VideoKey[]; currency: string; label?: string; cols?: string }) {
  if (!keys.length) return null;
  return (
    <section className="rounded-2xl border border-line/10 bg-surface overflow-hidden" aria-label={label}>
      <div className={`grid -mr-px -mb-px grid-cols-2 ${cols ?? COLS[keys.length] ?? "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"}`}>
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

export const pickKeys = (data: VideoPageData, list: string[]) => list.map((k) => data.keys.find((x) => x.key === k)).filter((k): k is VideoKey => !!k);

// ---------------------------------------------------------------------------
// The chart with cards that switch it (like YouTube Studio's video overview)
// ---------------------------------------------------------------------------

export type ChartTab = { key: string; label: string; total: number | null; key2?: VideoKey | null; values: Num[] | null; format: (n: number | null) => string; loading?: boolean; note?: string | null; sum?: "sum" | "avg" };

/**
 * Cards on top (each one's number since it was posted and how it compares
 * with the usual), the chart of the one picked per day / week / month, as
 * they came or as a running total; "Since posted" views get the typical
 * video's line too.
 */
export function TabbedChart({
  days,
  tabs,
  active,
  onPick,
  typicalViews,
  postedDay,
  footer,
}: {
  days: string[];
  tabs: ChartTab[];
  active: string;
  onPick: (key: string) => void;
  /** The typical video's views since posting (index 0 = its first day), for the running total of views. */
  typicalViews?: Num[] | null;
  postedDay: string | null;
  footer?: React.ReactNode;
}) {
  const tab = tabs.find((t) => t.key === active) ?? tabs[0];
  const grans = gransFor(days.length, false);
  const [gran, setGran] = useState<Gran>(defaultGran(days.length, false));
  useEffect(() => setGran(defaultGran(days.length, false)), [days.length]);
  const g = grans.includes(gran) ? gran : grans[0];
  const [run, setRun] = useState(false);
  const buckets = useMemo(() => bucketDays(days, g === "hour" ? "day" : g), [days, g]);
  const cumulative = run && tab.sum !== "avg";
  const values = tab.values ? (cumulative ? runningTotal(rollup(tab.values, buckets)) : rollup(tab.values, buckets, tab.sum === "avg" ? tab.values.map((v) => (v === null ? null : 1)) : undefined)) : null;
  // The typical video at the same age: the running total of views, per day.
  let previous: { label: string; values: Num[] } | null = null;
  if (cumulative && tab.key === "views" && typicalViews && postedDay && g === "day") {
    const age = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${postedDay}T00:00:00Z`)) / 86_400_000);
    const t = days.map((d) => typicalViews[age(d)] ?? null);
    if (t.some((x) => x !== null)) previous = { label: "Your typical one at the same age", values: t };
  }
  const unit = g === "week" ? "week" : g === "month" ? "month" : "day";
  return (
    <section className="rounded-2xl border border-line/10 bg-surface min-w-0 overflow-hidden">
      <CardStrip>
        {tabs.map((t) => {
          const on = t.key === tab.key;
          const vs = t.key2 ? versus(t.key2) : null;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onPick(t.key)}
              className={`relative flex-1 min-w-[9rem] text-left px-4 py-3.5 transition-colors border-r border-line/10 last:border-r-0 ${on ? "bg-surface-2/60" : "hover:bg-surface-2/30"}`}
            >
              <span aria-hidden className={`absolute left-0 right-0 top-0 h-[3px] bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
              <span className={`block text-[12.5px] font-semibold truncate ${on ? "text-ink" : "text-ink-soft"}`}>{t.label}</span>
              <span className="block font-display text-[24px] sm:text-[26px] font-semibold leading-none mt-1.5 tabular-nums">{t.loading ? "…" : t.format(t.total)}</span>
              <span className="mt-2 flex items-center gap-1.5 min-h-[18px]">{vs && <span className={`inline-flex items-center rounded-md px-1.5 h-[18px] text-[11px] font-bold tabular-nums ${toneClass[vs.tone]}`}>{vs.text}</span>}</span>
            </button>
          );
        })}
      </CardStrip>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-x-3 gap-y-2.5 mb-3 flex-wrap">
          <div className="flex-1 basis-56 min-w-0">
            <h3 className="text-[14.5px] font-semibold">
              {tab.label} {cumulative ? "· running total" : `per ${unit}`}
            </h3>
            <p className="text-[12px] text-ink-faint mt-0.5">{previous ? "Dashed: your typical one at the same age" : days.length ? `${niceDay(days[0], true)} – ${niceDay(days[days.length - 1], true)}` : ""}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {tab.sum !== "avg" && <Seg value={run ? "run" : "per"} onChange={(v) => setRun(v === "run")} label="Show" options={[{ value: "per", label: `Per ${unit}` }, { value: "run", label: "Running total" }]} />}
            {grans.length > 1 && <Seg value={g} onChange={(v) => setGran(v as Gran)} label="Group by" options={grans.map((x) => ({ value: x, label: x === "day" ? "Days" : x === "week" ? "Weeks" : "Months" }))} />}
          </div>
        </div>
        {tab.loading ? (
          <div className="skeleton h-[260px] rounded-xl" aria-busy="true" aria-label="Loading" />
        ) : values && values.some((v) => v !== null && v !== 0) ? (
          <LineChart ariaLabel={`${tab.label} per ${unit}`} labels={buckets.map((b) => b.label)} tips={buckets.map((b) => b.tip)} series={[{ key: tab.key, label: tab.label, color: MINE, values }]} previous={previous} format={tab.format} height={260} area={!previous} />
        ) : (
          <p className="py-16 text-center text-[13px] text-ink-faint">{tab.note ?? `No ${tab.label.toLowerCase()} per day yet.`}</p>
        )}
        {footer && <div className="mt-4 pt-3 border-t border-line/10">{footer}</div>}
      </div>
    </section>
  );
}

export function Seg({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
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

// ---------------------------------------------------------------------------
// Realtime, retention, the same short elsewhere
// ---------------------------------------------------------------------------

/** Its counts within minutes, like YouTube Studio's realtime card: the last 48 hours by the hour, the last 60 minutes by 10 minutes. */
export function LiveCard({ data }: { data: VideoPageData }) {
  const l = data.live;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!l) return null;
  const word = data.video.platform === "facebook" ? "Plays" : "Views";
  const t = now ?? Date.parse(data.today);
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0" aria-label="Realtime">
      <div className="flex items-center gap-2">
        <span className="relative flex w-2.5 h-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-green" />
        </span>
        <h2 className="text-[15px] font-semibold">Realtime</h2>
        <span className="text-[12px] text-ink-faint truncate">{now && l.at ? `counts from ${agoFrom(l.at, now)}` : "updating live"}</span>
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{word} · last 48 hours</div>
        <div className="font-display text-[32px] leading-none font-semibold tabular-nums mt-1.5">{l.views48 === null ? "–" : `+${l.views48.toLocaleString("en-US")}`}</div>
        {l.hours.some((h) => h.views > 0) ? (
          <div className="mt-2">
            <StackedColumns
              ariaLabel={`${word} per hour over the last 48 hours`}
              labels={l.hours.map((h, i) => (i === 0 ? "48 h ago" : i === l.hours.length - 1 ? "Now" : ""))}
              tips={l.hours.map((h, i) => `${hourRange(Date.parse(h.at), t)}${i === l.hours.length - 1 ? " (so far)" : ""}`)}
              series={[{ key: "v", label: word, color: MINE, values: l.hours.map((h) => h.views) }]}
              height={110}
              format={(x) => compactNum(x)}
            />
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-ink-faint">No {word.toLowerCase()} in the last 48 hours.</p>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-line/10">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{word} · last 60 minutes</div>
        <div className={`font-display text-[32px] leading-none font-semibold tabular-nums mt-1.5 ${(l.views60 ?? 0) > 0 ? "text-green" : ""}`}>{l.views60 === null ? "–" : `+${l.views60.toLocaleString("en-US")}`}</div>
        {l.minutes.some((m) => m.views > 0) && (
          <div className="mt-2">
            <StackedColumns
              ariaLabel={`${word} per 10 minutes over the last hour`}
              labels={l.minutes.map((m, i) => (i === l.minutes.length - 1 ? "Now" : `−${(l.minutes.length - 1 - i) * 10}m`))}
              tips={l.minutes.map((m, i) => (i === l.minutes.length - 1 ? "The last 10 minutes" : `${(l.minutes.length - 1 - i) * 10}–${(l.minutes.length - i) * 10} minutes ago`))}
              series={[{ key: "v", label: word, color: "rgb(var(--green))", values: l.minutes.map((m) => m.views) }]}
              height={90}
              format={(x) => compactNum(x)}
            />
          </div>
        )}
      </div>
    </section>
  );
}

export function RetentionCard({ data }: { data: VideoPageData }) {
  const r = data.retention!;
  const v = data.video;
  const s = v.retention;
  // The average in a quiet grey, dashed: this video is the one in colour.
  const series = [{ key: "v", label: "This video", color: MINE, values: r.mine }, ...(r.average ? [{ key: "a", label: `Your average ${data.peerWord.replace(/s$/, "")} (${r.averageCount})`, color: "rgb(var(--ink-faint))", values: r.average, dashed: true }] : [])];
  return (
    <ChartCard title="Audience retention" sub="The share of viewers still watching at each moment · 100% = everyone who started" right={<Legend items={series.map((x) => ({ key: x.key, label: x.label, color: x.color, dashed: "dashed" in x ? x.dashed : false }))} />}>
      <RetentionChart series={series} ariaLabel="Retention of this video" duration={v.durationSec} />
      {s && (
        <dl className="mt-4 pt-4 border-t border-line/10 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-3">
          {[
            isWide(v.kind) ? ["After 30 s", pctOf(s.at30s)] : ["After 3 s", pctOf(s.at3s)],
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

export function Siblings({ data }: { data: VideoPageData }) {
  const v = data.video;
  const all = [{ platform: v.platform, views: v.views }, ...data.siblings.map((s) => ({ platform: s.platform, views: s.views }))];
  const total = all.reduce((t, x) => t + (x.views ?? 0), 0);
  const list = [{ ...v, here: true }, ...data.siblings.map((s) => ({ ...s, here: false }))];
  return (
    <ChartCard title="The same short everywhere" sub={`${compactNum(total)} views across ${all.length} platforms`}>
      <ul className="space-y-2">
        {list.map((s) => {
          const share = total ? (s.views ?? 0) / total : 0;
          const inner = (
            <>
              <PlatformIcon platform={s.platform} className="w-7 h-7 rounded-md flex-shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">{NAME[s.platform]}</span>
                  {s.here && <span className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">This one</span>}
                  <span className="ml-auto text-[13.5px] font-bold tabular-nums">{compactNum(s.views)}</span>
                </span>
                <span className="mt-1 block h-1.5 rounded-[3px] bg-line/[0.07] overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(share > 0 ? 2 : 0, share * 100)}%`, background: MINE }} />
                </span>
                <span className="block text-[11px] text-ink-faint mt-0.5 tabular-nums">
                  {Math.round(share * 100)}% · {compactNum(s.likes)} likes · {compactNum(s.comments)} comments
                </span>
              </span>
            </>
          );
          return (
            <li key={`${s.platform}:${s.id}`}>
              {s.here ? (
                <div className="flex items-center gap-3 rounded-xl border border-amber/40 bg-amber/[0.06] px-3 py-2.5">{inner}</div>
              ) : (
                <Link href={`/analytics/video/${s.platform}/${encodeURIComponent(s.id)}`} className="flex items-center gap-3 rounded-xl border border-line/10 px-3 py-2.5 hover:border-line/30 hover:bg-surface-2/40">
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

/** Milestones: its views by day 1, 2, 7, 14, 30, 60 next to the typical one's. */
export function Milestones({ data }: { data: VideoPageData }) {
  if (!data.milestones.length) return null;
  const g = data.growth;
  const word = data.peerWord.replace(/s$/, "");
  const vs = g?.versus ?? null;
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0" aria-label="Its first days">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-[14.5px] font-semibold">Its first days</h2>
        {vs && (
          <span className={`text-[12.5px] font-semibold ${vs.ahead ? "text-green" : "text-coral"}`}>
            {vs.ahead ? "Ahead of" : "Behind"} your typical {word} since day {vs.since + 1}
            {g && Number.isFinite(vs.ratio) ? ` (${scoreText(vs.ratio)} by day ${Math.min(g.mine.length, g.typical.length)})` : ""}
          </span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-2">
        {data.milestones.map((m) => (
          <div key={m.day} className="min-w-0">
            <dt className="text-[11px] text-ink-faint">By day {m.day}</dt>
            <dd className="text-[16px] font-semibold tabular-nums">{compactNum(m.views)}</dd>
            {m.typical !== null && <dd className="text-[10.5px] text-ink-faint tabular-nums">typical {compactNum(m.typical)}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Days grouped by week or month when there are many. */
const dayGran = (n: number) => (n > 120 ? "month" : n > 45 ? "week" : "day");

/** One per-day number as bars (days, weeks or months), no card around it. */
export function DayBarsChart({ title, days, values, format, color = MINE, height = 180 }: { title: string; days: string[]; values: Num[]; format: (n: number | null) => string; color?: string; height?: number }) {
  const buckets = bucketDays(days, dayGran(days.length));
  const r = rollup(values, buckets);
  return <StackedColumns ariaLabel={title} labels={buckets.map((b) => b.label)} tips={buckets.map((b) => b.tip)} series={[{ key: "v", label: title, color, values: r.map((v) => v ?? 0) }]} format={format} height={height} />;
}

/**
 * A small chart of one per-day number (bars), with its own empty state.
 * 1.22.0: only the stretch with numbers (impressions start when YouTube's
 * reach reports do, not when the video was posted).
 */
export function DayBars({ title, sub, days, values, format, color = MINE, empty }: { title: string; sub?: string; days: string[]; values: Num[]; format: (n: number | null) => string; color?: string; empty: string }) {
  const has = values.some((v) => v !== null && v !== 0);
  const first = Math.max(0, values.findIndex((v) => v !== null));
  const last = values.length - 1 - Math.max(0, [...values].reverse().findIndex((v) => v !== null));
  const shownDays = has ? days.slice(first, last + 1) : days;
  const shown = has ? values.slice(first, last + 1) : values;
  const cut = has && shownDays.length < days.length && first > 0;
  return (
    <ChartCard title={title} sub={`${sub ?? `Per ${dayGran(shownDays.length)}`}${cut ? ` · from ${niceDay(shownDays[0], true)}` : ""}`}>
      {has ? <DayBarsChart title={title} days={shownDays} values={shown} format={format} color={color} /> : <p className="py-12 text-center text-[13px] text-ink-faint">{empty}</p>}
    </ChartCard>
  );
}

/**
 * An average per day as a line. 1.22.0: only the stretch that has numbers
 * (a click-through rate starts when YouTube's reach reports do, not when the
 * video was posted: the chart was mostly empty with loose dots), days
 * without a number bridged, and a rate weighted by what it's a rate of
 * (impressions) when the days are grouped into weeks.
 */
export function DayLine({ title, sub, days, values, format, empty, weights, weightWord }: { title: string; sub?: string; days: string[]; values: Num[]; format: (n: number | null) => string; empty: string; weights?: Num[]; weightWord?: string }) {
  const first = values.findIndex((v) => v !== null);
  const last = values.length - 1 - [...values].reverse().findIndex((v) => v !== null);
  const has = first >= 0;
  const shownDays = has ? days.slice(first, last + 1) : [];
  const shown = has ? values.slice(first, last + 1) : [];
  const w = weights && has ? weights.slice(first, last + 1) : undefined;
  const buckets = bucketDays(shownDays, shownDays.length > 90 ? "week" : "day");
  const series = rollup(shown, buckets, w ? w.map((x) => (x === null ? null : Math.max(0, x))) : shown.map((x) => (x === null ? null : 1)));
  const wsum = w ? rollup(w, buckets) : null;
  return (
    <ChartCard title={title} sub={has && shownDays.length < days.length ? `${sub ? `${sub} · ` : ""}from ${niceDay(shownDays[0], true)}` : sub}>
      {has ? (
        <LineChart
          ariaLabel={title}
          labels={buckets.map((b) => b.label)}
          tips={buckets.map((b, i) => `${b.tip}${wsum && wsum[i] !== null ? ` · ${compactNum(wsum[i])} ${weightWord ?? ""}`.trimEnd() : ""}`)}
          series={[{ key: "v", label: title, color: MINE, values: series }]}
          format={format}
          height={180}
        />
      ) : (
        <p className="py-12 text-center text-[13px] text-ink-faint">{empty}</p>
      )}
    </ChartCard>
  );
}
