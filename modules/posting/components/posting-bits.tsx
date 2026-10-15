"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useHydrated, useLocalFormat } from "@/lib/hooks/use-hydrated";
import { AnalyticsIcon, ExternalIcon } from "@/components/ui/icons";
import type { Platform } from "@/modules/short-videos/lib/constants";
import { localDay, type PostedItem, type QueueItem } from "../lib/dashboard";

export const NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

export function compact(n: number | null | undefined) {
  if (n === null || n === undefined) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : Math.round(n).toLocaleString("en-US"));

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * The time and the viewer's days: the server's until the page is live (so
 * both draw the same, React #418), then this device's, ticking every 30 s.
 */
export function useClock(serverNow: number) {
  const hydrated = useHydrated();
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return { now: hydrated ? now : serverNow, dayOf: hydrated ? localDay : utcDay };
}

/** "in 2h 13m", "5 min ago", "3 days ago". */
export function relTo(iso: string, now: number) {
  const m = Math.round((Date.parse(iso) - now) / 60_000);
  if (m > 0) return m < 60 ? `in ${m} min` : m < 2880 ? `in ${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `in ${Math.round(m / 1440)} days`;
  if (m === 0) return "now";
  return m > -60 ? `${-m} min ago` : m > -2880 ? `${Math.round(-m / 60)}h ago` : `${Math.round(-m / 1440)} days ago`;
}

/** "Today", "Tomorrow", "Yesterday", else "Fri, Oct 17" (and the year when it isn't this one). */
export function useDayTitle(now: number, dayOf: (t: number) => string) {
  const format = useLocalFormat();
  return (day: string, sample: string) => {
    if (!day) return "No date";
    if (day === dayOf(now)) return "Today";
    if (day === dayOf(now + 86_400_000)) return "Tomorrow";
    if (day === dayOf(now - 86_400_000)) return "Yesterday";
    const sameYear = day.slice(0, 4) === dayOf(now).slice(0, 4);
    return format(sample, { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  };
}

/** "17:00". */
export function useTimeOf() {
  const format = useLocalFormat();
  return (iso: string) => format(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** What a post not out yet is doing, in a few words, and its colour. */
export function statusOf(q: QueueItem): { text: string; tone: "red" | "amber" | "violet" | "ink" | "soft" } {
  if (q.status === "failed") return { text: "Failed", tone: "red" };
  if (q.late) return { text: "Late: hasn't started", tone: "amber" };
  if (q.attempts > 0 && q.status !== "waiting") return { text: `Trying again (${q.attempts})`, tone: "amber" };
  if (q.status === "uploading") return { text: `Uploading ${q.progress}%`, tone: "amber" };
  if (q.status === "processing") return { text: "Processing", tone: "amber" };
  if (q.status === "waiting") return { text: q.platform === "youtube" ? "Scheduled on YouTube" : "Waiting", tone: "violet" };
  return { text: "Scheduled", tone: "ink" };
}
export const TONE_TEXT = { red: "text-red", amber: "text-amber", violet: "text-violet", ink: "text-ink", soft: "text-ink-soft" } as const;
export const TONE_CHIP = {
  red: "bg-red text-white",
  amber: "bg-amber text-white",
  violet: "bg-violet text-white",
  ink: "bg-surface/95 text-ink",
  soft: "bg-surface/95 text-ink-soft",
} as const;

export const analyticsHref = (p: { platform: string; analyticsId: string | null }) => (p.analyticsId ? `/analytics/video/${p.platform}/${encodeURIComponent(p.analyticsId)}?from=posting` : null);
export const ourHref = (o: PostedItem["ours"]) => (o ? (o.kind === "short" ? `/shorts/${o.id}` : `/videos/${o.id}`) : null);

/** Its analytics (when the platform's copy has it) and Open (on the platform). */
export function PostedActions({ p, small = false }: { p: PostedItem; small?: boolean }) {
  const a = analyticsHref(p);
  return (
    <span className="flex items-center justify-end gap-1.5 flex-shrink-0">
      {a ? (
        <Link
          href={a}
          title="Its analytics"
          aria-label={`Analytics: ${p.title ?? "this video"}`}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-line/15 h-8 text-[12px] font-semibold text-ink hover:border-amber/50 hover:text-amber ${small ? "w-8 justify-center" : "px-2.5"}`}
        >
          <AnalyticsIcon className="w-4 h-4" />
          {!small && <span>Analytics</span>}
        </Link>
      ) : (
        <span title={`No numbers from ${NAME[p.platform]} yet`} className={`inline-flex items-center gap-1.5 rounded-lg border border-line/10 h-8 text-[12px] font-semibold text-ink-faint ${small ? "w-8 justify-center" : "px-2.5"}`}>
          <AnalyticsIcon className="w-4 h-4" />
          {!small && <span>Analytics</span>}
        </span>
      )}
      {p.url && (
        <a href={p.url} target="_blank" rel="noopener noreferrer" title={`Open on ${NAME[p.platform]}`} className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink hover:border-line/30">
          <ExternalIcon className="w-3.5 h-3.5" />
          <span className="sr-only">Open on {NAME[p.platform]}</span>
        </a>
      )}
    </span>
  );
}
