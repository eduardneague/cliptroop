"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Mascot } from "@/components/ui/mascot";
import { Segmented } from "@/components/ui/segmented";
import { LAYOUTS, LayoutSwitch, useStoredView } from "@/components/ui/table-bits";
import { useToast } from "@/components/ui/toast-provider";
import { AlertIcon, FlameIcon, GridIcon, PlusIcon, SettingsIcon, TrophyIcon } from "@/components/ui/icons";
import { addObjectivesWidget } from "@/app/(dashboard)/objectives/actions";
import { colorVar, formatAmount } from "../lib/metrics";
import { PERIODS, THIS, periodTick, timeLeft, type PeriodKind } from "../lib/periods";
import type { ObjectiveView, WinView } from "../lib/types";
import { useLiveBoard, type LiveBoard } from "./use-live-board";
import { ObjectiveCard } from "./objective-card";
import { ObjectiveDetail } from "./objective-detail";
import { ObjectiveTable } from "./objective-table";
import { ScheduleDialog } from "./schedule-dialog";
import { useNewObjective } from "./new-objective";
import { Rings, useWhen, type Ring } from "./parts";
import { StreakCard } from "./streak";

/*
 * The Objectives page: every goal of the team, live.
 *  - One overview: the rings, then each cadence (today, this week…) as a row
 *    with one segment per goal filling up in its colour; beside it (under it
 *    on smaller screens) the team's win streak in its own card (1.18.1).
 *  - One toolbar: which cadence, how it's going, a table or cards.
 *  - The goals, the ones that need a push first: a table (one row each,
 *    columns that sort; the first view) or the cards, every card the same
 *    shape (each says its cadence), so no row is left half empty.
 *  - The recent wins and the paused goals at the end.
 * ?o=<id> opens a goal (where notifications lead).
 */

type StatusFilter = "all" | "behind" | "on_track" | "reached";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const statusOf = (o: ObjectiveView): StatusFilter | null => {
  const s = o.current.status;
  return s === "reached" ? "reached" : s === "ahead" || s === "on_track" ? "on_track" : s === "behind" ? "behind" : null;
};
// The ones that need a push first, the reached ones last.
const RANK: Record<string, number> = { behind: 0, on_track: 1, ahead: 1, upcoming: 2, reached: 3, off: 4, missed: 4 };
const byNeed = (a: ObjectiveView, b: ObjectiveView) => (RANK[a.current.status] ?? 2) - (RANK[b.current.status] ?? 2);

