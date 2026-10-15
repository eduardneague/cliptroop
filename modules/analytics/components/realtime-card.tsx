"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { SocialPlatform } from "@/lib/social/providers";
import type { Realtime, RealtimePlatform } from "../lib/realtime";
import { ago } from "../lib/ago";
import { hourRange } from "../lib/live-math";
import { fmtCompact, fmtInt, StackedColumns } from "./charts";

/*
 * Realtime (1.19.0; its own tab and the Overview's card in 1.20.0): views
 * over the last 48 hours hour by hour, the last 60 minutes, the videos
 * getting views right now, each account's totals now. From the counts the
 * 10-minute job keeps; `useRealtime` refreshes whenever the job has read new
 * counts (realtime on analytics_syncs), every 2 minutes while the page is
 * open, and on coming back to it.
 */

export const RT_PLATFORM: Record<SocialPlatform, { name: string; color: string; people: string }> = {
  youtube: { name: "YouTube", color: "rgb(var(--chart-yt))", people: "subscribers" },
  instagram: { name: "Instagram", color: "rgb(var(--chart-ig))", people: "followers" },
  tiktok: { name: "TikTok", color: "rgb(var(--chart-tt))", people: "followers" },
  facebook: { name: "Facebook", color: "rgb(var(--chart-fb))", people: "followers" },
};
export const RT_ORDER: SocialPlatform[] = ["youtube", "tiktok", "instagram", "facebook"];

/** A colour, fainter: the estimated part of a bar (1.22.0). */
export const soft = (color: string) => color.replace(/\)$/, " / 0.38)");

