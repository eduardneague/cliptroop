"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Segmented } from "@/components/ui/segmented";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { SocialPlatform } from "@/lib/social/providers";
import type { PlatformStatus } from "../../lib/queries";
import { ago } from "../../lib/ago";
import { hourName } from "../../lib/live-math";
import { ChartCard, fmtCompact, fmtInt, Legend, StackedColumns } from "../charts";
import { Big, RealtimeHeader, RealtimeSkeleton, realtimeState, RT_ORDER, RT_PLATFORM, Thumb, useRealtime } from "../realtime-card";
import { StatusRow, SetupCard } from "./shared";

/*
 * Analytics → Realtime (1.20.0), like YouTube Studio's: views in the last
 * 48 hours hour by hour or (1.21.0: a switch) the last 60 minutes in
 * 10-minute slots, the videos getting views in that time, each account's
 * totals now (on top). Live: it updates itself whenever new counts come in
 * (every 10 minutes).
 */

type Span = "48h" | "60m";

/** A 10-minute slot ending now or a multiple of 10 minutes ago. */
const minuteName = (iso: string, now: number) => {
  const mins = Math.round((now - Date.parse(iso)) / 600_000) * 10;
  return mins <= 10 ? "The last 10 minutes" : `${mins - 10}–${mins} minutes ago`;
};

