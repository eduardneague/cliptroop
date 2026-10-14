"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadRealtime } from "@/app/(dashboard)/analytics/actions";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { SocialPlatform } from "@/lib/social/providers";
import type { Realtime } from "../lib/realtime";
import { ago } from "../lib/ago";
import { hourName } from "../lib/live-math";
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

/** The realtime numbers, kept fresh. `full`: the Realtime tab's (10-minute slots, the top 25). */
export function useRealtime(teamId: string, full = false) {
  const [data, setData] = useState<Realtime | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await loadRealtime(teamId, full);
      if (r) {
        setData(r);
        setFailed(false);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setNow(Date.now());
    }
  }, [teamId, full]);

  useEffect(() => {
    void load();
    const soon = (ms = 1500) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), ms);
    };
    // New counts: the job writes live_at on analytics_syncs when it's done with a platform.
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${teamId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "analytics_syncs", filter: `team_id=eq.${teamId}` }, () => soon())
      .subscribe();
    const every = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 120_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") soon(200);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) clearTimeout(timer.current);
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
              <span className="block font-display text-[21px] font-semibold leading-tight tabular-nums mt-0.5">{fmtInt(p.followers)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Views · 48 hours</div>
          <div className="font-display text-[30px] sm:text-[34px] leading-none font-semibold tabular-nums mt-1.5">{waiting ? "–" : fmtInt(sum(data.last48))}</div>
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
            tips={data.hours.map((h, i) => `${hourName(Date.parse(h.at), now)}${i === data.hours.length - 1 ? " (so far)" : ""}`)}
            series={[{ key: "views", label: "Views", color: platforms.length === 1 ? RT_PLATFORM[platforms[0]].color : "rgb(var(--amber))", values }]}
            height={128}
          />
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
