"use client";

import { useMemo, useState } from "react";
import { ChevronRightIcon, FlameIcon, TrophyIcon } from "@/components/ui/icons";
import { SortTh, nextSort, type SortState } from "@/components/ui/table-bits";
import { formatAmount, unitFor } from "../lib/metrics";
import { PERIODS, THIS, timeLeft } from "../lib/periods";
import type { ObjectiveView, PersonLite } from "../lib/types";
import { Meter, ObjectiveIcon, PeopleStack, StatusPill, unjudged } from "./parts";

/*
 * Objectives as a table (1.18.0, the page's first view): one row per goal
 * with its count against the target and the pace mark, how it's going, the
 * time left, how many periods in a row it was reached and who helped.
 * Columns sort when you click them; a row opens the goal. Phones get the
 * same rows as a list (the count, the bar and one line of words).
 */

type Key = "need" | "title" | "progress" | "left" | "streak" | "reached";

// The ones that need a push first, the reached ones last (the page's order).
const RANK: Record<string, number> = { behind: 0, on_track: 1, ahead: 1, upcoming: 2, reached: 3, off: 4, missed: 4 };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Periods since the goal was set, before the current one, that were reached (and how many there were). */
export function pastReached(o: ObjectiveView) {
  const past = o.history.slice(0, -1).filter((p) => p.target > 0 && !unjudged(p));
  return { reached: past.filter((p) => p.reached).length, of: past.length };
}

const fraction = (o: ObjectiveView) => (o.current.target > 0 ? o.current.value / o.current.target : 0);

function sorter(key: Key): (a: ObjectiveView, b: ObjectiveView) => number {
  switch (key) {
    case "title":
      return (a, b) => a.title.localeCompare(b.title);
    case "progress":
      return (a, b) => fraction(a) - fraction(b);
    case "left":
      return (a, b) => a.current.daysLeft - b.current.daysLeft || PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period);
    case "streak":
      return (a, b) => a.stats.streak - b.stats.streak;
    case "reached": {
      const r = (o: ObjectiveView) => {
        const p = pastReached(o);
        return p.of ? p.reached / p.of : -1;
      };
      return (a, b) => r(a) - r(b);
    }
    default:
      return (a, b) => (RANK[a.current.status] ?? 2) - (RANK[b.current.status] ?? 2) || PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period);
  }
}

/** "This week · 6 days left", "Today · until midnight", "Reached Mon 20:38". */
function whenWords(o: ObjectiveView, when: (iso: string | null, day: string | null) => string) {
  const c = o.current;
  if (o.paused) return { top: cap(THIS[o.period]), sub: "Paused" };
  if (c.target === 0) return { top: cap(THIS[o.period]), sub: "Off" };
  if (c.status === "reached") return { top: cap(THIS[o.period]), sub: c.reachedAt || c.reachedDay ? `Reached ${when(c.reachedAt, c.reachedDay)}` : "Reached" };
  return { top: cap(THIS[o.period]), sub: c.daysLeft ? timeLeft(o.period, c.daysLeft) : "" };
}

