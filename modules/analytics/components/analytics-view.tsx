"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DownloadIcon, ExternalIcon, LockIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Mascot } from "@/components/ui/mascot";
import { setRevenueAccess, syncAnalyticsNow } from "@/app/(dashboard)/analytics/actions";
import { RANGES, type RangeId, type TabId, type Window } from "../lib/ranges";
import type { Audience, ContentItem, PlatformStatus, Production, Revenue } from "../lib/queries";
import { BarList, ChartCard, fmtCompact, fmtInt, Legend, LineChart, StackedColumns, StatTile } from "./charts";
import { countryName, WorldMap } from "./world-map";

type Data =
  | { tab: "production"; production: Production }
  | { tab: "audience"; audience: Audience }
  | { tab: "content"; content: { items: ContentItem[]; status: PlatformStatus[] } }
  | { tab: "revenue"; revenue: Revenue };

const PLATFORM = {
  youtube: { name: "YouTube", color: "rgb(var(--chart-yt))" },
  instagram: { name: "Instagram", color: "rgb(var(--chart-ig))" },
  tiktok: { name: "TikTok", color: "rgb(var(--chart-tt))" },
} as const;
const SHORT_COLOR = "rgb(var(--chart-short))";
const LONG_COLOR = "rgb(var(--chart-long))";
const TOTAL_COLOR = "rgb(var(--amber))";

const niceDay = (d: string, withYear = false) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
const fmtDays = (n: number | null) => (n === null ? "–" : n < 10 ? n.toFixed(1) : String(Math.round(n)));
const fmtPct = (n: number | null) => (n === null ? "–" : `${Math.round(n)}`);

