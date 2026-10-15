"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Segmented } from "@/components/ui/segmented";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { AdvancedData, AdvVideo } from "../../lib/advanced";
import { ScoreBadge } from "../content-list";
import { compactNum, money, seconds } from "./format";
import { KIND_LABEL, isWide } from "../../lib/kinds";

/*
 * Advanced → Best performing (1.17.0): the platform's top videos by what
 * matters (views, how far above typical, engagement, how much of them people
 * watch, subscribers, watch time, revenue), posted in the range or of all
 * time. The top three as big cards, the next seven as a list; each opens the
 * video's own analytics.
 */

type Scope = "range" | "all";
type Metric = { key: string; label: string; get: (v: AdvVideo) => number | null; show: (n: number, v: AdvVideo) => string; unit: string };

const eng = (v: AdvVideo) => (v.views ? (((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0) + (v.saves ?? 0)) / v.views) * 100 : null);
const pct = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;

function metricsFor(data: AdvancedData): Metric[] {
  const p = data.platform;
  const m: Metric[] = [
    { key: "views", label: p === "facebook" ? "Plays" : "Views", get: (v) => v.views, show: (n) => compactNum(n), unit: p === "facebook" ? "plays" : "views" },
    { key: "score", label: "× typical", get: (v) => v.score, show: (n) => `${n >= 10 ? Math.round(n) : n.toFixed(1)}×`, unit: "typical" },
    { key: "engagement", label: "Engagement", get: eng, show: pct, unit: "engaged" },
  ];
  if (p === "youtube") m.push({ key: "avg_pct", label: "Avg % viewed", get: (v) => v.avgViewPct, show: pct, unit: "viewed" });
  if (p === "instagram") m.push({ key: "skip", label: "Fewest skips", get: (v) => (v.skipRate === null ? null : 100 - v.skipRate), show: (n) => pct(100 - n), unit: "skipped" });
  if (p === "youtube") m.push({ key: "subs", label: "Subscribers", get: (v) => v.subscribersGained, show: (n) => compactNum(n), unit: "subscribers" });
  if (p === "youtube") m.push({ key: "watch", label: "Watch time", get: (v) => (v.watchMinutes === null ? null : v.watchMinutes / 60), show: (n) => `${n < 10 ? n.toFixed(1) : compactNum(n)} h`, unit: "watched" });
  m.push({ key: "shares", label: "Shares", get: (v) => v.shares, show: (n) => compactNum(n), unit: "shares" });
  if (p === "instagram") m.push({ key: "saves", label: "Saves", get: (v) => v.saves, show: (n) => compactNum(n), unit: "saves" });
  if (data.revenueAllowed) m.push({ key: "revenue", label: "Revenue", get: (v) => v.revenue?.revenue ?? null, show: (n) => money(n, data.currency), unit: "earned" });
  // Only what this platform shares for these videos.
  return m.filter((x) => data.videos.some((v) => x.get(v) !== null));
}