export function ObjectiveTable({
  list,
  people,
  when,
  onOpen,
  label = "Objectives",
}: {
  list: ObjectiveView[];
  people: Record<string, PersonLite>;
  when: (iso: string | null, day: string | null) => string;
  onOpen: (id: string) => void;
  label?: string;
}) {
  const [sort, setSort] = useState<SortState<Key>>({ key: "need", dir: 1 });
  const rows = useMemo(() => {
    const by = sorter(sort.key);
    return [...list].sort((a, b) => sort.dir * by(a, b));
  }, [list, sort]);
  const onSort = (k: Key) => setSort((s) => nextSort(s, k, k === "title" || k === "left" ? 1 : -1));

  return (
    <>
      {/* Phones: rows of the same things, as a list. */}
      <ul className="md:hidden rounded-2xl border border-line/10 bg-surface divide-y divide-line/10 overflow-hidden" aria-label={label}>
        {rows.map((o) => {
          const c = o.current;
          const w = whenWords(o, when);
          const unit = unitFor(o.metric, c.target || o.target, o.filters);
          return (
            <li key={o.id}>
              <button type="button" onClick={() => onOpen(o.id)} className={`w-full text-left px-3.5 py-3 hover:bg-surface-2/50 active:bg-surface-2 ${o.paused ? "opacity-70" : ""}`}>
                <span className="flex items-center gap-2.5 min-w-0">
                  <ObjectiveIcon icon={o.icon} platform={o.platform} color={o.color} size="sm" />
                  <span className="text-[13.5px] font-semibold truncate flex-1 min-w-0">{o.title}</span>
                  <StatusPill status={o.paused ? "off" : c.status} />
                </span>
                <Meter value={c.value} target={c.target} expected={c.status === "reached" ? null : c.expected} color={o.color} height={6} className="mt-2.5" />
                <span className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-faint min-w-0">
                  <span className="truncate">
                    <b className="text-ink font-semibold tabular-nums">{formatAmount(o.metric, c.value)}</b>
                    <span className="text-ink-soft">
                      {" "}
                      of {c.target ? formatAmount(o.metric, c.target) : "–"} {unit}
                    </span>
                    {` · ${w.top}`}
                    {w.sub ? ` · ${w.sub}` : ""}
                  </span>
                  {o.stats.streak > 0 && (
                    <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-ink-soft flex-shrink-0">
                      <FlameIcon className="w-3.5 h-3.5 text-coral" />
                      {o.stats.streak}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Bigger screens: the table (columns join in as there's room). */}
      <div className="hidden md:block rounded-2xl border border-line/10 bg-surface overflow-hidden">
        <table className="w-full text-[13px]" aria-label={label}>
          <thead>
            <tr className="bg-surface-2 text-[10.5px] text-ink-faint">
              <SortTh k="title" sort={sort} onSort={onSort} title="Sort by name">
                Objective
              </SortTh>
              <SortTh k="progress" sort={sort} onSort={onSort} title="Sort by how far along" className="w-[230px]">
                Progress
              </SortTh>
              <SortTh k="need" sort={sort} onSort={onSort} title="The ones that need a push first" className="w-[120px]">
                Status
              </SortTh>
              <SortTh k="left" sort={sort} onSort={onSort} title="Sort by time left" className="hidden lg:table-cell w-[150px]">
                Time left
              </SortTh>
              <SortTh k="streak" sort={sort} onSort={onSort} title="Periods in a row it was reached" className="hidden xl:table-cell w-[100px]">
                In a row
              </SortTh>
              <SortTh k="reached" sort={sort} onSort={onSort} title="Periods reached since it was set" className="hidden xl:table-cell w-[100px]">
                Reached
              </SortTh>
              <th scope="col" className="hidden 2xl:table-cell px-3 py-2 text-left font-bold uppercase tracking-wide w-[130px]">
                Who helped
              </th>
              <th scope="col" className="w-9" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const c = o.current;
              const w = whenWords(o, when);
              const unit = unitFor(o.metric, c.target || o.target, o.filters);
              const past = pastReached(o);
              const reached = c.status === "reached";
              return (
                <tr key={o.id} onClick={() => onOpen(o.id)} className={`group border-t border-line/10 cursor-pointer hover:bg-surface-2/50 ${o.paused ? "opacity-70" : ""}`}>
                  <td className="px-3 py-2.5 max-w-0">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <ObjectiveIcon icon={o.icon} platform={o.platform} color={o.color} size="sm" />
                      <span className="min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(o.id);
                          }}
                          className="block max-w-full truncate text-left font-semibold hover:underline underline-offset-2 decoration-line/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-[3px]"
                          title={o.title}
                        >
                          {o.title}
                        </button>
                        <span className="block text-[11.5px] text-ink-faint truncate" title={o.sentence}>
                          {o.sentence}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-baseline gap-1 text-[12.5px] tabular-nums whitespace-nowrap">
                      <b className="font-semibold">{formatAmount(o.metric, c.value)}</b>
                      <span className="text-ink-soft truncate">
                        of {c.target ? formatAmount(o.metric, c.target) : "no target"} {unit}
                      </span>
                      {reached && <TrophyIcon className="w-3.5 h-3.5 text-gold self-center flex-shrink-0" />}
                    </span>
                    <Meter value={c.value} target={c.target} expected={reached ? null : c.expected} color={o.color} height={6} className="mt-1.5" />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={o.paused ? "off" : c.status} />
                  </td>
                  <td className="hidden lg:table-cell px-3 py-2.5 whitespace-nowrap">
                    <span className="block text-[12.5px]">{w.top}</span>
                    <span className={`block text-[11.5px] ${c.status === "behind" ? "text-coral" : "text-ink-faint"}`}>{w.sub || " "}</span>
                  </td>
                  <td className="hidden xl:table-cell px-3 py-2.5 whitespace-nowrap">
                    {o.stats.streak > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <FlameIcon className="w-4 h-4 text-coral" />
                        {o.stats.streak}
                      </span>
                    ) : (
                      <span className="text-ink-faint">–</span>
                    )}
                  </td>
                  <td className="hidden xl:table-cell px-3 py-2.5 whitespace-nowrap tabular-nums text-ink-soft">
                    {past.of ? (
                      <>
                        <b className="text-ink font-semibold">{past.reached}</b> of {past.of}
                      </>
                    ) : (
                      <span className="text-ink-faint">–</span>
                    )}
                  </td>
                  <td className="hidden 2xl:table-cell px-3 py-2.5">
                    {c.contributors.length ? <PeopleStack contributors={c.contributors} people={people} max={4} size="w-6 h-6 text-[9.5px]" /> : <span className="text-ink-faint">–</span>}
                  </td>
                  <td className="pr-3 py-2.5 text-ink-faint group-hover:text-ink">
                    <ChevronRightIcon className="w-4 h-4" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
