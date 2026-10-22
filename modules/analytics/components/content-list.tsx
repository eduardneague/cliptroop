"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnalyticsIcon, ExternalIcon, GridIcon, ListIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { ContentItem } from "../lib/queries";
import { scoreText, scoreTone } from "../lib/scores";
import { KIND_LABEL, KIND_PLURAL, KIND_SHORT_LABEL, isWide } from "../lib/kinds";
import type { SocialPlatform } from "@/lib/social/providers";

/*
 * Analytics → Content's list (1.17.0): columns that sort when you click
 * them (like YouTube Studio), a table or a grid, and an Analytics button on
 * every video. Finding one video: the app's search (1.20.0: it lists videos
 * with their numbers, so there's no second search box here).
 */

export type ContentKind = "all" | "short" | "long" | "live" | "post";
type View = "table" | "grid";
type SortKey = "published" | "views" | "score" | "likes" | "comments" | "shares" | "impressions" | "ctr";
/** Rows shown at first (and added with each "Show more"): a few thousand videos stay quick. */
const PAGE = 100;

const NAME: Record<SocialPlatform, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
const VIEW_KEY = "vp-content-view";

const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : Math.round(n).toLocaleString("en-US"));
function compact(n: number | null | undefined) {
  if (n === null || n === undefined) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
const niceDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const videoHref = (c: { platform: string; id: string }, from = "content") => `/analytics/video/${c.platform}/${encodeURIComponent(c.id)}?from=${from}`;

const toneClass = { high: "text-green bg-green/12 ring-1 ring-green/25", up: "text-green bg-green/10", usual: "text-ink-soft bg-surface-2", down: "text-coral bg-coral/10", none: "text-ink-faint" } as const;

export function ScoreBadge({ score, className = "" }: { score: number | null | undefined; className?: string }) {
  const tone = scoreTone(score ?? null);
  if (tone === "none") return <span className={`text-ink-faint ${className}`}>–</span>;
  return (
    <span title="Views next to your typical video of the same kind, on the same platform" className={`inline-flex items-center rounded-md px-1.5 h-5 text-[11.5px] font-bold tabular-nums ${toneClass[tone]} ${className}`}>
      {scoreText(score ?? null)}
    </span>
  );
}

export function ContentList({ items, platform, kind, empty, left }: { items: ContentItem[]; platform: "all" | SocialPlatform; kind: ContentKind; empty: string; left?: React.ReactNode }) {
  const [view, setView] = useState<View>("table");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "views", dir: -1 });
  const [shown, setShown] = useState(PAGE);

  // The view you last picked (this device).
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "table") setView(v);
      else if (window.matchMedia("(max-width: 640px)").matches) setView("grid");
    } catch {}
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const list = useMemo(() => {
    const filtered = items.filter((c) => (platform === "all" || c.platform === platform) && (kind === "all" || c.kind === kind));
    const get = (c: ContentItem): number | string | null =>
      sort.key === "published"
        ? (c.publishedAt ?? null)
        : sort.key === "score"
          ? (c.score ?? null)
          : sort.key === "views"
            ? c.views
            : sort.key === "likes"
              ? c.likes
              : sort.key === "comments"
                ? c.comments
                : sort.key === "impressions"
                  ? (c.impressions ?? null)
                  : sort.key === "ctr"
                    ? (c.ctr ?? null)
                    : c.shares;
    return [...filtered].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return sort.dir * (x < y ? -1 : x > y ? 1 : 0);
    });
  }, [items, platform, kind, sort]);

  useEffect(() => {
    setShown(PAGE);
  }, [platform, kind, sort, items]);
  // Impressions and CTR: only when some video has them (YouTube, from 1.19.0).
  const reach = useMemo(() => list.some((c) => c.impressions !== null && c.impressions !== undefined), [list]);
  const page = list.slice(0, shown);

  const head = (key: SortKey, label: string, right = true, title?: string) => {
    const on = sort.key === key;
    return (
      <th className={`px-3 py-2 font-bold whitespace-nowrap ${right ? "text-right" : "text-left"}`} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        <button type="button" title={title ?? `Sort by ${label.toLowerCase()}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink ${on ? "text-ink" : ""}`}>
          {label}
          <span aria-hidden className={`text-[9px] ${on ? "" : "opacity-0"}`}>{sort.dir === 1 ? "▲" : "▼"}</span>
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {left}
        <span className="flex-1" />
        <div className="inline-flex items-center rounded-lg border border-line/15 bg-surface p-0.5" role="radiogroup" aria-label="Show as">
          {(["table", "grid"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              title={v === "table" ? "Table" : "Grid"}
              onClick={() => pickView(v)}
              className={`w-8 h-7 rounded-md flex items-center justify-center transition-colors ${view === v ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_rgb(var(--line)/0.15)]" : "text-ink-faint hover:text-ink"}`}
            >
              {v === "table" ? <ListIcon className="w-4 h-4" /> : <GridIcon className="w-4 h-4" />}
              <span className="sr-only">{v === "table" ? "Table" : "Grid"}</span>
            </button>
          ))}
        </div>
      </div>

      <div id="content-results">
        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line/20 py-10 px-6 text-center text-[13.5px] text-ink-soft">{kind !== "all" ? `No ${KIND_PLURAL[kind]} here.` : empty}</p>
        ) : view === "table" ? (
          // (relative: the hidden labels inside scroll with the table instead of widening the page.)
          <div className="relative rounded-2xl border border-line/10 bg-surface overflow-x-auto overscroll-x-contain styled-scroll">
            <table className={`w-full text-[13px] ${reach ? "min-w-[980px]" : "min-w-[820px]"}`}>
              <thead>
                <tr className="bg-surface-2 text-[10.5px] text-ink-faint text-left">
                  <th className="px-3 py-2 font-bold uppercase tracking-wide">Video</th>
                  {head("published", "Published", false)}
                  {head("views", "Views")}
                  {head("score", "× typical", true, "Views next to your typical video of the same kind on that platform")}
                  {head("likes", "Likes")}
                  {head("comments", "Comments")}
                  {head("shares", "Shares")}
                  {reach && head("impressions", "Impressions", true, "How many times YouTube showed the thumbnail (over the days YouTube keeps)")}
                  {reach && head("ctr", "CTR", true, "Impressions click-through rate: views from those impressions ÷ impressions")}
                  <th className="px-3 py-2" aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {page.map((c) => (
                  <tr key={`${c.platform}${c.id}`} className="border-t border-line/10 hover:bg-surface-2/40">
                    <td className={`px-3 py-2 ${reach ? "max-w-[20rem]" : "max-w-[24rem]"}`}>
                      <span className="flex items-center gap-3 min-w-0">
                        <Thumb c={c} className="w-16 h-9" />
                        <span className="min-w-0">
                          {c.noNumbers ? (
                            <span className="font-semibold truncate block">{c.title || "Untitled"}</span>
                          ) : (
                            <Link href={videoHref(c)} className="font-semibold truncate block hover:underline" title="Open its analytics">
                              {c.title || "Untitled"}
                            </Link>
                          )}
                          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint min-w-0">
                            <span className="truncate">
                              {KIND_LABEL[c.kind]}
                              {c.noNumbers ? ` · no numbers from ${NAME[c.platform]} yet` : ""}
                            </span>
                            {c.ours && (
                              <Link href={c.ours.kind === "short" ? `/shorts/${c.ours.id}` : `/videos/${c.ours.id}`} className="font-mono font-semibold text-amber hover:underline flex-shrink-0">
                                #{c.ours.number ?? "?"}
                              </Link>
                            )}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-soft whitespace-nowrap">{c.publishedAt ? niceDay(c.publishedAt) : "–"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtInt(c.views)}</td>
                    <td className="px-3 py-2 text-right">
                      <ScoreBadge score={c.score} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.likes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.comments)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.shares)}</td>
                    {reach && <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(c.impressions)}</td>}
                    {reach && <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{c.ctr === null || c.ctr === undefined ? "–" : `${c.ctr.toFixed(1)}%`}</td>}
                    <td className="px-3 py-2">
                      <Actions c={c} wide={reach} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,210px),1fr))]">
            {page.map((c) => (
              <li key={`${c.platform}${c.id}`} className="group rounded-2xl border border-line/10 hover:border-line/25 bg-surface overflow-hidden flex flex-col">
                <Link href={c.noNumbers ? "#" : videoHref(c)} aria-disabled={c.noNumbers || undefined} onClick={(e) => c.noNumbers && e.preventDefault()} className="block relative aspect-video bg-surface-2 overflow-hidden">
                  {c.thumbnail ? (
                    <>
                      {!isWide(c.kind) && (
                        // A vertical video in a wide frame: blurred behind, whole in front.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbnail} alt="" aria-hidden loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60" />
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className={`relative w-full h-full ${isWide(c.kind) ? "object-cover" : "object-contain"}`} />
                    </>
                  ) : null}
                  <PlatformIcon platform={c.platform} className="absolute bottom-2 right-2 w-6 h-6 rounded-md shadow" />
                  {c.score !== null && c.score !== undefined && <ScoreBadge score={c.score} className="absolute top-2 left-2 shadow-sm !bg-surface/95" />}
                </Link>
                <div className="p-3 flex-1 flex flex-col">
                  <Link href={c.noNumbers ? "#" : videoHref(c)} onClick={(e) => c.noNumbers && e.preventDefault()} className="text-[13px] font-semibold leading-snug line-clamp-2 hover:underline">
                    {c.title || "Untitled"}
                  </Link>
                  <div className="mt-1 text-[11.5px] text-ink-faint flex items-center gap-1.5 flex-wrap">
                    <span>{c.publishedAt ? niceDay(c.publishedAt) : "–"}</span>
                    <span aria-hidden>·</span>
                    <span>{KIND_SHORT_LABEL[c.kind]}</span>
                    {c.ours && (
                      <Link href={c.ours.kind === "short" ? `/shorts/${c.ours.id}` : `/videos/${c.ours.id}`} className="font-mono font-semibold text-amber hover:underline">
                        #{c.ours.number ?? "?"}
                      </Link>
                    )}
                  </div>
                  <div className="mt-auto pt-2.5 flex items-end gap-3">
                    <div className="min-w-0">
                      <div className="font-display text-[19px] font-semibold tabular-nums leading-none">{compact(c.views)}</div>
                      <div className="text-[10.5px] text-ink-faint mt-0.5">
                        {c.noNumbers
                          ? `no numbers from ${NAME[c.platform]} yet`
                          : `views · ${compact(c.likes)} likes · ${compact(c.comments)} comments${c.ctr !== null && c.ctr !== undefined ? ` · ${c.ctr.toFixed(1)}% CTR` : ""}`}
                      </div>
                    </div>
                    <span className="flex-1" />
                    <Actions c={c} compact />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list.length > page.length && (
          <div className="flex items-center justify-center gap-3 pt-3">
            <span className="text-[12px] text-ink-faint tabular-nums">
              {page.length.toLocaleString("en-US")} of {list.length.toLocaleString("en-US")}
            </span>
            <button type="button" onClick={() => setShown((n) => n + PAGE * 2)} className="inline-flex items-center rounded-lg border border-line/15 px-3.5 h-9 text-[12.5px] font-semibold hover:border-line/30 hover:bg-surface-2">
              Show {Math.min(PAGE * 2, list.length - page.length).toLocaleString("en-US")} more
            </button>
            <button type="button" onClick={() => setShown(list.length)} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:underline">
              Show all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Thumb({ c, className }: { c: ContentItem; className: string }) {
  return (
    <span className={`relative rounded-md overflow-hidden bg-surface-2 flex-shrink-0 ${className}`}>
      {c.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
      )}
      <PlatformIcon platform={c.platform} className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded" />
    </span>
  );
}

/** Analytics (this video's page) and Open (on the platform). */
/** `wide`: a table with more columns (the label only on the widest screens). */
function Actions({ c, compact: small = false, wide = false }: { c: ContentItem; compact?: boolean; wide?: boolean }) {
  return (
    <span className="flex items-center justify-end gap-1.5">
      {c.noNumbers ? (
        <span title={`No numbers from ${NAME[c.platform]} yet`} className={`inline-flex items-center gap-1.5 rounded-lg border border-line/10 h-8 text-[12px] font-semibold text-ink-faint ${small ? "w-8 justify-center" : "px-2.5"}`}>
          <AnalyticsIcon className="w-4 h-4" />
          {!small && <span className={wide ? "hidden 2xl:inline" : "hidden lg:inline"}>Analytics</span>}
        </span>
      ) : (
        <Link href={videoHref(c)} title="This video's analytics" aria-label="This video's analytics" className={`inline-flex items-center gap-1.5 rounded-lg border border-line/15 h-8 text-[12px] font-semibold text-ink hover:border-amber/50 hover:text-amber ${small ? "w-8 justify-center" : "px-2.5"}`}>
          <AnalyticsIcon className="w-4 h-4" />
          {!small && <span className={wide ? "hidden 2xl:inline" : "hidden lg:inline"}>Analytics</span>}
        </Link>
      )}
      {c.url && (
        <a href={c.url} target="_blank" rel="noopener noreferrer" title={`Open on ${NAME[c.platform]}`} className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink hover:border-line/30">
          <ExternalIcon className="w-3.5 h-3.5" />
          <span className="sr-only">Open on {NAME[c.platform]}</span>
        </a>
      )}
    </span>
  );
}
