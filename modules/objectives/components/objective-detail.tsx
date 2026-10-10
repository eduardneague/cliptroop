"use client";

import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { CalendarIcon, EditIcon, FlameIcon, ShortsIcon, TrophyIcon, VideoIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { formatAmount, unitFor } from "../lib/metrics";
import type { Credit, ObjectiveView, PersonLite } from "../lib/types";
import { HistoryBars, Meter, ObjectiveIcon, StatusPill, useWhen } from "./parts";
import { byWhen, perDayWords, progressWords } from "./objective-card";
import { ONE } from "./schedule-dialog";

/*
 * One objective in full: where this period stands, every period in its
 * history (target, count, reached or missed), what counted this period,
 * and who helped (with what they did).
 */

const ROLE_WORD: Record<Credit["role"], string> = { idea: "added", script: "wrote", research: "researched", film: "filmed", edit: "edited", review: "reviewed", package: "packaged", post: "posted" };

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface-2/40 px-3 py-2.5 min-w-0">
      <div className="text-[11.5px] text-ink-soft truncate">{label}</div>
      <div className="mt-0.5 font-display text-[22px] font-semibold leading-tight tabular-nums truncate">{value}</div>
      {sub && <div className="text-[11px] text-ink-faint truncate">{sub}</div>}
    </div>
  );
}