export function ObjectivesView({
  initial,
  teamId,
  canEdit,
  openId,
  onDashboard,
  streakOnDashboard = false,
  tabs,
  startNew = false,
}: {
  /** ?new=1 (the search bar's "New objective"): the editor opens at once. */
  startNew?: boolean;
  initial: LiveBoard;
  teamId: string;
  canEdit: boolean;
  openId: string | null;
  onDashboard: boolean;
  /** The Win streak widget is on your dashboard already. */
  streakOnDashboard?: boolean;
  /** Objectives | Projections (links, from the page). */
  tabs?: React.ReactNode;
}) {
  const { board, reload } = useLiveBoard(teamId, "page", initial);
  const b = board ?? initial;
  const toast = useToast();
  const when = useWhen();
  const [cadence, setCadence] = useState<"all" | PeriodKind>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  // Opened after hydration (dialogs live in a portal, so not while rendering on the server).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ObjectiveView | null>(null);
  const [added, setAdded] = useState(onDashboard);
  const [streakAdded, setStreakAdded] = useState(streakOnDashboard);
  const [allWins, setAllWins] = useState(false);
  const [adding, startAdding] = useTransition();
  const [layout, setLayout] = useStoredView("vp-objectives-layout", LAYOUTS, "table");
  useEffect(() => setDetailId(openId), [openId]);
  const add = useNewObjective(
    teamId,
    b.objectives.map((o) => o.color),
    () => void reload()
  );
  const openNew = useRef(add.open);
  openNew.current = add.open;
  useEffect(() => {
    if (!startNew || !canEdit) return;
    openNew.current();
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("new");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch {}
  }, [startNew, canEdit]);

  const active = useMemo(() => b.objectives.filter((o) => !o.paused), [b.objectives]);
  const paused = useMemo(() => b.objectives.filter((o) => o.paused), [b.objectives]);
  const cadences = PERIODS.filter((p) => active.some((o) => o.period === p));
  const shown = active.filter((o) => (cadence === "all" || o.period === cadence) && (status === "all" || statusOf(o) === status));
  const detail = b.objectives.find((o) => o.id === detailId) ?? null;
  const counts = {
    all: active.length,
    behind: active.filter((o) => statusOf(o) === "behind").length,
    on_track: active.filter((o) => statusOf(o) === "on_track").length,
    reached: active.filter((o) => statusOf(o) === "reached").length,
  };

  const closeSchedule = useCallback(() => setSchedule(null), []);
  // Stable, so the open dialog doesn't take the focus back every time the board refreshes live.
  const closeDetail = useCallback(() => {
    setDetailId(null);
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("o")) {
        u.searchParams.delete("o");
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      }
    } catch {}
  }, []);

  function addToDashboard(type: "objectives" | "streak" = "objectives") {
    startAdding(async () => {
      const r = await addObjectivesWidget(type);
      if (r.error !== undefined) return void toast.error(r.error);
      if (type === "streak") setStreakAdded(true);
      else setAdded(true);
      toast.success(r.added ? "Added to your dashboard" : "It's already on your dashboard");
    });
  }

  const header = (
    <header className="mb-4 sm:mb-5">
      <div className="flex items-center gap-x-4 gap-y-3 flex-wrap">
        <h1 className="font-display text-[30px] sm:text-[34px] leading-none font-semibold">Objectives</h1>
        {tabs && <div className="order-last w-full sm:order-none sm:w-auto">{tabs}</div>}
        <div className="ml-auto flex items-center gap-2">
          {!added && b.objectives.length > 0 && (
            <button
              type="button"
              onClick={() => addToDashboard()}
              disabled={adding}
              title="Put it on my dashboard"
              className="hidden sm:inline-flex rounded-lg border border-line/15 px-2.5 lg:px-3 h-9 items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 disabled:opacity-60"
            >
              <GridIcon className="w-4 h-4" />
              <span className="hidden lg:inline">Put it on my dashboard</span>
            </button>
          )}
          {canEdit && b.objectives.length > 0 && (
            <Link href="/team?tab=objectives" title="Reorder, pause, copy or delete" className="rounded-lg border border-line/15 px-2.5 sm:px-3 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30">
              <SettingsIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Manage</span>
            </Link>
          )}
          {canEdit && (
            <button type="button" onClick={add.open} disabled={add.opening} className="rounded-lg bg-amber text-white px-3 sm:px-3.5 h-9 inline-flex items-center gap-1.5 text-[12.5px] font-bold hover:brightness-110 disabled:opacity-60">
              <PlusIcon className="w-4 h-4" strokeWidth={2.5} />
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New objective</span>
            </button>
          )}
        </div>
      </div>
      <p className="mt-2.5 text-[13px] text-ink-soft flex items-center gap-2">
        <span className="relative inline-flex w-2 h-2" aria-hidden>
          <span className="obj-pulse-dot absolute inset-0 rounded-[3px] bg-green/60" />
          <span className="relative w-2 h-2 rounded-[3px] bg-green" />
        </span>
        Live: they fill up as videos go out.
      </p>
    </header>
  );

  if (!b.ready)
    return (
      <div>
        {header}
        <p className="text-[13px] text-ink-soft">Objectives need the latest database update (migration 0078).</p>
      </div>
    );

  if (!b.objectives.length)
    return (
      <div>
        {header}
        <div className="rounded-2xl border border-dashed border-line/25 px-6 py-12 flex flex-col items-center text-center">
          <Mascot mood="idle" size={120} />
          <h2 className="mt-3 font-display text-[22px] font-semibold">No objectives yet</h2>
          <p className="mt-1 text-[13.5px] text-ink-soft max-w-md">
            Goals like 14 shorts a week, 3 Instagram-only reels, 2 long videos a month or a million views. They fill up live, and the whole team is congratulated when one is reached.
          </p>
          {canEdit ? (
            <button type="button" onClick={add.open} disabled={add.opening} className="mt-5 rounded-lg bg-amber text-white px-4 h-10 inline-flex items-center gap-1.5 text-[13px] font-bold hover:brightness-110 disabled:opacity-60">
              <PlusIcon className="w-4 h-4" strokeWidth={2.5} />
              Set the first one
            </button>
          ) : (
            <p className="mt-4 text-[12.5px] text-ink-faint">Masters set them.</p>
          )}
        </div>
        {add.editor}
      </div>
    );

  // ---- The overview -------------------------------------------------------
  // Today's goals first, then the week's…: rings and segments in the same order and colours.
  const ordered = [...active].sort((x, y) => PERIODS.indexOf(x.period) - PERIODS.indexOf(y.period));
  const rings: Ring[] = ordered.slice(0, 6).map((o) => ({ key: o.id, color: o.color, value: o.current.value, target: o.current.target, label: `${o.title}: ${formatAmount(o.metric, o.current.value)} of ${formatAmount(o.metric, o.current.target)}` }));
  const reachedNow = counts.reached;
  const streak = b.streak ?? null;
  const since = Date.now() - 30 * 86_400_000;
  const wins30 = streak ? streak.wins30 : b.wins.filter((w) => Date.parse(w.reachedAt) >= since).length;
  const best = [...active].sort((x, y) => y.stats.streak - x.stats.streak)[0];
  const winGroups = groupWins(b.wins.slice(0, 40)).slice(0, 15);
  const winsShown = allWins ? winGroups : winGroups.slice(0, 6);
  const sorted = [...shown].sort((x, y) => byNeed(x, y) || PERIODS.indexOf(x.period) - PERIODS.indexOf(y.period));

  return (
    <div>
      {header}

      {/* The overview (a row per cadence), and the team's win streak in its own card: beside it on wide screens, under it on the rest. */}
      <div className={`grid gap-3 mb-4 ${streak ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]" : ""}`}>
        <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0" aria-label="Overview">
          <div className="flex items-start gap-4 sm:gap-6">
            <Rings rings={rings} size={148} stroke={rings.length > 4 ? 7 : undefined} gap={rings.length > 4 ? 2 : undefined} className="hidden sm:block">
              <div className="leading-none">
                <div className="font-display text-[20px] font-semibold tabular-nums">
                  {reachedNow}/{active.length}
                </div>
                {rings.length <= 4 && <div className="text-[10px] text-ink-faint mt-0.5">reached</div>}
              </div>
            </Rings>
            <Rings rings={rings.slice(0, 4)} size={92} minHole={24} className="sm:hidden mt-0.5">
              <div className="font-display text-[15px] font-semibold tabular-nums leading-none">
                {reachedNow}/{active.length}
              </div>
            </Rings>
            {/* A row per cadence: one segment per goal, in its colour, filled as far as it got. */}
            <div className="flex-1 min-w-0 divide-y divide-line/10">
              {cadences.map((k) => {
                const list = ordered.filter((o) => o.period === k);
                const done = list.filter((o) => o.current.status === "reached").length;
                const late = list.filter((o) => o.current.status === "behind").length;
                const left = list[0]?.current.daysLeft ?? 0;
                const on = cadence === k;
                return (
                  <div key={k} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button type="button" onClick={() => setCadence(on ? "all" : k)} aria-pressed={on} className={`text-[13px] font-semibold truncate hover:underline underline-offset-2 ${on ? "text-amber" : ""}`}>
                        {cap(THIS[k])}
                      </button>
                      <span className="text-[11.5px] text-ink-faint whitespace-nowrap">{done === list.length ? "all reached" : timeLeft(k, left)}</span>
                      {late > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCadence(k);
                            setStatus("behind");
                          }}
                          className="hidden sm:inline-flex items-center gap-1 rounded-md bg-coral/12 text-coral px-1.5 h-5 text-[11px] font-bold"
                        >
                          <AlertIcon className="w-3 h-3" />
                          {late} behind
                        </button>
                      )}
                      <span className="ml-auto text-[12.5px] tabular-nums text-ink-soft whitespace-nowrap">
                        <b className="text-ink font-semibold">{done}</b> of {list.length}
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-1" role="list" aria-label={`${cap(THIS[k])}: ${done} of ${list.length} reached`}>
                      {list.map((o) => {
                        const f = o.current.target > 0 ? Math.min(1, o.current.value / o.current.target) : 0;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            role="listitem"
                            onClick={() => setDetailId(o.id)}
                            title={`${o.title}: ${formatAmount(o.metric, o.current.value)} of ${o.current.target ? formatAmount(o.metric, o.current.target) : "no target"}`}
                            aria-label={`${o.title}: ${formatAmount(o.metric, o.current.value)} of ${formatAmount(o.metric, o.current.target)}`}
                            className="relative flex-1 min-w-[18px] h-2.5 rounded-[3px] overflow-hidden hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                            style={{ background: colorVar(o.color, 0.18) }}
                          >
                            <span className="absolute inset-y-0 left-0 obj-bar-fill" style={{ width: `${f * 100}%`, background: colorVar(o.color) }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {(!streak || (best && best.stats.streak > 1)) && (
            <div className="mt-3.5 pt-3 border-t border-line/10 flex items-center gap-x-5 gap-y-1.5 flex-wrap text-[12.5px] text-ink-soft">
              {/* With a streak, the wins of the last 30 days sit under it instead. */}
              {!streak && (
                <a href="#wins" className="inline-flex items-center gap-1.5 hover:text-ink">
                  <TrophyIcon className="w-4 h-4 text-gold" />
                  <b className="text-ink font-semibold tabular-nums">{wins30}</b> {wins30 === 1 ? "win" : "wins"} in 30 days
                </a>
              )}
              {best && best.stats.streak > 1 && (
                <button type="button" onClick={() => setDetailId(best.id)} className="inline-flex items-center gap-1.5 hover:text-ink min-w-0">
                  <FlameIcon className="w-4 h-4 text-coral flex-shrink-0" />
                  <span className="truncate">
                    Longest run: <b className="text-ink font-semibold">{best.title}</b>, {best.stats.streak} in a row
                  </span>
                </button>
              )}
            </div>
          )}
        </section>

        {streak && (
          <StreakCard
            id="streak"
            s={streak}
            wins30={wins30}
            action={
              !streakAdded ? (
                <button type="button" onClick={() => addToDashboard("streak")} disabled={adding} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-faint hover:text-ink disabled:opacity-60">
                  <GridIcon className="w-3.5 h-3.5" />
                  Put it on my dashboard
                </button>
              ) : null
            }
          />
        )}
      </div>

      {/* One toolbar above everything it filters. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap" role="toolbar" aria-label="Filter objectives">
        {cadences.length > 1 && (
          <Segmented
            ariaLabel="Cadence"
            value={cadence}
            onChange={setCadence}
            options={[{ value: "all" as const, label: "All" }, ...cadences.map((k) => ({ value: k, label: cap(THIS[k]) }))]}
          />
        )}
        <Segmented
          ariaLabel="How it's going"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Any", count: counts.all },
            { value: "behind", label: "Behind", count: counts.behind, tone: "coral", disabled: !counts.behind },
            { value: "on_track", label: "On track", count: counts.on_track, disabled: !counts.on_track },
            { value: "reached", label: "Reached", count: counts.reached, tone: "green", disabled: !counts.reached },
          ]}
        />
        <LayoutSwitch value={layout} onChange={setLayout} className="ml-auto" />
      </div>

      <div className="space-y-7">
        {!shown.length && (
          <div className="rounded-2xl border border-dashed border-line/25 py-10 text-center">
            <p className="text-[13px] text-ink-soft">Nothing matches these filters.</p>
            <button type="button" onClick={() => (setCadence("all"), setStatus("all"))} className="mt-2 text-[12.5px] font-semibold text-amber">
              Show everything
            </button>
          </div>
        )}
        {shown.length > 0 &&
          (layout === "table" ? (
            <ObjectiveTable list={sorted} people={b.people} when={when} onOpen={setDetailId} />
          ) : (
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,310px),1fr))] motion-stagger">
              {sorted.map((o) => (
                <ObjectiveCard key={o.id} o={o} people={b.people} audienceReady={b.audienceReady} onOpen={() => setDetailId(o.id)} />
              ))}
            </div>
          ))}

        <section id="wins" aria-label="Recent wins" className="scroll-mt-24">
          <div className="flex items-baseline gap-2 flex-wrap mb-2.5">
            <h2 className="font-display text-[20px] font-semibold">Recent wins</h2>
            <span className="text-[12.5px] text-ink-faint">every goal reached, the last 90 days</span>
          </div>
          {!b.wins.length ? (
            <div className="rounded-2xl border border-line/10 bg-surface px-4 py-3 flex items-center gap-3">
              <Mascot mood="idle" size={48} />
              <p className="text-[12.5px] text-ink-soft">No wins yet. The first one gets confetti.</p>
            </div>
          ) : (
            <>
              <ol className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))]">
                {winsShown.map((g) => (
                  <WinTile key={`${g[0].objectiveId}:${g[0].start}`} wins={g} when={when} onOpen={() => setDetailId(g[0].objectiveId)} />
                ))}
              </ol>
              {winGroups.length > winsShown.length && (
                <button type="button" onClick={() => setAllWins(true)} className="mt-2 rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
                  Show all {winGroups.length}
                </button>
              )}
            </>
          )}
        </section>

        {paused.length > 0 && (
          <details className="group rounded-2xl border border-line/10 bg-surface">
            <summary className="cursor-pointer list-none px-4 h-11 flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
              Paused <span className="text-ink-faint tabular-nums">{paused.length}</span>
              <span className="ml-auto text-[12px] text-ink-faint group-open:hidden">Show</span>
            </summary>
            {layout === "table" ? (
              <div className="p-3 pt-0">
                <ObjectiveTable list={paused} people={b.people} when={when} onOpen={setDetailId} label="Paused objectives" />
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,310px),1fr))] p-3 pt-0">
                {paused.map((o) => (
                  <ObjectiveCard key={o.id} o={o} people={b.people} audienceReady={b.audienceReady} onOpen={() => setDetailId(o.id)} />
                ))}
              </div>
            )}
          </details>
        )}
      </div>

      <ObjectiveDetail
        o={detail}
        people={b.people}
        canEdit={canEdit}
        onClose={closeDetail}
        onSchedule={() => {
          const o = detail;
          closeDetail();
          setSchedule(o);
        }}
      />
      <ScheduleDialog open={!!schedule} onClose={closeSchedule} objective={schedule} canEdit={canEdit} />
      {add.editor}
    </div>
  );
}

/** Wins in a row of the same goal (a daily goal reached day after day) share one tile. */
function groupWins(wins: WinView[]): WinView[][] {
  const out: WinView[][] = [];
  for (const w of wins) {
    const last = out[out.length - 1];
    if (last && last[0].objectiveId === w.objectiveId) last.push(w);
    else out.push([w]);
  }
  return out;
}

function WinTile({ wins, when, onOpen }: { wins: WinView[]; when: (iso: string | null, day: string | null) => string; onOpen: () => void }) {
  const w = wins[0];
  const many = wins.length > 1;
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full h-full text-left flex items-start gap-2.5 rounded-xl border border-line/10 bg-surface px-3 py-2.5 hover:border-line/25">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: colorVar(w.color, 0.14), color: colorVar(w.color) }} aria-hidden>
          <TrophyIcon className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold truncate">{w.title}</span>
          <span className="block text-[11.5px] text-ink-soft truncate">
            {many ? `Reached ${wins.length} times · ${periodTick(w.period, wins[wins.length - 1].start)} to ${periodTick(w.period, w.start)}` : `${formatAmount(w.metric, w.value)} of ${formatAmount(w.metric, w.target)} · ${w.label}`}
          </span>
          <span className="block text-[11px] text-ink-faint truncate">
            {when(w.reachedAt, null)}
            {!w.celebratedAt ? " · already reached when set" : w.winner && (w.winner.kind === "short" || w.winner.kind === "long") && w.winner.number ? ` · #${w.winner.number} took it over` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}
