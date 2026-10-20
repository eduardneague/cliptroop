"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { DownloadIcon, LockIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { syncAnalyticsNow } from "@/app/(dashboard)/analytics/actions";
import { startNavProgress } from "@/components/ui/nav-progress";
import type { SocialPlatform } from "@/lib/social/providers";
import { rangeLabel, rangesFor, type RangeId, type TabId, type Window } from "../lib/ranges";
import type { Audience, ContentItem, PlatformStatus, Production, Revenue } from "../lib/queries";
import type { AdvancedData, AdvBreakdown, Content as AdvContent } from "../lib/advanced";
import type { Overview } from "../lib/overview";
import type { Insights, InsightsPreview } from "../lib/insights";
import { countryName } from "./world-map";
import { KIND_LABEL } from "../lib/kinds";
import { RangeBar } from "./range-bar";
import { PLATFORM, type P, csvDownload, pickedIn, niceDay } from "./tabs/shared";
import { OverviewTab, overviewCsv } from "./tabs/overview-tab";
import { ContentTab } from "./tabs/content-tab";
import { AudienceTab } from "./tabs/audience-tab";
import { RealtimeTab } from "./tabs/realtime-tab";
import { RevenueTab } from "./tabs/revenue-tab";
import { InsightsTab } from "./tabs/insights-tab";
import { ProductionTab } from "./tabs/production-tab";
import { ADV_VIEWS, type AdvView } from "./advanced/views";
import { AdvancedTab } from "./advanced/advanced-tab";

/*
 * Analytics (1.20.0): tabs instead of one long page, like YouTube Studio.
 * Overview · Content · Audience · Realtime · Revenue · Insights · Advanced ·
 * Production. One row of filters under the tabs (the date range, compare,
 * export) scopes everything below; tabs that don't use a range don't show it.
 */

// The export for Claude comes with its button. (The Advanced tab is no longer loaded apart: next/dynamic
// gave its icons other ids on the server than in the browser, a hydration mismatch.)
const ClaudeExport = dynamic(() => import("../export/claude-export").then((m) => m.ClaudeExport), { ssr: false });

export type AnalyticsData =
  | { tab: "overview"; overview: Overview; insights: Promise<InsightsPreview> }
  | { tab: "production"; production: Production }
  | { tab: "audience"; audience: Audience; breakdowns: Partial<Record<SocialPlatform, AdvBreakdown[]>> }
  | { tab: "content"; content: { items: ContentItem[]; status: PlatformStatus[]; every?: boolean } }
  | { tab: "realtime"; status: PlatformStatus[] }
  | { tab: "insights"; insights: Insights }
  | { tab: "advanced"; advanced: AdvancedData; view: AdvView | null }
  | { tab: "revenue"; revenue: Revenue };

const TAB_LABEL: Record<TabId, string> = {
  overview: "Overview",
  content: "Content",
  audience: "Audience",
  realtime: "Realtime",
  revenue: "Revenue",
  insights: "Insights",
  advanced: "Advanced",
  production: "Production",
};
const TAB_ORDER: TabId[] = ["overview", "content", "audience", "realtime", "revenue", "insights", "advanced", "production"];