export function BestPerforming({ data }: { data: AdvancedData }) {
  const metrics = useMemo(() => metricsFor(data), [data]);
  const from = data.days[0];
  const to = data.days[data.days.length - 1];
  const inRange = useMemo(() => data.videos.filter((v) => v.day && v.day >= from && v.day <= to), [data.videos, from, to]);
  const [scope, setScope] = useState<Scope>(inRange.length >= 3 ? "range" : "all");
  const [key, setKey] = useState("views");
  const metric = metrics.find((m) => m.key === key) ?? metrics[0];
  const pool = scope === "range" ? inRange : data.videos;
  const ranked = useMemo(
    () =>
      metric
        ? pool
            .map((v) => ({ v, n: metric.get(v) }))
            .filter((x): x is { v: AdvVideo; n: number } => x.n !== null && Number.isFinite(x.n))
            // Rates on a handful of views say little: at least 100 views to rank by a rate.
            .filter((x) => !["engagement", "avg_pct", "skip", "score"].includes(metric.key) || (x.v.views ?? 0) >= 100)
            .sort((a, b) => b.n - a.n)
            .slice(0, 10)
        : [],
    [pool, metric]
  );
  if (!metric) return null;
  const top = ranked[0]?.n ?? 0;
  const href = (v: AdvVideo) => `/analytics/video/${v.platform}/${encodeURIComponent(v.id)}?from=advanced`;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="-mx-4 px-4 overflow-x-auto no-scrollbar sm:mx-0 sm:px-0 max-w-full">
          <Segmented ariaLabel="Best by" value={metric.key} onChange={setKey} options={metrics.map((m) => ({ value: m.key, label: m.label }))} />
        </div>
        <span className="flex-1" />
        <Segmented<Scope>
          ariaLabel="Which videos"
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: "range", label: "Posted in this range", count: inRange.length },
            { value: "all", label: "All time", count: data.videos.length },
          ]}
        />
      </div>

      {ranked.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line/20 py-10 px-6 text-center text-[13.5px] text-ink-soft">
          {scope === "range" ? (
            <>
              Nothing posted in this range has {metric.unit === "typical" ? "a typical to compare with" : `${metric.label.toLowerCase()} numbers`} yet.{" "}
              <button type="button" onClick={() => setScope("all")} className="font-semibold text-amber hover:underline">
                See all time
              </button>
            </>
          ) : (
            "No numbers for this yet."
          )}
        </div>
      ) : (
        <>
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ranked.slice(0, 3).map(({ v, n }, i) => (
              <li key={v.id}>
                <Link href={href(v)} className="group flex sm:block h-full rounded-2xl border border-line/10 bg-surface overflow-hidden hover:border-line/30 hover:shadow-sm transition">
                  {/* Phones: a small picture beside the words; wider screens: a big card. */}
                  <span className="relative block w-[42%] max-w-[180px] sm:w-auto sm:max-w-none aspect-video self-center sm:self-auto flex-shrink-0 bg-surface-2 overflow-hidden">
                    {v.thumbnail && (
                      <>
                        {!isWide(v.kind) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.thumbnail} alt="" aria-hidden referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60" />
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={v.thumbnail} alt="" referrerPolicy="no-referrer" className={`relative w-full h-full ${isWide(v.kind) ? "object-cover" : "object-contain"} group-hover:scale-[1.02] transition-transform`} />
                      </>
                    )}
                    <span className={`absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center font-display text-[14px] sm:text-[17px] font-semibold shadow ${i === 0 ? "bg-gold text-[#3a2a00]" : "bg-surface text-ink"}`}>{i + 1}</span>
                    <PlatformIcon platform={v.platform} className="absolute bottom-1.5 right-1.5 sm:bottom-2.5 sm:right-2.5 w-5 h-5 sm:w-6 sm:h-6 rounded-md shadow" />
                    {v.durationSec ? <span className="hidden sm:inline-flex absolute bottom-2.5 left-2.5 rounded-md bg-black/70 text-white text-[11px] font-semibold px-1.5 h-5 items-center tabular-nums">{seconds(v.durationSec)}</span> : null}
                  </span>
                  <span className="block p-3 sm:p-3.5 min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold leading-snug line-clamp-2 group-hover:underline">{v.title || "Untitled"}</span>
                    <span className="mt-2 flex items-end gap-3">
                      <span className="min-w-0">
                        <span className="block font-display text-[20px] sm:text-[24px] leading-none font-semibold tabular-nums">{metric.show(n, v)}</span>
                        <span className="block text-[11px] text-ink-faint mt-1">
                          {metric.key === "views" ? (v.platform === "facebook" ? "plays" : "views") : metric.key === "score" ? `${compactNum(v.views)} views · typical ${compactNum(v.typical)}` : `${metric.unit} · ${compactNum(v.views)} views`}
                        </span>
                      </span>
                      <span className="flex-1" />
                      {metric.key !== "score" && <ScoreBadge score={v.score} />}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {ranked.length > 3 && (
            <ol start={4} className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/10">
              {ranked.slice(3).map(({ v, n }, i) => (
                <li key={v.id}>
                  <Link href={href(v)} className="grid grid-cols-[1.5rem_auto_minmax(0,1fr)_auto] sm:grid-cols-[1.5rem_auto_minmax(0,1fr)_9rem_auto_auto] items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2/50">
                    <span className="text-[12px] font-mono text-ink-faint tabular-nums">{i + 4}</span>
                    <span className="relative w-14 h-8 rounded-md overflow-hidden bg-surface-2">
                      {v.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold truncate">{v.title || "Untitled"}</span>
                      <span className="block text-[11px] text-ink-faint truncate">
                        {KIND_LABEL[v.kind]}
                        {v.ours ? ` · #${v.ours.number ?? "?"}` : ""}
                      </span>
                    </span>
                    <span className="hidden sm:block h-1.5 rounded-[3px] bg-line/[0.07] overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-[3px] bg-amber" style={{ width: `${top > 0 ? Math.max(3, (n / top) * 100) : 0}%` }} />
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-right">{metric.show(n, v)}</span>
                    <span className="hidden sm:block w-12 text-right">{metric.key !== "score" && <ScoreBadge score={v.score} />}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <p className="text-[12px] text-ink-faint">
            {metric.key === "score" ? "× typical: views next to the median of the same kind posted before it. " : ""}
            {["engagement", "avg_pct", "skip", "score"].includes(metric.key) ? "Rates count videos with 100 views or more. " : ""}
            Click one for everything about it.
          </p>
        </>
      )}
    </div>
  );
}
