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
import { fmtCompact, fmtInt, Legend, StackedColumns } from "./charts";

/*
 * Analytics → Audience's Realtime card (1.19.0): views over the last 48
 * hours, hour by hour, and in the last 60 minutes, the videos getting views
 * right now, and each account's totals now. From the counts the 10-minute
 * job keeps; it refreshes itself whenever the job has read new counts
 * (realtime on analytics_syncs), and every 2 minutes while it's open.
 */

const PLATFORM: Record<SocialPlatform, { name: string; color: string; people: string }> = {
  youtube: { name: "YouTube", color: "rgb(var(--chart-yt))", people: "subscribers" },
  instagram: { name: "Instagram", color: "rgb(var(--chart-ig))", people: "followers" },
  tiktok: { name: "TikTok", color: "rgb(var(--chart-tt))", people: "followers" },
  facebook: { name: "Facebook", color: "rgb(var(--chart-fb))", people: "followers" },
};
const ORDER: SocialPlatform[] = ["youtube", "tiktok", "instagram", "facebook"];

/** `only`: the platforms picked on the Audience tab (none: every connected one). */
export function RealtimeCard({ teamId, only }: { teamId: string; only?: SocialPlatform[] }) {
  const [data, setData] = useState<Realtime | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await loadRealtime(teamId);
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
  }, [teamId]);

  useEffect(() => {
    void load();
    const soon = (ms = 1500) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), ms);
    };
    // New counts: the job writes live_at on analytics_syncs when it's done with a platform.
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime-card:${teamId}:${Math.random().toString(36).slice(2, 8)}`)
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

  if (!data) {
    if (failed)
      return (
        <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
          <Header updated={null} />
          <p className="text-[13px] text-ink-soft mt-2">Couldn&rsquo;t load the realtime numbers just now. They&rsquo;ll be back on their own.</p>
        </section>
      );
    return <RealtimeSkeleton />;
  }
  if (!data.ready)
    return (
      <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
        <Header updated={null} />
        <p className="text-[13px] text-ink-soft mt-2">Every video&rsquo;s numbers, refreshed every 10 minutes, start right after the latest database update (0083) has run.</p>
      </section>
    );

  const platforms = ORDER.filter((p) => data.platforms.some((x) => x.platform === p) && (!only?.length || only.includes(p)));
  const withViews = platforms.filter((p) => data.hours.some((h) => (h.per[p] ?? 0) > 0));
  const total = (m: Partial<Record<SocialPlatform, number>>) => platforms.reduce((t, p) => t + (m[p] ?? 0), 0);
  const last48 = total(data.last48);
  const last60 = total(data.last60);
  const top = data.top.filter((v) => platforms.includes(v.platform));
  const labels = data.hours.map((h) => new Date(h.at).toLocaleTimeString("en-US", { hour: "numeric" }));
  const tips = data.hours.map((h, i) => `${hourName(Date.parse(h.at), now)}${i === data.hours.length - 1 ? " (so far)" : ""}`);
  const series = (withViews.length ? withViews : platforms.slice(0, 1)).map((p) => ({ key: p, label: PLATFORM[p].name, color: PLATFORM[p].color, values: data.hours.map((h) => Math.round(h.per[p] ?? 0)) }));
  const young = data.since && now - Date.parse(data.since) < 48 * 3_600_000;
  const empty = !last48 && !top.length;
  // No counts kept yet: the 10-minute job hasn't read anything (just after the update).
  const waiting = !data.since;
  const errors = data.platforms.filter((p) => p.error && platforms.includes(p.platform));

  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0" aria-label="Realtime">
      <Header updated={ago(data.updatedAt, now)} />
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
        <div className="min-w-0">
          <div className="flex items-end gap-x-8 gap-y-3 flex-wrap mb-3">
            <Big label="Views · last 48 hours" value={waiting ? null : last48} />
            <Big label="Views · last 60 minutes" value={waiting ? null : last60} live />
            {platforms.length > 1 && withViews.length > 1 && (
              <div className="ml-auto">
                <Legend shape="rect" items={withViews.map((p) => ({ key: p, label: PLATFORM[p].name, color: PLATFORM[p].color }))} />
              </div>
            )}
          </div>
          {empty ? (
            <p className="rounded-xl border border-dashed border-line/20 px-4 py-8 text-center text-[13px] text-ink-soft">
              {waiting
                ? "Counting starts within 10 minutes: every video is read, then the views show up here from the next read on."
                : young
                  ? "The first counts are in: views show up here from the next read (every 10 minutes)."
                  : "No views in the last 48 hours."}
            </p>
          ) : (
            <StackedColumns ariaLabel="Views per hour over the last 48 hours" labels={labels} tips={tips} series={series} height={180} />
          )}
          {young && !empty && <p className="text-[11.5px] text-ink-faint mt-1">Realtime started {ago(data.since, now)}: the 48 hours fill in as it goes.</p>}
        </div>
        <div className="min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">Getting views now</h3>
          {top.length ? (
            <ol className="space-y-1">
              {top.slice(0, 6).map((v, i) => (
                <li key={`${v.platform}:${v.id}`}>
                  <Link href={`/analytics/video/${v.platform}/${encodeURIComponent(v.id)}?from=audience`} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 -mx-1.5 hover:bg-surface-2 transition-colors">
                    <span className="w-4 text-[11px] font-bold text-ink-faint tabular-nums text-right flex-shrink-0">{i + 1}</span>
                    <span className="relative w-14 h-8 rounded-md overflow-hidden bg-surface-2 flex-shrink-0">
                      {v.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      )}
                      <PlatformIcon platform={v.platform} className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-[3px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold truncate">{v.title || "Untitled"}</span>
                      <span className="block text-[11px] text-ink-faint tabular-nums">
                        {v.views60 > 0 ? (
                          <>
                            <span className="text-green font-semibold">+{fmtInt(v.views60)}</span> in the last hour
                          </>
                        ) : (
                          "quiet in the last hour"
                        )}
                      </span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block text-[13px] font-bold tabular-nums">{fmtCompact(v.views48)}</span>
                      <span className="block text-[10.5px] text-ink-faint">48 h</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12.5px] text-ink-faint">No video got views in the last 48 hours yet.</p>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-line/10 flex items-center gap-x-5 gap-y-2 flex-wrap text-[12px]">
        {data.platforms
          .filter((p) => platforms.includes(p.platform))
          .sort((a, b) => ORDER.indexOf(a.platform) - ORDER.indexOf(b.platform))
          .map((p) => (
            <span key={p.platform} className="inline-flex items-center gap-1.5 text-ink-soft" title={p.liveAt ? `Read ${new Date(p.liveAt).toLocaleString("en-US")}` : undefined}>
              <PlatformIcon platform={p.platform} className="w-4 h-4 rounded" />
              {p.followers !== null && (
                <>
                  <b className="text-ink tabular-nums">{fmtCompact(p.followers)}</b> {PLATFORM[p.platform].people}
                  <span aria-hidden className="text-ink-faint">·</span>
                </>
              )}
              <span className="tabular-nums">
                {p.videos !== null && p.videos > p.counted ? `${fmtInt(p.counted)} of ${fmtInt(p.videos)} videos counted` : `${fmtInt(p.counted)} videos`}
              </span>
            </span>
          ))}
      </div>
      {(errors.length > 0 || (data.reachNote && platforms.includes("youtube"))) && (
        <div className="mt-2 space-y-1">
          {errors.map((p) => (
            <p key={p.platform} className="text-[12px] text-red flex items-start gap-1.5">
              <PlatformIcon platform={p.platform} className="w-4 h-4 rounded mt-px flex-shrink-0" />
              <span className="min-w-0">
                {PLATFORM[p.platform].name}&rsquo;s last read didn&rsquo;t go through: {p.error}
              </span>
            </p>
          ))}
          {data.reachNote && platforms.includes("youtube") && (
            <p className="text-[12px] text-ink-soft flex items-start gap-1.5">
              <PlatformIcon platform="youtube" className="w-4 h-4 rounded mt-px flex-shrink-0" />
              <span className="min-w-0">{data.reachNote}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Header({ updated }: { updated: string | null }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="relative flex w-2.5 h-2.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-60 animate-ping" />
        <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-green" />
      </span>
      <h2 className="text-[14.5px] font-semibold">Realtime</h2>
      <span className="text-[12px] text-ink-faint">{updated ? `Updated ${updated} · every video, every 10 minutes` : "Every video, every 10 minutes"}</span>
    </div>
  );
}

function Big({ label, value, live = false }: { label: string; value: number | null; live?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`font-display text-[30px] leading-none font-semibold tabular-nums mt-1 ${live && value !== null ? "text-green" : ""}`}>{fmtInt(value)}</div>
    </div>
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