export function ObjectiveDetail({ o, people, canEdit, onClose, onSchedule }: { o: ObjectiveView | null; people: Record<string, PersonLite>; canEdit: boolean; onClose: () => void; onSchedule: () => void }) {
  const when = useWhen();
  if (!o) return null;
  const c = o.current;
  const unit = unitFor(o.metric, c.target || o.target, o.filters);
  const past = o.history.slice(0, -1);
  const counted = past.filter((p) => p.target > 0);
  const won = counted.filter((p) => p.reached).length;
  return (
      <Dialog open={!!o} onClose={onClose} title={o.title} description={o.sentence} width="sm:max-w-3xl">
        <div className="space-y-6">
          <section>
            <div className="flex items-center gap-3 flex-wrap">
              <ObjectiveIcon icon={o.icon} platform={o.platform} color={o.color} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="font-display text-[34px] font-semibold leading-none tabular-nums">{formatAmount(o.metric, c.value)}</span>
                  <span className="text-[13px] text-ink-soft">
                    of {c.target ? formatAmount(o.metric, c.target) : "no target"} {unit} · {c.label.toLowerCase()} ({c.range})
                  </span>
                </div>
              </div>
              <StatusPill status={o.paused ? "off" : c.status} />
            </div>
            <Meter value={c.value} target={c.target} expected={c.status === "reached" ? null : c.expected} color={o.color} height={12} className="mt-3" />
            <p className="mt-2 text-[12.5px] text-ink-soft">
              {progressWords(o, when)}
              {c.status !== "reached" && c.forecast !== null && c.value > 0 && c.target > 0 ? ` At this pace: about ${formatAmount(o.metric, c.forecast)} ${byWhen(o.period, c.end)}.` : ""}
            </p>
            {c.status !== "reached" && c.target > 0 && c.expected > 0 && (
              <p className="text-[12px] text-ink-faint">
                To stay on pace it should be at about {formatAmount(o.metric, Math.round(c.expected))} by now{c.perDay && o.period !== "day" ? `, then ${perDayWords(o.metric, c.perDay)}` : ""}. The thin line on the bar marks it.
              </p>
            )}
          </section>

          <section className="grid gap-2 grid-cols-2 sm:grid-cols-4">
            <Tile
              label="In a row"
              value={
                <span className="inline-flex items-center gap-1">
                  {o.stats.streak > 0 && <FlameIcon className="w-5 h-5 text-coral" />}
                  {o.stats.streak}
                </span>
              }
              sub={`${ONE[o.period]}${o.stats.streak === 1 ? "" : "s"} reached`}
            />
            <Tile label="Best" value={formatAmount(o.metric, o.stats.best)} sub={unit} />
            <Tile label="Reached" value={`${won}/${counted.length}`} sub={`the last ${counted.length || ""} ${ONE[o.period]}${counted.length === 1 ? "" : "s"}`.replace("  ", " ")} />
            <Tile label="Average" value={o.stats.average === null ? "–" : formatAmount(o.metric, o.stats.average)} sub={`a ${ONE[o.period]}`} />
          </section>

          <section>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[13.5px] font-semibold flex-1">History</h3>
              <button type="button" onClick={onSchedule} className="rounded-lg border border-line/15 px-2.5 h-8 inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft hover:text-ink">
                <CalendarIcon className="w-3.5 h-3.5" />
                {ONE[o.period].charAt(0).toUpperCase() + ONE[o.period].slice(1)} by {ONE[o.period]}
              </button>
            </div>
            <HistoryBars periods={o.history} color={o.color} kind={o.period} metric={o.metric} height={120} />
            <div className="mt-3 rounded-xl border border-line/10 overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead className="bg-surface-2/60 text-ink-soft">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">{ONE[o.period].charAt(0).toUpperCase() + ONE[o.period].slice(1)}</th>
                    <th className="text-right font-semibold px-3 py-2">Target</th>
                    <th className="text-right font-semibold px-3 py-2">Done</th>
                    <th className="text-right font-semibold px-3 py-2 hidden sm:table-cell">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/10">
                  {[...o.history].reverse().map((p) => (
                    <tr key={p.start} className={p.reached ? "" : "text-ink-soft"}>
                      <td className="px-3 py-2">
                        <span className="font-semibold text-ink">{p.label}</span>
                        <span className="text-ink-faint hidden sm:inline"> · {p.range}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.target ? formatAmount(o.metric, p.target) : "Off"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">{formatAmount(o.metric, p.value)}</td>
                      <td className="px-3 py-2 text-right hidden sm:table-cell">
                        {p.target === 0 ? (
                          <span className="text-ink-faint">Off</span>
                        ) : p.reached ? (
                          <span className="inline-flex items-center gap-1 text-green font-semibold">
                            <TrophyIcon className="w-3.5 h-3.5" />
                            {p.reachedAt || p.reachedDay ? when(p.reachedAt, p.reachedDay) : "Reached"}
                          </span>
                        ) : p.status === "missed" ? (
                          <span className="text-ink-faint">Missed by {formatAmount(o.metric, p.target - p.value)}</span>
                        ) : (
                          <StatusPill status={p.status} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {c.contributors.length > 0 && (
            <section>
              <h3 className="text-[13.5px] font-semibold mb-2">Who helped {c.label.toLowerCase()}</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {c.contributors.map((x) => {
                  const p = people[x.memberId];
                  if (!p) return null;
                  return (
                    <li key={x.memberId} className="flex items-center gap-2.5 rounded-xl border border-line/10 px-3 py-2">
                      <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} color={p.color} className="w-8 h-8 text-[11px]" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate">{p.name}</div>
                        <div className="text-[11.5px] text-ink-faint truncate">{x.roles.map((r) => ROLE_WORD[r]).join(", ")}</div>
                      </div>
                      <span className="font-display text-[18px] font-semibold tabular-nums">{x.count}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-[13.5px] font-semibold mb-2">Counted {c.label.toLowerCase()}</h3>
            {!c.items.length ? (
              <p className="text-[12.5px] text-ink-faint">Nothing yet.</p>
            ) : (
              <ul className="rounded-xl border border-line/10 divide-y divide-line/10 overflow-hidden">
                {c.items.map((it) => {
                  const Icon = it.kind === "short" ? ShortsIcon : it.kind === "long" ? VideoIcon : null;
                  const body = (
                    <div className="flex items-center gap-2.5 px-3 py-2 min-w-0">
                      {Icon ? (
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${it.kind === "short" ? "bg-short/12 text-short" : "bg-long/12 text-long"}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-md bg-surface-2 flex-shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold truncate">
                          {it.number ? <span className="font-mono text-[11.5px] text-ink-faint mr-1">#{it.number}</span> : null}
                          {it.title}
                        </span>
                        <span className="block text-[11.5px] text-ink-faint">{when(it.at, it.day)}</span>
                      </span>
                      {it.platform && <PlatformIcon platform={it.platform} className="w-5 h-5 rounded-[5px] flex-shrink-0" />}
                      {it.kind === "day" && <span className="text-[13px] font-semibold tabular-nums">{formatAmount(o.metric, it.value)}</span>}
                      <span className="flex -space-x-1.5">
                        {it.people.slice(0, 3).map((m) =>
                          people[m] ? (
                            <span key={m} className="rounded-full ring-2 ring-surface" title={people[m].name}>
                              <PersonAvatar name={people[m].name} avatarUrl={people[m].avatarUrl} color={people[m].color} className="w-5 h-5 text-[8.5px]" />
                            </span>
                          ) : null
                        )}
                      </span>
                    </div>
                  );
                  return <li key={it.key}>{it.href ? <Link href={it.href} className="block hover:bg-surface-2/60">{body}</Link> : body}</li>;
                })}
              </ul>
            )}
          </section>

          {canEdit && (
            <div className="flex justify-end">
              <Link href={`/team?tab=objectives&edit=${o.id}`} className="rounded-lg border border-line/15 px-3 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                <EditIcon className="w-3.5 h-3.5" />
                Edit in Team settings
              </Link>
            </div>
          )}
        </div>
      </Dialog>
  );
}