function csvDownload(name: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function AnalyticsView({
  teamId,
  teamName,
  window: w,
  range,
  compare,
  canSync,
  revenueAllowed,
  data,
}: {
  teamId: string;
  teamName: string;
  window: Window;
  range: RangeId;
  compare: boolean;
  canSync: boolean;
  revenueAllowed: boolean;
  data: Data;
}) {
  const router = useRouter();
  const toast = useToast();
  const [navigating, startNav] = useTransition();
  const [syncing, startSync] = useTransition();
  const href = (p: { tab?: TabId; range?: RangeId; compare?: boolean }) => {
    const q = new URLSearchParams({ tab: p.tab ?? data.tab, range: p.range ?? range });
    if (!(p.compare ?? compare)) q.set("compare", "0");
    return `/analytics?${q}`;
  };
  const go = (p: Parameters<typeof href>[0]) => startNav(() => router.push(href(p), { scroll: false }));
  const tabs: { id: TabId; label: string; locked?: boolean }[] = [
    { id: "production", label: "Production" },
    { id: "audience", label: "Audience" },
    { id: "content", label: "Content" },
    { id: "revenue", label: "Revenue", locked: !revenueAllowed },
  ];

  function exportCsv() {
    const stamp = `${w.from}_${w.to}`;
    if (data.tab === "production") {
      const p = data.production;
      csvDownload(`production_${stamp}.csv`, [
        ["Type", "Number", "Title", "Posted", "Planned", "Days to post"],
        ...p.posted.map((x) => [x.kind === "short" ? "Short" : "Long video", x.number, x.title, x.day, x.plannedDay, x.cycleDays]),
      ]);
    } else if (data.tab === "audience") {
      const a = data.audience;
      csvDownload(`audience_${stamp}.csv`, [
        ["Date", "YouTube views", "Instagram views", "TikTok views"],
        ...a.days.map((d, i) => [d, a.views.youtube[i], a.views.instagram[i], a.views.tiktok[i]]),
        [],
        ["Country", "YouTube views"],
        ...a.countries.map((c) => [countryName(c.code), c.views]),
      ]);
    } else if (data.tab === "content") {
      csvDownload(`content_${stamp}.csv`, [
        ["Platform", "Title", "Published", "Views", "Likes", "Comments", "Shares", "Link"],
        ...data.content.items.map((c) => [PLATFORM[c.platform].name, c.title, c.publishedAt?.slice(0, 10) ?? null, c.views, c.likes, c.comments, c.shares, c.url]),
      ]);
    } else if (data.revenue.allowed) {
      const r = data.revenue;
      csvDownload(`revenue_${stamp}.csv`, [["Month", `Revenue (${r.currency})`, "YouTube views"], ...r.months.map((m) => [m.month, m.revenue.toFixed(2), m.views])]);
    }
  }

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-6 mb-5 flex-wrap">
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Analytics</h1>
          <p className="text-[14.5px] text-ink-soft">
            {teamName}: how the work flows, and how the videos do. {niceDay(w.from, true)} – {niceDay(w.to, true)}.
          </p>
        </div>
        {canSync && data.tab !== "production" && (
          <button
            type="button"
            disabled={syncing}
            onClick={() =>
              startSync(async () => {
                const r = await syncAnalyticsNow(teamId);
                if (r.error !== undefined) toast.error(r.error);
                else {
                  toast.success(r.summary);
                  router.refresh();
                }
              })
            }
            className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 h-10 text-[13.5px] font-semibold hover:border-line/40 hover:bg-surface-2 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
            </svg>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>

      <nav className="flex items-center gap-1 border-b border-line/15 overflow-x-auto no-scrollbar -mx-1 px-1 mb-4" aria-label="Analytics">
        {tabs.map((t) => {
          const on = t.id === data.tab;
          return (
            <Link
              key={t.id}
              href={href({ tab: t.id })}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={`relative px-2.5 sm:px-3.5 h-11 inline-flex items-center gap-1.5 text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {t.label}
              {t.locked && <LockIcon className="w-3.5 h-3.5 text-ink-faint" />}
              <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
            </Link>
          );
        })}
      </nav>

      {/* One row of filters: they scope everything below. */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-lg border border-line/15 p-0.5 bg-surface">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={range === r.id}
              onClick={() => go({ range: r.id })}
              className={`px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors ${range === r.id ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={compare}
          onClick={() => go({ compare: !compare })}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 h-9 text-[12.5px] font-semibold transition-colors ${compare ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
        >
          <span className={`w-7 h-4 rounded-full relative transition-colors ${compare ? "bg-amber" : "bg-line/20"}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${compare ? "left-3.5" : "left-0.5"}`} />
          </span>
          Compare with the {RANGES.find((r) => r.id === range)!.label} before
        </button>
        <span className="flex-1" />
        {!(data.tab === "revenue" && !data.revenue.allowed) && (
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-3 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
            <DownloadIcon className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      <div className={`transition-opacity duration-200 ${navigating ? "opacity-50" : ""}`}>
        {data.tab === "production" && <ProductionTab p={data.production} compare={compare} w={w} />}
        {data.tab === "audience" && <AudienceTab a={data.audience} compare={compare} />}
        {data.tab === "content" && <ContentTab items={data.content.items} status={data.content.status} />}
        {data.tab === "revenue" && <RevenueTab r={data.revenue} compare={compare} teamId={teamId} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

function ProductionTab({ p, compare, w }: { p: Production; compare: boolean; w: Window }) {
  const k = p.kpis;
  const nothing = !p.posted.length && !p.people.some((x) => x.done);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatTile label="Shorts posted" value={k.shortsPosted.value} prev={k.shortsPosted.prev} compare={compare} format={fmtInt} />
        <StatTile label="Long videos published" value={k.longsPublished.value} prev={k.longsPublished.prev} compare={compare} format={fmtInt} />
        <StatTile label="Shorts posted on time" value={k.onTime.value} prev={k.onTime.prev} compare={compare} format={fmtPct} unit="%" deltaMode="points" />
        <StatTile label="Days to post" value={k.cycleDays.value} prev={k.cycleDays.prev} compare={compare} format={fmtDays} good="down" hint="from idea · shorts, median" />
        <StatTile className="col-span-2 lg:col-span-1" label="Overdue right now" value={k.overdueNow} compare={false} format={fmtInt} good="down" hint={k.overdueNow ? "shorts past their date" : "nothing late"} />
      </div>

      {nothing ? (
        <div className="rounded-2xl border-2 border-dashed border-line/15 py-12 px-6 text-center flex flex-col items-center">
          <Mascot mood="idle" size={96} />
          <p className="text-[15px] font-semibold mt-3">Nothing posted in these {w.days} days</p>
          <p className="text-[13px] text-ink-soft mt-1">Pick a longer range, or come back once a few videos are out.</p>
        </div>
      ) : (
        <>
          <ChartCard
            title="Videos out"
            sub={w.days <= 31 ? "Per day" : w.days <= 120 ? "Per week" : "Per month"}
            right={<Legend shape="rect" items={[{ key: "s", label: "Shorts", color: SHORT_COLOR }, { key: "l", label: "Long videos", color: LONG_COLOR }]} />}
          >
            <StackedColumns
              ariaLabel="Videos posted per period"
              labels={p.buckets.map((b) => b.label)}
              series={[
                { key: "shorts", label: "Shorts", color: SHORT_COLOR, values: p.output.map((o) => o.shorts) },
                { key: "longs", label: "Long videos", color: LONG_COLOR, values: p.output.map((o) => o.longs) },
              ]}
            />
          </ChartCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Where work waits" sub="Average days a video spends in each step (steps finished in this range)">
              <div className="space-y-5">
                {(["short", "long"] as const).map((kind) => {
                  const list = p.stages.filter((s) => s.kind === kind && s.count > 0);
                  const slowest = list.reduce<(typeof list)[number] | null>((m, s) => (!m || (s.days ?? 0) > (m.days ?? 0) ? s : m), null);
                  return (
                    <div key={kind}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: kind === "short" ? SHORT_COLOR : LONG_COLOR }} />
                        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-soft">{kind === "short" ? "Shorts" : "Long videos"}</span>
                        {slowest && list.length > 1 && <span className="text-[12px] text-ink-faint">· slowest: {slowest.label}</span>}
                      </div>
                      <BarList
                        items={list.map((s) => ({ key: s.stage, label: s.label, value: s.days, sub: undefined }))}
                        format={(n) => (n === null ? "–" : `${fmtDays(n)} d`)}
                        color={kind === "short" ? SHORT_COLOR : LONG_COLOR}
                        empty="No steps finished in this range."
                      />
                    </div>
                  );
                })}
              </div>
            </ChartCard>

            <ChartCard title="People" sub="Steps finished in this range · on time = by their due date">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] font-bold uppercase tracking-wide text-ink-faint text-left">
                      <th className="font-bold px-1 pb-2">Person</th>
                      <th className="font-bold px-1 pb-2 text-right">Done</th>
                      <th className="font-bold px-1 pb-2 text-right">On time</th>
                      <th className="font-bold px-1 pb-2 text-right">On their plate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.people.map((x) => (
                      <tr key={x.userId} className="border-t border-line/10">
                        <td className="px-1 py-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <PersonAvatar name={x.name} avatarUrl={x.avatarUrl} color={x.color} className="w-6 h-6 text-[9px]" />
                            <span className="truncate font-semibold">{x.name}</span>
                          </span>
                        </td>
                        <td className="px-1 py-2 text-right tabular-nums font-semibold">{x.done}</td>
                        <td className="px-1 py-2 text-right tabular-nums text-ink-soft">{x.onTime === null ? "–" : `${x.onTime}%`}</td>
                        <td className="px-1 py-2 text-right tabular-nums text-ink-soft">{x.active}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <ChartCard title="Posted in this range" sub="Newest first">
              <ul className="divide-y divide-line/10 -my-1">
                {p.posted.slice(0, 15).map((x) => {
                  const late = x.plannedDay && x.day > x.plannedDay;
                  return (
                    <li key={`${x.kind}${x.id}`} className="flex items-center gap-3 py-2">
                      <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: x.kind === "short" ? SHORT_COLOR : LONG_COLOR }} aria-label={x.kind === "short" ? "Short" : "Long video"} />
                      <Link href={x.kind === "short" ? `/shorts/${x.id}` : `/videos/${x.id}`} className="flex-1 min-w-0 truncate text-[13.5px] hover:underline">
                        <span className="font-mono text-ink-faint mr-1.5 text-[12px]">#{x.number}</span>
                        {x.title}
                      </Link>
                      {x.plannedDay && <span className={`text-[11.5px] font-semibold ${late ? "text-red" : "text-green"}`}>{late ? "late" : "on time"}</span>}
                      <span className="text-[12px] text-ink-faint tabular-nums w-14 text-right">{niceDay(x.day)}</span>
                    </li>
                  );
                })}
              </ul>
              {p.posted.length > 15 && <p className="text-[12px] text-ink-faint mt-2">and {p.posted.length - 15} more (in the CSV).</p>}
            </ChartCard>
            <ChartCard title="Automatic posting" sub="Scheduled posts in this range">
              {p.posting.length ? (
                <ul className="space-y-3">
                  {p.posting.map((x) => {
                    const total = x.published + x.failed;
                    return (
                      <li key={x.platform} className="flex items-center gap-3">
                        <PlatformIcon platform={x.platform as "youtube"} className="w-7 h-7 rounded-lg" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13.5px] font-semibold">{PLATFORM[x.platform as keyof typeof PLATFORM]?.name ?? x.platform}</span>
                          <span className="block text-[12px] text-ink-soft">
                            {x.published} posted
                            {x.failed > 0 && <span className="text-red font-semibold"> · {x.failed} failed</span>}
                          </span>
                        </span>
                        <span className={`text-[13px] font-bold tabular-nums ${x.failed ? "text-ink" : "text-green"}`}>{total ? Math.round((x.published / total) * 100) : 0}%</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-faint">No automatic posts in this range.</p>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

function StatusRow({ status }: { status: PlatformStatus[] }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      {status.map((s) => (
        <span
          key={s.platform}
          title={s.lastError ?? undefined}
          className={`inline-flex items-center gap-2 rounded-full border pl-1 pr-3 h-8 text-[12px] font-semibold ${s.lastError && s.connected ? "border-red/30 bg-red/5" : "border-line/15 bg-surface"}`}
        >
          <PlatformIcon platform={s.platform as "youtube"} className={`w-6 h-6 rounded-full ${s.connected ? "" : "opacity-40 grayscale"}`} />
          <span className="text-ink">{PLATFORM[s.platform].name}</span>
          <span className="text-ink-faint font-medium">
            {!s.connected
              ? "not connected"
              : !s.statsReady
                ? "reconnect to allow stats"
                : s.lastError
                  ? "last sync failed"
                  : s.lastOkAt
                    ? `synced ${new Date(s.lastOkAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                    : "waiting for the first sync"}
          </span>
        </span>
      ))}
    </div>
  );
}

function SetupCard({ status }: { status: PlatformStatus[] }) {
  const connected = status.some((s) => s.connected);
  return (
    <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
      <Mascot mood="idle" size={110} className="flex-shrink-0" />
      <div className="min-w-0">
        <h2 className="font-display text-[22px] font-semibold">No platform numbers yet</h2>
        <ol className="mt-3 space-y-2 text-[14px] text-ink-soft list-decimal pl-5">
          <li className={connected ? "line-through text-ink-faint" : ""}>
            Connect YouTube, Instagram or TikTok in{" "}
            <Link href="/team?tab=accounts" className="font-semibold text-amber hover:underline">
              Team → Connected accounts
            </Link>
            .
          </li>
          <li>If it says &ldquo;reconnect to allow stats&rdquo;, reconnect it once: the sign-in now also asks to read stats (and YouTube revenue).</li>
          <li>The numbers are copied every morning. A master or scheduler can press &ldquo;Sync now&rdquo; for the first copy (it brings the last 90 days).</li>
        </ol>
        <p className="mt-3 text-[12.5px] text-ink-faint">The Production tab works right away: it uses your own shorts and long videos.</p>
      </div>
    </div>
  );
}

function AudienceTab({ a, compare }: { a: Audience; compare: boolean }) {
  const ready = a.status.some((s) => s.connected && s.statsReady);
  const active = (["youtube", "instagram", "tiktok"] as const).filter((p) => a.views[p].some((v) => v !== null));
  const dayLabels = a.days.map((d) => niceDay(d));
  const [mode, setMode] = useState<"platform" | "total">("platform");
  // One platform: its line IS the total, so compare right away.
  const together = mode === "total" || active.length <= 1;
  const totalViews = a.days.map((_, i) => (active.some((p) => a.views[p][i] !== null) ? active.reduce((s, p) => s + (a.views[p][i] ?? 0), 0) : null));
  const t = a.totals;
  if (!ready || !a.hasData)
    return (
      <>
        <StatusRow status={a.status} />
        <SetupCard status={a.status} />
      </>
    );
  const split = a.youtubeSplit;
  const splitTotal = split ? split.shorts + split.long : 0;
  return (
    <div className="space-y-5">
      <StatusRow status={a.status} />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile label="Views" value={t.views.value} prev={t.views.prev} compare={compare} />
        <StatTile label="Watch time (YouTube)" value={t.watchHours.value} prev={t.watchHours.prev} compare={compare} unit=" h" />
        <StatTile label="Likes, comments & shares" value={t.engagement.value} prev={t.engagement.prev} compare={compare} />
        <StatTile label="New followers (net)" value={t.followersNet.value} prev={t.followersNet.prev} compare={compare} good="up" />
      </div>

      <ChartCard
        title="Views per day"
        sub={
          together
            ? `All platforms together${compare ? ` · dashed: the ${a.days.length} days before` : ""}`
            : `By platform${compare ? " · switch to Together to compare with before" : ""}`
        }
        right={
          <div className="flex items-center gap-4 flex-wrap justify-end">
            {!together && <Legend items={active.map((p) => ({ key: p, label: PLATFORM[p].name, color: PLATFORM[p].color }))} />}
            {together && compare && (
              <Legend
                items={[
                  { key: "now", label: "This range", color: TOTAL_COLOR },
                  { key: "prev", label: "Before", color: "rgb(var(--ink-faint))", dashed: true },
                ]}
              />
            )}
            {active.length > 1 && (
              <div role="radiogroup" aria-label="Lines" className="inline-flex rounded-lg border border-line/15 p-0.5">
                {(["platform", "total"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors ${mode === m ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
                  >
                    {m === "platform" ? "By platform" : "Together"}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      >
        <LineChart
          ariaLabel={together ? "Views per day, all platforms" : "Views per day by platform"}
          labels={dayLabels}
          series={together ? [{ key: "total", label: "Views", color: active.length === 1 ? PLATFORM[active[0]].color : TOTAL_COLOR, values: totalViews }] : active.map((p) => ({ key: p, label: PLATFORM[p].name, color: PLATFORM[p].color, values: a.views[p] }))}
          previous={together && compare ? { label: "Before", values: a.prevViews } : null}
        />
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Views by platform" sub="This range">
          <BarList items={a.byPlatform.filter((p) => p.views || p.prev).map((p) => ({ key: p.platform, label: <span className="inline-flex items-center gap-2"><PlatformIcon platform={p.platform as "youtube"} className="w-5 h-5 rounded" />{PLATFORM[p.platform].name}</span>, value: p.views, color: PLATFORM[p.platform].color, sub: compare && p.prev ? `before: ${fmtCompact(p.prev)}` : undefined }))} format={fmtCompact} />
          <div className="mt-4 pt-4 border-t border-line/10 flex flex-wrap gap-x-6 gap-y-2">
            {(["youtube", "instagram", "tiktok"] as const)
              .filter((p) => a.followersNow[p] !== undefined)
              .map((p) => (
                <span key={p} className="text-[12.5px] text-ink-soft">
                  {PLATFORM[p].name}: <b className="text-ink tabular-nums">{fmtCompact(a.followersNow[p]!)}</b> {p === "youtube" ? "subscribers" : "followers"}
                </span>
              ))}
          </div>
        </ChartCard>
        <ChartCard title="Shorts vs long videos" sub="YouTube views in this range">
          {split && splitTotal > 0 ? (
            <div>
              <div className="flex h-6 rounded-lg overflow-hidden gap-[2px]" role="img" aria-label={`Shorts ${fmtCompact(split.shorts)}, long videos ${fmtCompact(split.long)}`}>
                <span style={{ width: `${(split.shorts / splitTotal) * 100}%`, background: SHORT_COLOR }} />
                <span style={{ width: `${(split.long / splitTotal) * 100}%`, background: LONG_COLOR }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  ["Shorts", split.shorts, SHORT_COLOR],
                  ["Long videos", split.long, LONG_COLOR],
                ].map(([label, v, c]) => (
                  <div key={label as string} className="flex items-start gap-2">
                    <span className="mt-1.5 w-2.5 h-2.5 rounded-[3px]" style={{ background: c as string }} />
                    <span>
                      <span className="block text-[12.5px] text-ink-soft">{label as string}</span>
                      <span className="block text-[20px] font-display font-semibold">{fmtCompact(v as number)}</span>
                      <span className="block text-[12px] text-ink-faint">{Math.round(((v as number) / splitTotal) * 100)}% of views</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-faint">YouTube hasn&rsquo;t split these days yet.</p>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Where the views come from" sub={`YouTube views by country${a.countriesSince ? ` (since ${niceDay(a.countriesSince)}, when copying started)` : ""}`}>
        {a.countries.length ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] items-start">
            <WorldMap data={a.countries.map((c) => ({ code: c.code, value: c.views }))} format={fmtInt} label="World map of YouTube views by country" />
            <div>
              <BarList items={a.countries.slice(0, 10).map((c) => ({ key: c.code, label: countryName(c.code), value: c.views }))} format={fmtCompact} />
              {a.countries.length > 10 && <p className="text-[12px] text-ink-faint mt-2">and {a.countries.length - 10} more countries (in the CSV).</p>}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-ink-faint">No country numbers yet (YouTube only shares them for days already copied).</p>
        )}
        {a.igFollowerCountries.length > 0 && (
          <div className="mt-6 pt-5 border-t border-line/10">
            <h3 className="text-[13px] font-semibold mb-3">Instagram followers by country</h3>
            <div className="max-w-2xl">
              <BarList items={a.igFollowerCountries.slice(0, 8).map((c) => ({ key: c.code, label: countryName(c.code), value: c.value, color: PLATFORM.instagram.color }))} format={fmtCompact} />
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function ContentTab({ items, status }: { items: ContentItem[]; status: PlatformStatus[] }) {
  const [platform, setPlatform] = useState<"all" | "youtube" | "instagram" | "tiktok">("all");
  const list = useMemo(() => items.filter((i) => platform === "all" || i.platform === platform), [items, platform]);
  if (!status.some((s) => s.connected && s.statsReady) && !items.length)
    return (
      <>
        <StatusRow status={status} />
        <SetupCard status={status} />
      </>
    );
  return (
    <div className="space-y-4">
      <StatusRow status={status} />
      <div className="flex items-center gap-1.5 flex-wrap">
        {(["all", "youtube", "instagram", "tiktok"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={platform === p}
            onClick={() => setPlatform(p)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-[12.5px] font-semibold transition-colors ${platform === p ? "bg-ink text-paper" : "text-ink-soft hover:bg-surface-2 hover:text-ink"}`}
          >
            {p === "all" ? "All platforms" : PLATFORM[p].name}
            <span className={`text-[11px] font-medium ${platform === p ? "text-paper/60" : "text-ink-faint"}`}>{p === "all" ? items.length : items.filter((i) => i.platform === p).length}</span>
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="rounded-2xl border border-line/10 bg-surface overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint text-left">
                <th className="px-3 py-2 font-bold">Video</th>
                <th className="px-3 py-2 font-bold">Published</th>
                <th className="px-3 py-2 font-bold text-right">Views</th>
                <th className="px-3 py-2 font-bold text-right">Likes</th>
                <th className="px-3 py-2 font-bold text-right">Comments</th>
                <th className="px-3 py-2 font-bold text-right">Shares</th>
                <th className="px-3 py-2 font-bold">Ours</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={`${c.platform}${c.id}`} className="border-t border-line/10 hover:bg-surface-2/40">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="relative w-16 h-9 rounded-md overflow-hidden bg-surface-2 flex-shrink-0">
                        {c.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                        )}
                        <PlatformIcon platform={c.platform as "youtube"} className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded" />
                      </span>
                      <span className="min-w-0">
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold hover:underline">
                            <span className="truncate max-w-[22rem]">{c.title || "Untitled"}</span>
                            <ExternalIcon className="w-3 h-3 text-ink-faint flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="font-semibold truncate block max-w-[22rem]">{c.title || "Untitled"}</span>
                        )}
                        <span className="text-[11.5px] text-ink-faint">{c.kind === "short" ? "Short" : c.kind === "long" ? "Long video" : "Post"}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{c.publishedAt ? niceDay(c.publishedAt.slice(0, 10)) : "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtInt(c.views)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.likes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.comments)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.shares)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.ours ? (
                      <Link href={c.ours.kind === "short" ? `/shorts/${c.ours.id}` : `/videos/${c.ours.id}`} className="font-mono text-[12px] font-semibold text-amber hover:underline">
                        #{c.ours.number ?? "?"}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line/20 py-10 text-center text-[13.5px] text-ink-soft">Nothing published in this range.</p>
      )}
      <p className="text-[12px] text-ink-faint">Numbers are each video&rsquo;s totals as of the last sync. YouTube: the latest 50 uploads · Instagram: the latest 25 posts · TikTok: public videos.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

function RevenueTab({ r, compare, teamId }: { r: Revenue; compare: boolean; teamId: string }) {
  if (!r.allowed)
    return (
      <div className="rounded-2xl border border-line/10 bg-surface p-8 text-center flex flex-col items-center">
        <span className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-ink-soft">
          <LockIcon className="w-6 h-6" />
        </span>
        <p className="text-[15px] font-semibold mt-3">Revenue is private</p>
        <p className="text-[13px] text-ink-soft mt-1 max-w-sm">Only masters, and the people a master chooses, can see the channel&rsquo;s revenue.</p>
      </div>
    );
  // Big numbers and round axis ticks without cents; everything else with them.
  const money = (n: number | null) => {
    if (n === null) return "–";
    const d = Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  };
  const cents = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: r.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return (
    <div className="space-y-5">
      {r.note && <p className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5 text-[13px] text-ink">{r.note}</p>}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <StatTile label="Estimated revenue" value={r.total.value} prev={r.total.prev} compare={compare} format={money} />
        <StatTile label="Per 1,000 views (RPM)" value={r.rpm.value} prev={r.rpm.prev} compare={compare} format={(n) => (n === null ? "–" : cents(n))} />
        <StatTile className="col-span-2 lg:col-span-1" label="Best day" value={r.bestDay?.revenue ?? null} compare={false} format={(n) => (n === null ? "–" : cents(n))} hint={r.bestDay ? niceDay(r.bestDay.day) : undefined} />
      </div>
      {r.hasData ? (
        <ChartCard title="Revenue" sub={`YouTube estimated revenue (${r.currency})`}>
          <StackedColumns ariaLabel="Revenue per period" labels={r.buckets.map((b) => b.label)} series={[{ key: "rev", label: "Revenue", color: "rgb(var(--chart-yt))", values: r.perBucket.map((b) => b.revenue) }]} format={money} />
        </ChartCard>
      ) : (
        <p className="rounded-2xl border border-dashed border-line/20 py-10 px-6 text-center text-[13.5px] text-ink-soft">
          No revenue copied yet. It needs YouTube connected with stats allowed, a monetized channel, and a sync.
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="By month" sub="The last 12 months">
          {r.months.length ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-ink-faint text-left">
                  <th className="font-bold pb-2">Month</th>
                  <th className="font-bold pb-2 text-right">Revenue</th>
                  <th className="font-bold pb-2 text-right">RPM</th>
                </tr>
              </thead>
              <tbody>
                {r.months.map((m) => (
                  <tr key={m.month} className="border-t border-line/10">
                    <td className="py-2">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{cents(m.revenue)}</td>
                    <td className="py-2 text-right tabular-nums text-ink-soft">{m.views ? cents((m.revenue / m.views) * 1000) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-ink-faint">Nothing yet.</p>
          )}
        </ChartCard>
        {r.isMaster && <AccessCard r={r} teamId={teamId} />}
      </div>
    </div>
  );
}

function AccessCard({ r, teamId }: { r: Revenue; teamId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <ChartCard title="Who can see revenue" sub="Masters always can. Turn it on for anyone else you trust with it.">
      <ul className="space-y-1">
        {r.access.map((p) => {
          const on = p.master || p.granted;
          return (
            <li key={p.userId} className="flex items-center gap-2.5 py-1.5">
              <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-7 h-7 text-[10px]" />
              <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{p.name}</span>
              {p.master ? (
                <span className="text-[12px] text-ink-faint">Master</span>
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${p.name} can see revenue`}
                  disabled={busy === p.userId}
                  onClick={async () => {
                    setBusy(p.userId);
                    const res = await setRevenueAccess(teamId, p.userId, !on);
                    setBusy(null);
                    if (res.error !== undefined) toast.error(res.error);
                    else router.refresh();
                  }}
                  className={`w-10 h-6 rounded-full relative transition-colors disabled:opacity-60 ${on ? "bg-amber" : "bg-line/20"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
