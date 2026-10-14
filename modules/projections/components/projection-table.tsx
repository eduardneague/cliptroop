"use client";

import { useMemo, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { SortTh, nextSort, type SortState } from "@/components/ui/table-bits";
import { formatValue, unitWords } from "../lib/metrics";
import type { ProjectionView } from "../lib/types";
import { leftWords } from "./projection-card";
import { fmtDay, ProgressTrack, ProjIcon, ProjStatusPill } from "./parts";

/*
 * Projections as a table (1.18.0, the first view): one row each with the
 * value now against the target, how far it's come (with where an even pace
 * would be), how it's going, where it's heading at this pace and the
 * deadline. Columns sort when you click them; a row opens it, Compare is
 * right there. Phones get the same rows as a list.
 */

type Key = "need" | "title" | "progress" | "deadline";
const NEED: Record<string, number> = { behind: 0, new: 1, waiting: 1, on_track: 2, ahead: 3, reached: 4, done: 5, missed: 5 };

function sorter(key: Key): (a: ProjectionView, b: ProjectionView) => number {
  switch (key) {
    case "title":
      return (a, b) => a.title.localeCompare(b.title);
    case "progress":
      return (a, b) => (a.a.progress ?? -1) - (b.a.progress ?? -1);
    case "deadline":
      return (a, b) => a.deadline.localeCompare(b.deadline);
    default:
      return (a, b) => (NEED[a.a.status] ?? 2) - (NEED[b.a.status] ?? 2) || a.deadline.localeCompare(b.deadline);
  }
}

/** Where it's heading, in a few words: "≈ 43% by Dec 4", "There around Nov 29", "Reached Oct 3". */
export function headingShort(p: ProjectionView, currency?: string): { text: string; tone: "good" | "bad" | "plain" } {
  const fmt = (v: number) => formatValue(p.metric, v, { currency });
  const s = p.a.status;
  if (s === "reached") return { text: p.achievedAt ? `Reached ${fmtDay(p.achievedAt.slice(0, 10))}` : "Reached", tone: "good" };
  if (s === "done") return { text: "Ended on target", tone: "good" };
  if (s === "missed") return { text: `Ended at ${p.endedValue !== null ? fmt(p.endedValue) : p.current !== null ? fmt(p.current) : "–"}`, tone: "plain" };
  if (s === "waiting") return { text: "No numbers yet", tone: "plain" };
  if (s === "new") return { text: "Too early to tell", tone: "plain" };
  if (p.a.eta && p.a.eta <= p.deadline) return { text: `There around ${fmtDay(p.a.eta)}`, tone: "good" };
  if (p.a.forecast !== null) return { text: `About ${fmt(p.a.forecast)} by ${fmtDay(p.deadline)}`, tone: s === "behind" ? "bad" : "plain" };
  return { text: "–", tone: "plain" };
}

const toneCls = { good: "text-green", bad: "text-coral", plain: "text-ink-soft" } as const;

export function ProjectionTable({ list, currency, onOpen, onCompare }: { list: ProjectionView[]; currency: string; onOpen: (id: string) => void; onCompare: (id: string) => void }) {
  const [sort, setSort] = useState<SortState<Key>>({ key: "need", dir: 1 });
  const rows = useMemo(() => {
    const by = sorter(sort.key);
    return [...list].sort((a, b) => sort.dir * by(a, b));
  }, [list, sort]);
  const onSort = (k: Key) => setSort((s) => nextSort(s, k, k === "title" || k === "deadline" ? 1 : -1));
  const fmtOf = (p: ProjectionView) => (v: number) => formatValue(p.metric, v, { currency });
  const pctOf = (p: ProjectionView) => (p.a.progress === null ? null : Math.min(100, Math.round(Math.max(0, p.a.progress) * 100)));

  return (
    <>
      <ul className="md:hidden rounded-2xl border border-line/10 bg-surface divide-y divide-line/10 overflow-hidden" aria-label="Projections">
        {rows.map((p) => {
          const fmt = fmtOf(p);
          const pct = pctOf(p);
          const h = headingShort(p, currency);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onOpen(p.id)} className={`w-full text-left px-3.5 py-3 hover:bg-surface-2/50 active:bg-surface-2 ${p.archived ? "opacity-70" : ""}`}>
                <span className="flex items-center gap-2.5 min-w-0">
                  <ProjIcon p={p} size="sm" />
                  <span className="text-[13.5px] font-semibold truncate flex-1 min-w-0">{p.title}</span>
                  <ProjStatusPill status={p.a.status} />
                </span>
                <span className="mt-2 flex items-center gap-2.5">
                  <ProgressTrack p={p} height={6} className="flex-1" />
                  <span className="text-[12px] tabular-nums text-ink-soft whitespace-nowrap">
                    <b className="text-ink font-semibold">{p.current === null ? "–" : fmt(p.current)}</b> of {fmt(p.target)}
                  </span>
                </span>
                <span className="mt-1.5 flex items-center gap-1.5 text-[11.5px] min-w-0">
                  <span className={`truncate ${toneCls[h.tone]}`}>{h.text}</span>
                  <span className="ml-auto text-ink-faint whitespace-nowrap flex-shrink-0">
                    {pct !== null ? `${pct}% · ` : ""}
                    {leftWords(p)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="hidden md:block rounded-2xl border border-line/10 bg-surface overflow-hidden">
        <table className="w-full text-[13px]" aria-label="Projections">
          <thead>
            <tr className="bg-surface-2 text-[10.5px] text-ink-faint">
              <SortTh k="title" sort={sort} onSort={onSort} title="Sort by name">
                Projection
              </SortTh>
              <SortTh k="progress" sort={sort} onSort={onSort} title="Of the way from where it started to the target" className="w-[240px]">
                Now
              </SortTh>
              <SortTh k="need" sort={sort} onSort={onSort} title="The ones that need a push first" className="w-[130px]">
                Status
              </SortTh>
              <th scope="col" className="hidden lg:table-cell px-3 py-2 text-left font-bold uppercase tracking-wide w-[190px]">
                At this pace
              </th>
              <SortTh k="deadline" sort={sort} onSort={onSort} title="Sort by deadline" className="hidden xl:table-cell w-[150px]">
                Deadline
              </SortTh>
              <th scope="col" className="w-[110px]" aria-label="Compare and open" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const fmt = fmtOf(p);
              const pct = pctOf(p);
              const h = headingShort(p, currency);
              const unit = unitWords(p.metric, p.target, p.scope);
              return (
                <tr key={p.id} onClick={() => onOpen(p.id)} className={`group border-t border-line/10 cursor-pointer hover:bg-surface-2/50 ${p.archived ? "opacity-70" : ""}`}>
                  <td className="px-3 py-2.5 max-w-0">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <ProjIcon p={p} size="sm" />
                      <span className="min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(p.id);
                          }}
                          className="block max-w-full truncate text-left font-semibold hover:underline underline-offset-2 decoration-line/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-[3px]"
                          title={p.title}
                        >
                          {p.title}
                        </button>
                        <span className="block text-[11.5px] text-ink-faint truncate" title={p.sentence}>
                          {p.sentence}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-baseline gap-1 text-[12.5px] tabular-nums whitespace-nowrap min-w-0">
                      <b className="font-semibold">{p.current === null ? "–" : fmt(p.current)}</b>
                      <span className="text-ink-soft truncate">
                        of {fmt(p.target)}
                        {unit ? ` ${unit}` : ""}
                      </span>
                      {pct !== null && <span className="ml-auto text-[11.5px] font-semibold text-ink-faint">{pct}%</span>}
                    </span>
                    <ProgressTrack p={p} height={6} className="mt-1.5" />
                  </td>
                  <td className="px-3 py-2.5">
                    <ProjStatusPill status={p.a.status} />
                  </td>
                  <td className={`hidden lg:table-cell px-3 py-2.5 text-[12.5px] ${toneCls[h.tone]}`}>
                    <span className="block truncate max-w-[180px]" title={h.text}>
                      {h.text}
                    </span>
                  </td>
                  <td className="hidden xl:table-cell px-3 py-2.5 whitespace-nowrap">
                    <span className="block text-[12.5px]">{fmtDay(p.deadline, true)}</span>
                    <span className="block text-[11.5px] text-ink-faint">{leftWords(p)}</span>
                  </td>
                  <td className="pr-3 py-2.5">
                    <span className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCompare(p.id);
                        }}
                        className="rounded-md border border-line/15 px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 bg-surface"
                      >
                        Compare
                      </button>
                      <ChevronRightIcon className="w-4 h-4 text-ink-faint group-hover:text-ink" />
                    </span>
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
