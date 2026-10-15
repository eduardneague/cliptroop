"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { ChevronLeftIcon, ChevronRightIcon, ExternalIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { SocialPlatform } from "@/lib/social/providers";
import { fmtCompact, fmtInt, MarkIcon } from "./charts";
import { KIND_LABEL, KIND_TITLE, VIDEO_KINDS, isWide, type VideoKind } from "../lib/kinds";
import { metricOf, type PeriodMetric, type PeriodVideo, type PeriodVideos as Answer } from "../lib/period-types";

/*
 * One point of an Overview chart, opened by clicking it (1.22.0): any day,
 * week, month or hour, for whichever number the chart shows. Every video
 * that got some of it there, how much each got, and how much of the point it
 * was; filter by platform and kind, sort, step to the point before or after
 * (← →), open any video. Loaded from /api/analytics/period (a GET route, so
 * it never waits behind a save), kept while the dialog is open.
 */

const NAME: Record<SocialPlatform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const COLOR: Record<SocialPlatform, string> = { youtube: "rgb(var(--chart-yt))", instagram: "rgb(var(--chart-ig))", tiktok: "rgb(var(--chart-tt))", facebook: "rgb(var(--chart-fb))" };
/** Numbers that add up over videos (a rate or an average doesn't). */
const ADDS: PeriodMetric[] = ["views", "watch", "followers", "engagement", "likes", "comments", "shares", "impressions", "revenue"];
/** Counted one by one: shown in full in the header ("12,345 views"). */
const COUNTS: PeriodMetric[] = ["views", "followers", "engagement", "likes", "comments", "shares", "impressions"];
/** What each number counts, and how a list sorted by it is called. */
const NOUN: Record<PeriodMetric, string> = { views: "views", watch: "watch time", followers: "subscribers", engagement: "likes, comments and shares", likes: "likes", comments: "comments", shares: "shares", impressions: "impressions", ctr: "impressions", avgView: "views", revenue: "revenue" };
const SORT_WORD: Record<PeriodMetric, string> = { views: "Most views", watch: "Most watch time", followers: "Most subscribers", engagement: "Most engagement", likes: "Most likes", comments: "Most comments", shares: "Most shares", impressions: "Most impressions", ctr: "Best click-through", avgView: "Longest views", revenue: "Most revenue" };

export type PeriodPoint = {
  /** Days (YYYY-MM-DD), or the hour's start and end (ISO). */
  from: string;
  to: string;
  /** "Monday, October 13, 2026", "Oct 6 – Oct 12, 2026", "Today, 5 PM – 6 PM". */
  title: string;
  /** "Oct 13", "Oct 6 – 12", "5 PM". */
  short: string;
  /** The chart's number there (its platforms together), and each platform's. */
  total: number | null;
  per: Partial<Record<SocialPlatform, number | null>>;
  /** Hour by hour: part of it worked out from the account's total views. */
  estimated?: boolean;
};

type Loaded = { data: Answer } | { error: string };

