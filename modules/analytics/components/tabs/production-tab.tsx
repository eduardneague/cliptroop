"use client";

import Link from "next/link";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Mascot } from "@/components/ui/mascot";
import { type Window } from "../../lib/ranges";
import { BarList, ChartCard, fmtInt, Legend, StackedColumns, StatTile } from "../charts";
import { PLATFORM, type P, SHORT_COLOR, LONG_COLOR, niceDay, fmtDays, fmtPct } from "./shared";
import type { Production } from "../../lib/queries";

/* Analytics → Production: how the work flows (our own numbers, no platform needed). */

export function ProductionTab({ p, compare, w }: { p: Production; compare: boolean; w: Window }) {
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
              <div className="overflow-x-auto overscroll-x-contain -mx-1">
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
                        <PlatformIcon platform={x.platform as P} className="w-7 h-7 rounded-lg" />
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