export function RealtimeTab({ teamId, status }: { teamId: string; status: PlatformStatus[] }) {
  const { data, failed, now } = useRealtime(teamId, true);
  const [only, setOnly] = useState<"all" | SocialPlatform>("all");
  // The 48 hours or the last 60 minutes (remembered on this device; read after the first paint).
  const [span, setSpanState] = useState<Span>("48h");
  useEffect(() => {
    try {
      if (window.localStorage.getItem("vp-realtime-span") === "60m") setSpanState("60m");
    } catch {}
  }, []);
  const setSpan = (v: Span) => {
    setSpanState(v);
    try {
      window.localStorage.setItem("vp-realtime-span", v);
    } catch {}
  };
  if (!status.some((s) => s.connected))
    return (
      <>
        <StatusRow status={status} />
        <SetupCard status={status} />
      </>
    );
  const state = realtimeState(data, failed);
  if (state === "loading") return <RealtimeSkeleton />;
  if (state === "failed" || state === "waiting-update" || !data)
    return (
      <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
        <RealtimeHeader updated={null} />
        <p className="text-[13px] text-ink-soft mt-2">
          {state === "failed"
            ? "Couldn’t load the realtime numbers just now. They’ll be back on their own."
            : "Every video’s numbers, refreshed every 10 minutes, start right after the latest database update has run."}
        </p>
      </section>
    );

  const connected = RT_ORDER.filter((p) => data.platforms.some((x) => x.platform === p));
  const platforms = only === "all" ? connected : connected.filter((p) => p === only);
  const sum = (m: Partial<Record<SocialPlatform, number>>) => platforms.reduce((t, p) => t + (m[p] ?? 0), 0);
  const hourly = span === "48h";
  const slots = hourly ? data.hours : data.minutes;
  const withViews = platforms.filter((p) => slots.some((h) => (h.per[p] ?? 0) > 0));
  const shownSeries = withViews.length ? withViews : platforms.slice(0, 1);
  const series = shownSeries.map((p) => ({ key: p, label: RT_PLATFORM[p].name, color: RT_PLATFORM[p].color, values: slots.map((h) => Math.round(h.per[p] ?? 0)) }));
  const top = (hourly ? data.top : data.top60.length ? data.top60 : [...data.top].filter((v) => v.views60 > 0).sort((a, b) => b.views60 - a.views60)).filter((v) => platforms.includes(v.platform));
  const waiting = !data.since;
  const young = data.since && now - Date.parse(data.since) < 48 * 3_600_000;
  const errors = data.platforms.filter((p) => p.error && platforms.includes(p.platform));
  const views = sum(hourly ? data.last48 : data.last60);
  const reactions = hourly ? data.reactions48 : data.reactions60;
  const likes = platforms.reduce((t, p) => t + (reactions[p]?.likes ?? 0), 0);
  const comments = platforms.reduce((t, p) => t + (reactions[p]?.comments ?? 0), 0);
  const words = hourly ? "last 48 hours" : "last 60 minutes";
  const accounts = data.platforms.filter((p) => platforms.includes(p.platform)).sort((a, b) => RT_ORDER.indexOf(a.platform) - RT_ORDER.indexOf(b.platform));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <RealtimeHeader updated={data.updatedAt ? ago(data.updatedAt, now) : null} />
        <span className="flex-1" />
        <Segmented<Span>
          value={span}
          onChange={setSpan}
          ariaLabel="How far back"
          options={[
            { value: "48h", label: "48 hours" },
            { value: "60m", label: "60 minutes" },
          ]}
        />
        {connected.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Platform">
            {(["all", ...connected] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={only === p}
                onClick={() => setOnly(p)}
                className={`inline-flex items-center gap-1.5 rounded-lg border h-8 text-[12px] font-semibold transition-colors ${p === "all" ? "px-3" : "pl-1 pr-2.5"} ${
                  only === p ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)] text-ink" : "border-line/15 bg-surface/50 text-ink-soft hover:text-ink"
                }`}
              >
                {p !== "all" && <PlatformIcon platform={p} className="w-6 h-6 rounded-md" />}
                {p === "all" ? "All" : RT_PLATFORM[p].name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Each account now: one compact row on top. */}
      {accounts.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="The accounts now">
          {accounts.map((p) => (
            <li key={p.platform} className="rounded-xl border border-line/10 bg-surface px-3.5 py-3 min-w-0" title={p.liveAt ? `Read ${new Date(p.liveAt).toLocaleString("en-US")}` : undefined}>
              <div className="flex items-center gap-2 min-w-0">
                <PlatformIcon platform={p.platform} className="w-6 h-6 rounded-md flex-shrink-0" />
                <span className="text-[13px] font-semibold truncate">{RT_PLATFORM[p.platform].name}</span>
                <span className="ml-auto text-[11px] text-ink-faint whitespace-nowrap">{p.liveAt ? ago(p.liveAt, now) : "not read yet"}</span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <dt className="text-[11px] text-ink-faint truncate">{RT_PLATFORM[p.platform].people[0].toUpperCase() + RT_PLATFORM[p.platform].people.slice(1)}</dt>
                  <dd className="text-[16px] font-semibold tabular-nums leading-tight">{fmtCompact(p.followers)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] text-ink-faint truncate">All views</dt>
                  <dd className="text-[16px] font-semibold tabular-nums leading-tight">{fmtCompact(p.totalViews)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] text-ink-faint truncate">Videos</dt>
                  <dd className="text-[16px] font-semibold tabular-nums leading-tight" title={p.videos !== null && p.videos > p.counted ? `${fmtInt(p.counted)} of ${fmtInt(p.videos)} counted so far` : undefined}>
                    {fmtCompact(p.videos ?? p.counted)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Tile>
          <Big label={`Views · ${words}`} value={waiting ? null : views} live={!hourly} />
        </Tile>
        <Tile>
          <Big label={`Likes · ${words}`} value={waiting ? null : likes} />
        </Tile>
        <Tile>
          <Big label={`Comments · ${words}`} value={waiting ? null : comments} />
        </Tile>
        <Tile>
          <Big label="Videos getting views" value={waiting ? null : sum(hourly ? data.active48 : data.active60)} />
        </Tile>
      </div>

      <ChartCard
        title={hourly ? "Last 48 hours" : "Last 60 minutes"}
        sub={hourly ? "Views per hour (the last bar: the hour going on now)" : "Views per 10 minutes, ending now (counts are read every 10 minutes)"}
        right={series.length > 1 ? <Legend shape="rect" items={series.map((x) => ({ key: x.key, label: x.label, color: x.color }))} /> : undefined}
      >
        {hourly ? (
          views > 0 ? (
            <StackedColumns
              ariaLabel="Views per hour over the last 48 hours"
              labels={data.hours.map((h) => new Date(h.at).toLocaleTimeString("en-US", { hour: "numeric" }))}
              tips={data.hours.map((h, i) => `${hourName(Date.parse(h.at), now)}${i === data.hours.length - 1 ? " (so far)" : ""}`)}
              series={series}
              height={260}
            />
          ) : (
            <Empty waiting={waiting} young={!!young} />
          )
        ) : data.minutes.length && data.minutes.some((m) => m.views > 0) ? (
          <StackedColumns
            ariaLabel="Views per 10 minutes over the last hour"
            labels={data.minutes.map((m, i) => (i === data.minutes.length - 1 ? "Now" : `−${(data.minutes.length - 1 - i) * 10} min`))}
            tips={data.minutes.map((m) => minuteName(m.at, now))}
            series={series}
            height={260}
          />
        ) : (
          <p className="py-16 text-center text-[13px] text-ink-faint">{data.minutes.length ? "No views in the last hour yet." : "The 10-minute slots start once the latest database update has run."}</p>
        )}
        {hourly && young && views > 0 && <p className="text-[11.5px] text-ink-faint mt-1">Realtime started {ago(data.since, now)}: the 48 hours fill in as it goes.</p>}
      </ChartCard>

      <ChartCard title="Getting views now" sub={hourly ? "The videos with the most views in the last 48 hours, and their last 60 minutes" : "The videos with the most views in the last 60 minutes"}>
        {top.length ? (
          <div className="relative overflow-x-auto styled-scroll -mx-1">
            <table className="w-full sm:min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint text-left">
                  <th className="px-1 pb-2 w-8 text-right">#</th>
                  <th className="px-2 pb-2">Video</th>
                  <th className={`px-2 pb-2 text-right ${hourly ? "hidden sm:table-cell" : ""}`}>Last 60 min</th>
                  <th className={`px-2 pb-2 text-right ${hourly ? "" : "hidden sm:table-cell"}`}>Last 48 h</th>
                  <th className="px-2 pb-2 text-right hidden sm:table-cell">Posted</th>
                </tr>
              </thead>
              <tbody>
                {top.map((v, i) => (
                  <tr key={`${v.platform}:${v.id}`} className="border-t border-line/10 hover:bg-surface-2/40">
                    <td className="px-1 py-2 text-right text-[12px] font-bold text-ink-faint tabular-nums">{i + 1}</td>
                    <td className="px-2 py-2 max-w-[22rem]">
                      <Link href={`/analytics/video/${v.platform}/${encodeURIComponent(v.id)}?from=realtime`} className="flex items-center gap-2.5 min-w-0 group">
                        <Thumb src={v.thumbnail} platform={v.platform} className="w-14 h-8" />
                        <span className="min-w-0">
                          <span className="block font-semibold truncate group-hover:underline">{v.title || "Untitled"}</span>
                          <span className="block text-[11.5px] text-ink-faint">
                            {v.kind === "short" ? "Short" : v.kind === "long" ? "Long video" : "Post"}
                            {v.ours ? ` · #${v.ours.number ?? "?"}` : ""}
                            {/* Phones: the other window and when it was posted, here. */}
                            <span className="sm:hidden">
                              {hourly ? (
                                v.views60 > 0 ? (
                                  <>
                                    {" · "}
                                    <span className="text-green font-semibold">+{fmtInt(v.views60)}</span> last hour
                                  </>
                                ) : null
                              ) : (
                                <>
                                  {" · "}
                                  {fmtInt(v.views48)} in 48 h
                                </>
                              )}
                              {v.publishedAt ? ` · ${ago(v.publishedAt, now)}` : ""}
                            </span>
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums ${hourly ? "hidden sm:table-cell" : "font-semibold"}`}>
                      {v.views60 > 0 ? <span className="font-semibold text-green">+{fmtInt(v.views60)}</span> : <span className="text-ink-faint">–</span>}
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums ${hourly ? "font-semibold" : "hidden sm:table-cell text-ink-soft"}`}>{fmtInt(v.views48)}</td>
                    <td className="px-2 py-2 text-right text-ink-soft whitespace-nowrap hidden sm:table-cell">{v.publishedAt ? ago(v.publishedAt, now) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-ink-faint">{hourly ? "No video got views in the last 48 hours yet." : "No video got views in the last 60 minutes."}</p>
        )}
      </ChartCard>

      {(errors.length > 0 || (data.reachNote && platforms.includes("youtube"))) && (
        <div className="space-y-1">
          {errors.map((p) => (
            <p key={p.platform} className="text-[12px] text-red flex items-start gap-1.5">
              <PlatformIcon platform={p.platform} className="w-4 h-4 rounded mt-px flex-shrink-0" />
              <span className="min-w-0">
                {RT_PLATFORM[p.platform].name}&rsquo;s last read didn&rsquo;t go through: {p.error}
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
      <p className="text-[12px] text-ink-faint max-w-3xl">
        Views here come from reading every video&rsquo;s count every 10 minutes (the newest and the ones getting views) and every few hours (all the others), so a burst shows up within minutes. The
        platforms&rsquo; own daily totals arrive each morning and can differ a little.
      </p>
    </div>
  );
}

function Tile({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line/10 bg-surface p-4 min-w-0">{children}</div>;
}

function Empty({ waiting, young }: { waiting: boolean; young: boolean }) {
  return (
    <p className="rounded-xl border border-dashed border-line/20 px-4 py-12 text-center text-[13px] text-ink-soft">
      {waiting
        ? "Counting starts within 10 minutes: every video is read, then the views show up here from the next read on."
        : young
          ? "The first counts are in: views show up here from the next read (every 10 minutes)."
          : "No views in the last 48 hours."}
    </p>
  );
}