export function PeriodVideos({
  teamId,
  points,
  index,
  hourly,
  metric,
  label,
  format,
  platforms,
  onClose,
}: {
  teamId: string;
  points: PeriodPoint[];
  index: number;
  hourly: boolean;
  metric: PeriodMetric;
  /** The number's name ("Views", "Watch time") and how it's written. */
  label: string;
  format: (n: number | null) => string;
  platforms: SocialPlatform[];
  onClose: () => void;
}) {
  const [at, setAt] = useState(index);
  useEffect(() => setAt(index), [index]);
  const pt = points[at] ?? null;
  const cache = useRef(new Map<string, Loaded>());
  const [loaded, setLoaded] = useState<{ key: string; res: Loaded } | null>(null);
  // One platform picked on the chart: start with it.
  const [platform, setPlatform] = useState<"all" | SocialPlatform>(platforms.length === 1 ? platforms[0] : "all");
  const [kind, setKind] = useState<"all" | VideoKind>("all");
  const [sort, setSort] = useState<"metric" | "views" | "newest">("metric");
  const key = pt ? `${pt.from}|${pt.to}|${metric}|${platforms.join(",")}` : "";
  const noun = NOUN[metric];

  useEffect(() => {
    if (!pt) return;
    const hit = cache.current.get(key);
    if (hit) return setLoaded({ key, res: hit });
    const ctl = new AbortController();
    const q = new URLSearchParams({ team: teamId, from: pt.from, to: pt.to, metric, platforms: platforms.join(","), ...(hourly ? { hourly: "1" } : {}) });
    fetch(`/api/analytics/period?${q}`, { cache: "no-store", signal: ctl.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { data?: Answer; error?: string };
        const res: Loaded = r.ok && j.data ? { data: j.data } : { error: j.error ?? "Couldn't load these videos. Try again in a moment." };
        if ("data" in res) cache.current.set(key, res);
        setLoaded({ key, res });
      })
      .catch((e) => {
        if ((e as { name?: string })?.name !== "AbortError") setLoaded({ key, res: { error: "Couldn't load these videos. Check your connection and try again." } });
      });
    return () => ctl.abort();
    // (pt changes with `key`.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, teamId, metric, hourly]);

  const step = useCallback((d: number) => setAt((i) => Math.max(0, Math.min(points.length - 1, i + d))), [points.length]);
  // ← → step through the points (not while typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  const res = loaded && loaded.key === key ? loaded.res : null;
  const data = res && "data" in res ? res.data : null;
  const adds = ADDS.includes(metric);
  const value = (v: PeriodVideo) => metricOf(v, metric);
  // Each platform's part of the point: the chart's own numbers.
  const chips = useMemo(
    () =>
      platforms
        .map((p) => ({ p, value: pt?.per[p] ?? null, count: (data?.videos ?? []).filter((v) => v.platform === p && (value(v) ?? 0) !== 0).length }))
        .filter((c) => c.value !== null || c.count > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platforms, pt, data, metric]
  );
  const chipTotal = chips.reduce((t, c) => t + Math.max(0, c.value ?? 0), 0);
  const list = useMemo(() => {
    const xs = (data?.videos ?? []).filter((v) => (platform === "all" || v.platform === platform) && (kind === "all" || v.kind === kind) && (value(v) !== null || sort !== "metric"));
    if (sort === "views") return [...xs].sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
    if (sort === "newest") return [...xs].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    return xs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, platform, kind, sort, metric]);
  const kinds = useMemo(() => VIDEO_KINDS.filter((k) => (data?.videos ?? []).some((v) => v.kind === k && (platform === "all" || v.platform === platform))), [data, platform]);
  const top = Math.max(1e-9, ...list.map((v) => Math.abs(value(v) ?? 0)));
  const shownTotal = platform === "all" ? pt?.total ?? null : pt?.per[platform] ?? null;
  // What the listed videos don't explain (older videos, or below the top 100), per platform.
  const rest = adds && metric !== "followers" && data
    ? chips
        .filter((c) => platform === "all" || c.p === platform)
        .map((c) => {
          const listed = data.videos.filter((v) => v.platform === c.p).reduce((t, v) => t + Math.max(0, value(v) ?? 0), 0);
          const left = (c.value ?? 0) - listed;
          return { p: c.p, left: left > Math.max(metric === "watch" ? 0.5 : 5, (c.value ?? 0) * 0.02) ? left : 0 };
        })
        .filter((r) => r.left > 0)
    : [];
  const posted = (v: PeriodVideo) => {
    if (!v.publishedAt || !pt) return null;
    const t = Date.parse(v.publishedAt);
    const inside = hourly ? t >= Date.parse(pt.from) && t < Date.parse(pt.to) : v.publishedAt.slice(0, 10) >= pt.from && v.publishedAt.slice(0, 10) <= pt.to;
    if (inside) return hourly ? "posted in this hour" : pt.from === pt.to ? "posted that day" : "posted then";
    return `posted ${new Date(v.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(new Date(v.publishedAt).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) })}`;
  };
  const big = (n: number | null) => (COUNTS.includes(metric) ? fmtInt(n) : format(n));

  if (!pt) return null;
  return (
    <Dialog open onClose={onClose} title={`${label}${hourly ? ", " : pt.from === pt.to ? " on " : ", "}${pt.title}`} description={`Every video that got ${noun} ${hourly ? "in this hour" : pt.from === pt.to ? "that day" : "in these days"}, on the accounts connected now.`} width="sm:max-w-3xl">
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => step(-1)} disabled={at <= 0} aria-label="The one before" className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-[12.5px] font-semibold tabular-nums min-w-[4.5rem] text-center">{pt.short}</span>
          <button type="button" onClick={() => step(1)} disabled={at >= points.length - 1} aria-label="The one after" className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
          <span className="flex-1" />
          {shownTotal !== null && (
            <span className="text-[12.5px] text-ink-soft">
              <b className="font-display text-[20px] text-ink tabular-nums">{big(shownTotal)}</b>
              {COUNTS.includes(metric) ? ` ${noun}` : ""}
              {platform === "all" ? "" : ` on ${NAME[platform]}`}
              {pt.estimated && <span className="ml-1.5 text-[11px] text-ink-faint">(partly estimated)</span>}
            </span>
          )}
        </div>

        {!res ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading the videos">
            <div className="skeleton h-14 rounded-xl" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-12 rounded-xl" style={{ opacity: 1 - i * 0.18 }} />
            ))}
          </div>
        ) : "error" in res ? (
          <p className="rounded-xl border border-red/20 bg-red/5 px-4 py-3 text-[13px] text-ink-soft">{res.error}</p>
        ) : (
          <>
            {chips.length > 1 && (
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-4" role="group" aria-label="Platform">
                {chips.map((c) => {
                  const on = platform === c.p;
                  const share = adds && chipTotal > 0 && c.value !== null && c.value > 0 ? Math.round((c.value / chipTotal) * 100) : null;
                  return (
                    <button
                      key={c.p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPlatform(on ? "all" : c.p)}
                      className={`text-left rounded-xl border px-3 py-2 transition-colors ${on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.12)]" : "border-line/10 bg-surface-2/40 hover:border-line/25"}`}
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
                        <PlatformIcon platform={c.p} className="w-4 h-4 rounded" />
                        {NAME[c.p]}
                      </span>
                      <span className="block font-display text-[19px] font-semibold tabular-nums leading-tight mt-0.5">{format(c.value)}</span>
                      {adds && (
                        <span className="block h-1 rounded-[2px] bg-line/10 mt-1.5 overflow-hidden">
                          <span className="block h-full rounded-[3px]" style={{ width: `${share ?? 0}%`, background: COLOR[c.p] }} />
                        </span>
                      )}
                      <span className="block text-[11px] text-ink-faint mt-1 truncate">
                        {share !== null ? `${share}%` : ""}
                        {c.count ? `${share !== null ? " · " : ""}${c.count} video${c.count === 1 ? "" : "s"}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              {(["all", ...kinds] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-7 text-[12px] font-semibold border transition-colors ${kind === k ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
                >
                  {k !== "all" && <MarkIcon kind={k} className="w-3 h-3" />}
                  {k === "all" ? "Everything" : KIND_TITLE[k]}
                </button>
              ))}
              <span className="flex-1" />
              <div role="radiogroup" aria-label="Order" className="inline-flex rounded-lg border border-line/15 p-0.5">
                {(metric === "views" ? (["metric", "newest"] as const) : (["metric", "views", "newest"] as const)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={sort === s}
                    onClick={() => setSort(s)}
                    className={`px-2.5 h-6 rounded-md text-[11.5px] font-semibold transition-colors ${sort === s ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
                  >
                    {s === "metric" ? SORT_WORD[metric] : s === "views" ? "Most views" : "Newest"}
                  </button>
                ))}
              </div>
            </div>

            {list.length ? (
              <ul className="rounded-xl border border-line/10 divide-y divide-line/10 overflow-hidden">
                {list.map((v, i) => {
                  const x = value(v);
                  const ofPlatform = pt.per[v.platform] ?? null;
                  const share = adds && metric !== "followers" && ofPlatform && x !== null && ofPlatform > 0 ? Math.round((x / ofPlatform) * 100) : null;
                  const when = posted(v);
                  return (
                    <li key={`${v.platform}:${v.id}`} className="px-3 py-2.5 flex items-center gap-2.5 sm:gap-3 min-w-0 animate-[fadein_.25s_ease_both]" style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}>
                      {/* One column wide enough for a wide picture, so every title starts at the same place. */}
                      <span className="w-[72px] flex-shrink-0 flex justify-center">
                      <span className={`relative rounded-md overflow-hidden bg-surface-2 flex-shrink-0 ${isWide(v.kind) ? "w-[72px] h-[40px]" : "w-[30px] h-[44px]"}`}>
                        {v.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <MarkIcon kind={v.kind} className="w-4 h-4" />
                          </span>
                        )}
                        <PlatformIcon platform={v.platform} className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-[3px]" />
                      </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start sm:items-center gap-1.5 min-w-0">
                          <Link href={`/analytics/video/${v.platform}/${encodeURIComponent(v.id)}?from=overview`} className="text-[13px] font-semibold leading-snug hover:underline min-w-0" title="Open its analytics">
                            <span className="line-clamp-2 sm:line-clamp-none sm:truncate block">{v.title || "Untitled"}</span>
                          </Link>
                          {v.url && (
                            <a href={v.url} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${NAME[v.platform]}`} className="text-ink-faint hover:text-ink flex-shrink-0 mt-0.5 sm:mt-0">
                              <ExternalIcon className="w-3 h-3" />
                            </a>
                          )}
                        </span>
                        <span className="flex items-center flex-wrap gap-x-1.5 text-[11.5px] text-ink-faint min-w-0">
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <MarkIcon kind={v.kind} className="w-3 h-3" />
                            {KIND_LABEL[v.kind]}
                          </span>
                          {when && <span className="whitespace-nowrap">· {when}</span>}
                          {metric !== "views" && v.views !== null && <span className="whitespace-nowrap">· {fmtCompact(v.views)} views</span>}
                          {metric === "views" && v.watchMinutes !== null && v.watchMinutes > 0 && <span className="hidden sm:inline">· {fmtCompact(Math.round(v.watchMinutes / 6) / 10)} h watched</span>}
                          {v.ours && (
                            <Link href={v.ours.kind === "short" ? `/shorts/${v.ours.id}` : `/videos/${v.ours.id}`} className="font-mono font-semibold text-amber hover:underline">
                              #{v.ours.number ?? "?"}
                            </Link>
                          )}
                        </span>
                      </span>
                      <span className="text-right flex-shrink-0 w-[4.75rem] sm:w-[6.5rem]">
                        <span className="block text-[14px] font-bold tabular-nums">{COUNTS.includes(metric) ? (x !== null && x < 0 ? `−${fmtInt(-x)}` : fmtInt(x)) : format(x)}</span>
                        <span className="block h-1 rounded-[2px] bg-line/10 mt-1 overflow-hidden" aria-hidden>
                          <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(3, (Math.abs(x ?? 0) / top) * 100)}%`, background: COLOR[v.platform] }} />
                        </span>
                        <span className="block text-[10.5px] text-ink-faint mt-0.5">{share !== null && share <= 100 ? `${share}% of ${NAME[v.platform]}` : v.how === "change" ? "between copies" : ""}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-[13px] text-ink-soft">
                {(data?.videos.length ?? 0) > 0 ? "No videos with this filter." : `No video got ${noun} ${hourly ? "in this hour" : pt.from === pt.to ? "that day" : "in these days"}.`}
              </p>
            )}

            <div className="space-y-1 text-[11.5px] text-ink-faint">
              {rest.map((r) => (
                <p key={r.p} className="flex items-start gap-1.5">
                  <PlatformIcon platform={r.p} className="w-3.5 h-3.5 rounded mt-px flex-shrink-0" />
                  <span>
                    {COUNTS.includes(metric) ? `${fmtInt(r.left)} more ${noun}` : `${format(r.left)} more`} on {NAME[r.p]} came from other videos (older ones, or below the top 100).
                  </span>
                </p>
              ))}
              {metric === "followers" && <p>Subscribers each video brought in. The rest came from your channel page, search and elsewhere.</p>}
              {pt.estimated && <p>Part of this hour was worked out from the channel&rsquo;s total views: every video wasn&rsquo;t being counted yet then.</p>}
              {(data?.notes ?? []).map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