/** A number to 3 digits ("22.1K", "153K", "1.23M"): how YouTube shares subscriber counts. */
export function fmt3(n: number) {
  const a = Math.abs(n);
  for (const [v, u] of [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const)
    if (a >= v) {
      const t = (n / v).toPrecision(3);
      return t.includes("e") ? fmtCompact(n) : `${t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t}${u}`;
    }
  return String(Math.round(n));
}

/**
 * Subscribers or followers now. YouTube rounds the count it shares with
 * every app to 3 digits (22,136 comes as 22,100, even for the channel's
 * owner), so it's shown as YouTube's rounded number, not as an exact one.
 */
export function peopleNow(p: RealtimePlatform): { text: string; title: string | undefined } {
  if (p.followers === null) return { text: "–", title: undefined };
  return p.followersRounded
    ? { text: fmt3(p.followers), title: `About ${fmtInt(p.followers)}: YouTube shares subscriber counts rounded to 3 digits with every app. YouTube Studio shows the exact number.` }
    : { text: fmtInt(p.followers), title: undefined };
}

/**
 * When some of the 48 hours were estimated: since when every video of these
 * platforms is counted (the latest of them), "" when one isn't fully counted
 * yet, null when nothing was estimated.
 */
export function estimatedSince(data: Realtime, platforms: SocialPlatform[]): string | null {
  const est = platforms.filter((p) => (data.coverage[p]?.estimated ?? 0) > 0);
  if (!est.length) return null;
  const since = est.map((p) => data.coverage[p]?.since).filter((x): x is string => !!x).sort();
  return since.length === est.length ? since[since.length - 1] : "";
}

/** "Tue 3:40 PM": when counting every video started. */
export const sinceWords = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

/** "Oct 8–11", "Sep 30 – Oct 3" (days as YYYY-MM-DD). */
function dayStretch(from: string, to: string) {
  const f = new Date(`${from}T12:00:00Z`);
  const t = new Date(`${to}T12:00:00Z`);
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  if (from === to) return `${m(f)} ${f.getUTCDate()}`;
  return m(f) === m(t) ? `${m(f)} ${f.getUTCDate()}–${t.getUTCDate()}` : `${m(f)} ${f.getUTCDate()} – ${m(t)} ${t.getUTCDate()}`;
}

/**
 * What the fainter part of the hours is (1.23.1): what the platform counted
 * on top of the public counts (realtime is lifted to its own count), and the
 * hours worked out from the account's total views (before every video was
 * counted). Null when nothing is fainter.
 */
/** Under the 48 hours' total: "matched to YouTube's own count", or "some hours estimated". */
export function liftedWords(data: Realtime, platforms: SocialPlatform[]): string {
  const lifted = platforms.filter((p) => data.coverage[p]?.ratio);
  if (!lifted.length) return "some hours estimated";
  return lifted.length === 1 ? `matched to ${RT_PLATFORM[lifted[0]].name}'s own count` : "matched to each platform's own count";
}

export function fainterNote(data: Realtime, platforms: SocialPlatform[]): string | null {
  const parts: string[] = [];
  const lifted = platforms.filter((p) => data.coverage[p]?.ratio);
  if (lifted.length) {
    const c = data.coverage[lifted[0]]!;
    const name = lifted.length === 1 ? RT_PLATFORM[lifted[0]].name : "each platform";
    const x = `${(c.ratio ?? 1).toFixed(2).replace(/0$/, "")}×`;
    parts.push(
      lifted.length === 1
        ? `what ${name} counted on top of the public counts (its own numbers were ${x} them${c.ratioFrom && c.ratioTo ? ` on ${dayStretch(c.ratioFrom, c.ratioTo)}` : ""})`
        : `what each platform counted on top of the public counts (from its own daily numbers)`
    );
  }
  const since = estimatedSince(data, platforms);
  if (since !== null) parts.push(`estimated from the account's total views${since ? `, before every video was counted (from ${sinceWords(since)})` : ", until every video is counted"}`);
  return parts.length ? `Fainter: ${parts.join("; ")}.` : null;
}

/**
 * The realtime numbers, kept fresh. `full`: the Realtime tab's (10-minute
 * slots, the top 25). 1.22.0: read from a route (a server action made every
 * other call on the page wait behind it), only while the page is on screen,
 * and at most once a minute when the counts change: the job updates each
 * platform a few seconds apart, and an open tab used to reload for every one
 * of them, all day, even in the background.
 */
export function useRealtime(teamId: string, full = false) {
  const [data, setData] = useState<Realtime | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const last = useRef(0);
  const missed = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch(`/api/analytics/realtime?team=${encodeURIComponent(teamId)}${full ? "&full=1" : ""}`, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { data?: Realtime } | null;
      if (res.ok && body?.data) {
        setData(body.data);
        setFailed(false);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      last.current = Date.now();
      setNow(Date.now());
    }
  }, [teamId, full]);

  useEffect(() => {
    const seen = () => document.visibilityState === "visible";
    const later = (ms: number) => {
      if (timer.current) return; // (one load for a burst of changes)
      timer.current = setTimeout(() => {
        timer.current = null;
        void load();
      }, ms);
    };
    void load();
    // New counts: the job writes live_at on analytics_syncs when it's done with a platform.
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${teamId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "analytics_syncs", filter: `team_id=eq.${teamId}` }, () => {
        if (!seen()) {
          missed.current = true;
          return;
        }
        later(Math.max(15_000, 60_000 - (Date.now() - last.current)));
      })
      .subscribe();
    // The last 60 minutes slide on: a look every 5 minutes while it's on screen.
    const every = setInterval(() => {
      if (seen() && Date.now() - last.current > 5 * 60_000) void load();
    }, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const onVisible = () => {
      if (!seen()) return;
      if (missed.current || Date.now() - last.current > 2 * 60_000) {
        missed.current = false;
        later(300);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      clearInterval(every);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [teamId, load]);

  return { data, failed, now };
}

export function LiveDot({ className = "w-2.5 h-2.5" }: { className?: string }) {
  return (
    <span className={`relative flex flex-shrink-0 ${className}`} aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex w-full h-full rounded-full bg-green" />
    </span>
  );
}

export function RealtimeHeader({ updated, children }: { updated: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <LiveDot />
      <h2 className="text-[14.5px] font-semibold">Realtime</h2>
      <span className="text-[12px] text-ink-faint">{updated ? `Updated ${updated} · every video, every 10 minutes` : "Every video, every 10 minutes"}</span>
      {children}
    </div>
  );
}

export function Big({ label, value, live = false, size = "lg" }: { label: string; value: number | null; live?: boolean; size?: "lg" | "md" }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`font-display ${size === "lg" ? "text-[30px]" : "text-[24px]"} leading-none font-semibold tabular-nums mt-1 ${live && value !== null ? "text-green" : ""}`}>{fmtInt(value)}</div>
    </div>
  );
}

/** What the realtime numbers say before there are any (or when they couldn't load). */
export function realtimeState(data: Realtime | null, failed: boolean): "loading" | "failed" | "waiting-update" | "ok" {
  if (!data) return failed ? "failed" : "loading";
  return data.ready ? "ok" : "waiting-update";
}

/**
 * The Overview's realtime card (bigger in 1.21.0, like YouTube Studio's):
 * each account's subscribers or followers now, the views of the last 48
 * hours and the last 60 minutes, the hours as bars, and the videos getting
 * views now. `rt`: useRealtime's result (the Overview shows the card in one
 * of two places, phone or computer, from the same numbers).
 */
export function RealtimePanel({ rt, href, only }: { rt: ReturnType<typeof useRealtime>; href: string; only?: SocialPlatform | null }) {
  const { data, failed, now } = rt;
  const state = realtimeState(data, failed);
  if (state === "loading") return <MiniSkeleton />;
  const shell = (body: React.ReactNode) => (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0 flex flex-col" aria-label="Realtime">
      <div className="flex items-center gap-2 min-w-0">
        <LiveDot />
        <h2 className="text-[15px] font-semibold">Realtime</h2>
        <span className="text-[12px] text-ink-faint truncate">{data?.updatedAt ? `updated ${ago(data.updatedAt, now)}` : "updating live"}</span>
      </div>
      {body}
      <Link href={href} scroll={false} className="mt-4 self-start inline-flex items-center gap-1 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold hover:border-line/30 hover:bg-surface-2">
        See more
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
  if (state === "failed") return shell(<p className="text-[13px] text-ink-soft mt-2">Couldn&rsquo;t load the realtime numbers just now. They&rsquo;ll be back on their own.</p>);
  if (state === "waiting-update" || !data) return shell(<p className="text-[13px] text-ink-soft mt-2">Every video&rsquo;s numbers, refreshed every 10 minutes, start right after the latest database update has run.</p>);
  const platforms = RT_ORDER.filter((p) => data.platforms.some((x) => x.platform === p) && (!only || only === p));
  const sum = (m: Partial<Record<SocialPlatform, number>>) => platforms.reduce((t, p) => t + (m[p] ?? 0), 0);
  const values = data.hours.map((h) => Math.round(platforms.reduce((t, p) => t + (h.per[p] ?? 0), 0)));
  // The part of each hour worked out from the channel's total views (before every video was counted): fainter.
  const est = data.hours.map((h) => Math.round(platforms.reduce((t, p) => t + (h.est?.[p] ?? 0), 0)));
  const anyEst = est.some((v) => v > 0);
  const color = platforms.length === 1 ? RT_PLATFORM[platforms[0]].color : "rgb(var(--amber))";
  const note = anyEst ? fainterNote(data, platforms) : null;
  const top = data.top.filter((v) => platforms.includes(v.platform)).slice(0, 5);
  const waiting = !data.since;
  const people = data.platforms.filter((p) => platforms.includes(p.platform) && p.followers !== null).sort((a, b) => RT_ORDER.indexOf(a.platform) - RT_ORDER.indexOf(b.platform));
  const last60 = sum(data.last60);
  return shell(
    <>
      {people.length > 0 && (
        <ul className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(people.length, 2)}, minmax(0, 1fr))` }}>
          {people.map((p) => (
            <li key={p.platform} className="rounded-xl bg-surface-2/60 px-3 py-2 min-w-0" title={p.liveAt ? `Read ${ago(p.liveAt, now)}` : undefined}>
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft min-w-0">
                <PlatformIcon platform={p.platform} className="w-4 h-4 rounded-[4px]" />
                <span className="truncate">{RT_PLATFORM[p.platform].people[0].toUpperCase() + RT_PLATFORM[p.platform].people.slice(1)}</span>
              </span>
              <span className="block font-display text-[21px] font-semibold leading-tight tabular-nums mt-0.5" title={peopleNow(p).title}>
                {peopleNow(p).text}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Views · 48 hours</div>
          <div className="font-display text-[30px] sm:text-[34px] leading-none font-semibold tabular-nums mt-1.5">{waiting ? "–" : fmtInt(sum(data.last48))}</div>
          {anyEst && <div className="text-[11px] text-ink-faint mt-1">{liftedWords(data, platforms)}</div>}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Last 60 minutes</div>
          <div className={`font-display text-[30px] sm:text-[34px] leading-none font-semibold tabular-nums mt-1.5 ${!waiting && last60 > 0 ? "text-green" : ""}`}>{waiting ? "–" : `${last60 > 0 ? "+" : ""}${fmtInt(last60)}`}</div>
        </div>
      </div>
      {values.some((v) => v > 0) ? (
        <div className="mt-3">
          <StackedColumns
            ariaLabel="Views per hour over the last 48 hours"
            labels={data.hours.map((h, i) => (i === 0 ? "48 h ago" : i === data.hours.length - 1 ? "Now" : ""))}
            tips={data.hours.map((h, i) => `${hourRange(Date.parse(h.at), now)}${i === data.hours.length - 1 ? " (so far)" : ""}`)}
            series={
              anyEst
                ? [
                    { key: "views", label: "Counted", color, values: values.map((v, i) => Math.max(0, v - est[i])) },
                    { key: "est", label: platforms.some((p) => data.coverage[p]?.ratio) ? "Their own count on top" : "Estimated", color: soft(color), values: est },
                  ]
                : [{ key: "views", label: "Views", color, values }]
            }
            height={128}
          />
          {note && <p className="mt-1.5 text-[11px] text-ink-faint leading-snug">{note}</p>}
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] text-ink-faint">{waiting ? "Counting starts within 10 minutes." : "No views in the last 48 hours yet."}</p>
      )}
      {top.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line/10">
          <div className="flex items-center text-[10.5px] font-bold uppercase tracking-wide text-ink-faint mb-1.5">
            <span className="flex-1">Top content</span>
            <span>48 hours</span>
          </div>
          <ol className="space-y-0.5">
            {top.map((v) => (
              <li key={`${v.platform}:${v.id}`}>
                <Link href={`/analytics/video/${v.platform}/${encodeURIComponent(v.id)}?from=overview`} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-surface-2 transition-colors">
                  <Thumb src={v.thumbnail} platform={v.platform} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold truncate">{v.title || "Untitled"}</span>
                    {v.views60 > 0 && <span className="block text-[11px] text-green font-semibold tabular-nums">+{fmtInt(v.views60)} last hour</span>}
                  </span>
                  <span className="text-[13px] font-bold tabular-nums flex-shrink-0">{fmtCompact(v.views48)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

export function Thumb({ src, platform, className = "w-12 h-7" }: { src: string | null; platform: SocialPlatform; className?: string }) {
  return (
    <span className={`relative rounded-md overflow-hidden bg-surface-2 flex-shrink-0 ${className}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
      )}
      <PlatformIcon platform={platform} className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-[3px]" />
    </span>
  );
}

function MiniSkeleton() {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5" aria-hidden>
      <div className="skeleton h-4 w-40 rounded" />
      <div className="mt-4 flex gap-6">
        <div className="space-y-2">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-6 w-20 rounded" />
        </div>
        <div className="space-y-2">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-6 w-14 rounded" />
        </div>
      </div>
      <div className="skeleton h-[96px] w-full rounded-xl mt-3" />
      <div className="mt-3 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-7 w-full rounded-md" />
        ))}
      </div>
    </section>
  );
}

export function RealtimeSkeleton() {
  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5" aria-hidden>
      <div className="skeleton h-4 w-48 rounded" />
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
        <div>
          <div className="flex gap-8 mb-3">
            <div className="space-y-2">
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton h-7 w-24 rounded" />
            </div>
            <div className="space-y-2">
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton h-7 w-16 rounded" />
            </div>
          </div>
          <div className="skeleton h-[180px] w-full rounded-xl" />
        </div>
        <div className="space-y-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="skeleton w-14 h-8 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-2.5 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