export function AnalyticsView({
  teamId,
  teamName,
  window: w,
  range,
  compare: compareAsked,
  canSync,
  catchingUp = false,
  revenueAllowed,
  latest,
  earliest,
  data,
}: {
  teamId: string;
  teamName: string;
  window: Window;
  range: RangeId;
  compare: boolean;
  canSync: boolean;
  /** The morning copy was missed and a catch-up just started (this page refreshes itself when it's likely done). */
  catchingUp?: boolean;
  revenueAllowed: boolean;
  /** The last day with numbers (the range bar's custom panel). */
  latest: string;
  /** The first day with numbers (Lifetime). */
  earliest: string | null;
  data: AnalyticsData;
}) {
  const router = useRouter();
  const toast = useToast();
  // Compare: on the page itself (every tab already has the stretch before), so it switches at once.
  const [compare, setCompareState] = useState(compareAsked);
  useEffect(() => setCompareState(compareAsked), [compareAsked]);
  const setCompare = (on: boolean) => {
    setCompareState(on);
    try {
      const url = new URL(window.location.href);
      if (on) url.searchParams.delete("compare");
      else url.searchParams.set("compare", "0");
      window.history.replaceState(window.history.state, "", url);
    } catch {}
  };
  const [updating, setUpdating] = useState(catchingUp);
  useEffect(() => {
    if (catchingUp) setUpdating(true);
  }, [catchingUp]);
  useEffect(() => {
    if (!updating) return;
    // Each platform's copy takes up to a minute, then its live counts: look a few times.
    const looks = [25_000, 55_000, 90_000].map((ms) => window.setTimeout(() => router.refresh(), ms));
    const done = window.setTimeout(() => setUpdating(false), 95_000);
    return () => {
      looks.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(done);
    };
  }, [updating, router]);
  // Audience: which platforms to show (null = all that have numbers). Remembered on
  // this device; read after the first paint so the server and browser render the same.
  const [picked, setPickedState] = useState<P[] | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("vp-audience-platforms");
      const v = raw ? (JSON.parse(raw) as string[]).filter((x): x is P => x in PLATFORM) : null;
      if (v && v.length) setPickedState(v);
    } catch {}
  }, []);
  const setPicked = (v: P[] | null) => {
    setPickedState(v);
    try {
      if (v) window.localStorage.setItem("vp-audience-platforms", JSON.stringify(v));
      else window.localStorage.removeItem("vp-audience-platforms");
    } catch {}
  };
  const [navigating, startNav] = useTransition();
  const [syncing, startSync] = useTransition();
  // Where a click is taking the page (1.21.0): the tab and the range show it at once, the rest catches up.
  const [pending, setPending] = useState<{ tab?: TabId; range?: RangeId } | null>(null);
  useEffect(() => setPending(null), [data.tab, range, w.from, w.to]);
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(null), 15_000);
    return () => window.clearTimeout(t);
  }, [pending]);
  // Advanced: the platform last looked at (this device), for the tab's link.
  const [advPref, setAdvPref] = useState<string | null>(null);
  const advPlatform = data.tab === "advanced" ? data.advanced.platform : null;
  useEffect(() => {
    try {
      if (advPlatform) window.localStorage.setItem("vp-adv-platform", advPlatform);
      setAdvPref(advPlatform ?? window.localStorage.getItem("vp-adv-platform"));
    } catch {}
  }, [advPlatform]);
  const [claudeOpen, setClaudeOpen] = useState(false);
  // ?claude=1 (the search bar's "Download for Claude"): the window opens, the address is tidied up.
  const wantsClaude = useSearchParams().get("claude") === "1";
  useEffect(() => {
    if (!wantsClaude) return;
    setClaudeOpen(true);
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("claude");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch {}
  }, [wantsClaude]);
  const custom = range === "custom" ? { from: w.from, to: w.to } : null;

  type HrefOpts = { tab?: TabId; range?: RangeId; custom?: { from: string; to: string } | null; compare?: boolean; platform?: string; content?: AdvContent; view?: AdvView | null };
  const href = (p: HrefOpts) => {
    const tab = p.tab ?? data.tab;
    const r = p.range ?? range;
    const q = new URLSearchParams({ tab, range: r });
    const c = p.custom ?? custom;
    if (r === "custom" && c) {
      q.set("from", c.from);
      q.set("to", c.to);
    }
    if (!(p.compare ?? compare)) q.set("compare", "0");
    if (tab === "advanced") {
      const platform = p.platform ?? (data.tab === "advanced" ? data.advanced.platform : advPref);
      const content = p.content ?? (data.tab === "advanced" && !p.platform ? data.advanced.content : "all");
      if (platform && /^(youtube|instagram|facebook|tiktok)$/.test(platform)) q.set("platform", platform);
      if (content !== "all") q.set("content", content);
      const view = p.view === undefined ? (data.tab === "advanced" ? data.view : null) : p.view;
      if (view && view !== "summary") q.set("view", view);
    }
    return `/analytics?${q}`;
  };
  const go = (p: HrefOpts) => {
    if (p.range || p.tab) setPending({ ...(p.tab ? { tab: p.tab } : {}), ...(p.range ? { range: p.range } : {}) });
    startNavProgress(href(p));
    startNav(() => router.push(href(p), { scroll: false }));
  };
  const busy = navigating || !!pending;
  const usesRange = rangesFor(data.tab).length > 0 && data.tab !== "insights";
  const usesCompare = usesRange && data.tab !== "content";

  function exportCsv() {
    const stamp = `${w.from}_${w.to}`;
    if (data.tab === "overview") {
      csvDownload(`overview_${data.overview.hourly ? "48-hours" : stamp}.csv`, overviewCsv(data.overview));
    } else if (data.tab === "production") {
      const p = data.production;
      csvDownload(`production_${stamp}.csv`, [
        ["Type", "Number", "Title", "Posted", "Planned", "Days to post"],
        ...p.posted.map((x) => [x.kind === "short" ? "Short" : "Long video", x.number, x.title, x.day, x.plannedDay, x.cycleDays]),
      ]);
    } else if (data.tab === "audience") {
      const a = data.audience;
      const ps = pickedIn(a, picked);
      csvDownload(`audience_${stamp}.csv`, [
        ["Date", ...ps.flatMap((p) => [`${PLATFORM[p].name} views`, `${PLATFORM[p].name} engagement`, `${PLATFORM[p].name} ${p === "youtube" ? "subscribers" : "followers"}`]), ...(ps.includes("youtube") ? ["YouTube watch hours"] : [])],
        ...a.days.map((d, i) => [
          d,
          ...ps.flatMap((p) => [a.perPlatform[p].views[i], a.perPlatform[p].engagement[i], a.followersDaily?.[p]?.[i] ?? null]),
          ...(ps.includes("youtube") ? [a.perPlatform.youtube.watchHours[i] === null ? null : Math.round(a.perPlatform.youtube.watchHours[i]! * 10) / 10] : []),
        ]),
        [],
        ["Country", "YouTube views"],
        ...a.countries.map((c) => [countryName(c.code), c.views]),
      ]);
    } else if (data.tab === "content") {
      csvDownload(`content_${range === "lifetime" ? "every-video" : stamp}.csv`, [
        ["Platform", "Kind", "Title", "Published", "Views", "× typical", "Likes", "Comments", "Shares", "Impressions", "CTR (%)", "Link"],
        ...data.content.items.map((c) => [
          PLATFORM[c.platform].name,
          KIND_LABEL[c.kind],
          c.title,
          c.publishedAt?.slice(0, 10) ?? null,
          c.views,
          c.score === null || c.score === undefined ? null : Math.round(c.score * 100) / 100,
          c.likes,
          c.comments,
          c.shares,
          c.impressions ?? null,
          c.ctr ?? null,
          c.url,
        ]),
      ]);
    } else if (data.tab === "advanced") {
      const a = data.advanced;
      const keys = [...new Set(a.videos.flatMap((v) => Object.keys(v.metrics)))].sort();
      const money = a.videos.some((v) => v.revenue);
      csvDownload(`advanced_${a.platform}_${stamp}.csv`, [
        [
          "Platform", "Title", "Published", "Kind", "Length (s)", "Views", "Impressions", "CTR (%)", "Engaged views", "Watch hours", "Average view (s)", "Average % viewed", "Still watching after 3 s (%)", "Halfway (%)", "At the end (%)",
          "Likes", "Comments", "Shares", "Saves", "Reach", "Subscribers gained", "Skipped (%)", "Reposts", ...keys,
          ...(money ? [`Revenue (${a.currency})`, `RPM (${a.currency})`, `CPM (${a.currency})`, "Ad impressions", "Monetized playbacks"] : []),
          "Ours", "Hook", "Link",
        ],
        ...a.videos.map((v) => [
          a.platform, v.title, v.publishedAt?.slice(0, 16).replace("T", " ") ?? null, v.kind, v.durationSec, v.views, v.impressions, v.ctr, v.engagedViews, v.watchMinutes === null ? null : Math.round((v.watchMinutes / 60) * 10) / 10, v.avgViewSeconds, v.avgViewPct,
          v.retention?.at3s === null || v.retention?.at3s === undefined ? null : Math.round(v.retention.at3s * 100),
          v.retention?.at50 === null || v.retention?.at50 === undefined ? null : Math.round(v.retention.at50 * 100),
          v.retention?.end === null || v.retention?.end === undefined ? null : Math.round(v.retention.end * 100),
          v.likes, v.comments, v.shares, v.saves, v.reach, v.subscribersGained, v.skipRate, v.reposts, ...keys.map((k) => v.metrics[k] ?? null),
          ...(money ? [v.revenue?.revenue?.toFixed(2) ?? null, v.revenue?.rpm?.toFixed(2) ?? null, v.revenue?.cpm?.toFixed(2) ?? null, v.revenue?.adImpressions ?? null, v.revenue?.monetizedPlaybacks ?? null] : []),
          v.ours ? `#${v.ours.number ?? "?"}` : null, v.hook, v.url,
        ]),
        [],
        ["Group", "Number", "This range", "Before"],
        ...a.groups.flatMap((g) => g.tiles.map((t) => [g.title, t.label, t.value === null ? null : Math.round(t.value * 100) / 100, t.prev === null ? null : Math.round(t.prev * 100) / 100])),
        [],
        ["Breakdown", "Where it's from", "Name", "Views", "Watch hours", "Value"],
        ...a.breakdowns.flatMap((b) => b.rows.map((r) => [b.title, b.sub, r.label, r.views, r.watchMinutes === null ? null : Math.round((r.watchMinutes / 60) * 10) / 10, r.value])),
      ]);
    } else if (data.tab === "revenue" && data.revenue.allowed) {
      const r = data.revenue;
      csvDownload(`revenue_${stamp}.csv`, [
        ["Stream", `Amount (${r.currency})`],
        ...r.streams.map((x) => [x.label, x.amount.toFixed(2)]),
        ["All streams", (r.all.value ?? 0).toFixed(2)],
        [],
        ["Month", `YouTube (${r.currency})`, `Facebook (${r.currency})`, `Other income (${r.currency})`, `Total (${r.currency})`, "YouTube views"],
        ...r.months.map((m) => [m.month, m.revenue.toFixed(2), m.facebook.toFixed(2), m.other.toFixed(2), (m.revenue + m.facebook + m.other).toFixed(2), m.views]),
        [],
        ["Date", "Other income", `Amount (${r.currency})`, "Note"],
        ...r.entries.map((e) => [e.day, e.source, e.amount.toFixed(2), e.note]),
      ]);
    }
  }
  const canExport = !["realtime", "insights"].includes(data.tab) && !(data.tab === "revenue" && !data.revenue.allowed);

  const when =
    data.tab === "realtime"
      ? "the last 48 hours, live"
      : data.tab === "insights"
        ? "every video"
        : data.tab === "overview" && data.overview.hourly
          ? "the last 48 hours"
          : `${niceDay(w.from, true)} – ${niceDay(w.to, true)}`;

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-x-6 gap-y-3 mb-5 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Analytics</h1>
          <p className="text-[14.5px] text-ink-soft">
            {teamName} · {when}
          </p>
        </div>
        {data.tab !== "production" && (updating || canSync) && (
          <div className="flex flex-col items-start sm:items-end gap-1.5">
            {canSync && (
              <button
                type="button"
                disabled={syncing}
                onClick={() =>
                  startSync(async () => {
                    // (Never throws into the page: a failed request is a message, not a crash.)
                    try {
                      const r = await syncAnalyticsNow(teamId);
                      if (r.error !== undefined) toast.error(r.error);
                      else {
                        toast.success(r.summary);
                        setUpdating(true);
                      }
                    } catch {
                      toast.error("Couldn't start the sync. Check your connection and try again.");
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
            <p className="text-[11.5px] text-ink-faint sm:text-right max-w-[260px]" role="status">
              {updating ? (
                <span className="text-ink-soft">
                  <span aria-hidden className="inline-block align-middle mr-1.5 -mt-0.5 w-1.5 h-1.5 rounded-[2px] bg-amber animate-pulse" />
                  Getting the latest numbers… this page updates by itself.
                </span>
              ) : (
                "Counts update every 10 minutes, daily totals every morning."
              )}
            </p>
          </div>
        )}
      </div>

      <nav className="flex items-center gap-0.5 border-b border-line/15 overflow-x-auto no-scrollbar -mx-4 px-3 sm:mx-0 sm:px-0 mb-4" aria-label="Analytics">
        {TAB_ORDER.map((id) => {
          const on = id === (pending?.tab ?? data.tab);
          const locked = id === "revenue" && !revenueAllowed;
          return (
            <Link
              key={id}
              href={href({ tab: id })}
              scroll={false}
              aria-current={on ? "page" : undefined}
              onClick={() => {
                if (on) return;
                setPending({ tab: id });
                startNavProgress(href({ tab: id }));
              }}
              className={`relative px-2.5 sm:px-3.5 h-11 inline-flex items-center gap-1.5 text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {id === "realtime" && (
                <span aria-hidden className="relative inline-flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-green/60 motion-safe:animate-ping" />
                  <span className="relative w-2 h-2 rounded-full bg-green" />
                </span>
              )}
              {TAB_LABEL[id]}
              {locked && <LockIcon className="w-3.5 h-3.5 text-ink-faint" />}
              <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-[2px] bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
            </Link>
          );
        })}
      </nav>

      {/* One row of filters: they scope everything below. */}
      {(usesRange || canExport) && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {usesRange && <RangeBar tab={data.tab} range={pending?.range ?? range} w={w} latest={latest} earliest={earliest} onPick={(r, c) => go({ range: r, custom: c ?? null })} />}
          {busy && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-faint" role="status">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-amber/30 border-t-amber animate-spin" aria-hidden />
              Loading…
            </span>
          )}
          {usesCompare && !(data.tab === "overview" && range === "lifetime") && (
            <button
              type="button"
              role="switch"
              aria-checked={compare}
              onClick={() => setCompare(!compare)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 h-9 text-[12.5px] font-semibold transition-colors ${compare ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
            >
              <span className={`w-7 h-4 rounded-[5px] relative transition-colors ${compare ? "bg-amber" : "bg-line/20"}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-[3px] bg-white transition-all ${compare ? "left-3.5" : "left-0.5"}`} />
              </span>
              <span className="hidden sm:inline">Compare with the {range === "custom" || range === "lifetime" ? `${w.days} days` : rangeLabel(range).replace("365 days", "year")} before</span>
              <span className="sm:hidden">Compare</span>
            </button>
          )}
          <span className="flex-1" />
          {canExport && (
            <button type="button" onClick={exportCsv} title="Export CSV" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/15 w-9 sm:w-auto sm:px-3 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
              <DownloadIcon className="w-4 h-4" />
              <span className="sr-only sm:not-sr-only">Export CSV</span>
            </button>
          )}
        </div>
      )}

      <div className={`transition-opacity duration-200 ${busy ? "opacity-50 pointer-events-none" : ""}`} aria-busy={busy || undefined}>
        {data.tab === "overview" && (
          <OverviewTab
            teamId={teamId}
            o={data.overview}
            insights={data.insights}
            compare={compare && range !== "lifetime"}
            range={range}
            w={w}
            hrefs={{
              realtime: href({ tab: "realtime" }),
              insights: href({ tab: "insights" }),
              content: href({ tab: "content" }),
              audience: href({ tab: "audience" }),
              advanced: (platform) => href({ tab: "advanced", ...(platform ? { platform } : {}), content: "all" }),
            }}
          />
        )}
        {data.tab === "production" && <ProductionTab p={data.production} compare={compare} w={w} />}
        {data.tab === "audience" && <AudienceTab a={data.audience} breakdowns={data.breakdowns} compare={compare} picked={pickedIn(data.audience, picked)} setPicked={setPicked} />}
        {data.tab === "content" && (
          <ContentTab
            items={data.content.items}
            status={data.content.status}
            every={range === "lifetime"}
            rangeLabel={range === "custom" || range === "lifetime" ? null : rangeLabel(range)}
            advancedHref={href({ tab: "advanced" })}
          />
        )}
        {data.tab === "realtime" && <RealtimeTab teamId={teamId} status={data.status} />}
        {data.tab === "insights" && <InsightsTab teamId={teamId} i={data.insights} onDownload={() => setClaudeOpen(true)} />}
        {data.tab === "advanced" && (
          <AdvancedTab
            teamId={teamId}
            data={data.advanced}
            compare={compare}
            view={data.view && ADV_VIEWS.includes(data.view) ? data.view : "summary"}
            viewHref={(view) => href({ view })}
            onPlatform={(platform) => go({ platform, content: "all" })}
            onContent={(content) => go({ content })}
            onDownload={() => setClaudeOpen(true)}
            insightsHref={href({ tab: "insights" })}
          />
        )}
        {data.tab === "revenue" && <RevenueTab r={data.revenue} compare={compare} teamId={teamId} />}
      </div>
      {claudeOpen && <ClaudeExport teamId={teamId} teamName={teamName} range={range === "48h" ? "7d" : range} span={range === "custom" || range === "lifetime" ? { from: w.from, to: w.to } : null} platform={advPlatform} revenueAllowed={revenueAllowed} onClose={() => setClaudeOpen(false)} />}
    </div>
  );
}
